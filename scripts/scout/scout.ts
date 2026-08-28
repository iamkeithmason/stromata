/**
 * Scout — scheduled corpus gap analysis for The Stromata.
 *
 * Reads the corpus (Supabase, SELECT only) and the Content Prospect List
 * (Notion, read), builds a coverage map, and asks a single Sonnet agent to
 * propose gap-filling authors/works. Every proposal passes through the
 * PreToolUse contract hook before it can become a provisional Notion row.
 *
 *   --dry-run   (default) write nothing; print the batch + full skip log
 *   --apply     create the rows
 *   --max N     cap proposals this run (default 10)
 *
 * Sealed by design: the agent's only tool is `propose_prospect`; no bash, no
 * filesystem, no web, no project settings inherited.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

import {
  DEFAULT_MAX_PROPOSALS,
  MODELS,
  NOTION_ERAS,
  NOTION_GENRES,
  NOTION_TRADITIONS,
  PROVISIONAL_STATUS,
} from './config';
import { buildCoverageMap } from './corpus';
import {
  createProspect,
  fetchExistingProspects,
  fetchSchema,
  assertToken,
} from './notion';
import { scoreProposal } from './scoring';
import {
  PROPOSE_TOOL,
  createEnforcementHook,
  createRunState,
  toProposalInput,
} from './hook';
import { buildPrompt } from './prompt';
import { appendStepSummary, renderReport, writeRunLog } from './report';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

// ---------------------------------------------------------------------------
// Arg parsing — dry-run is the default (matches the normalisation scripts).
// ---------------------------------------------------------------------------

interface Args {
  dryRun: boolean;
  max: number;
}

function parseArgs(argv: string[]): Args {
  let dryRun = true;
  let max = DEFAULT_MAX_PROPOSALS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') dryRun = false;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--max') max = Number(argv[++i]);
    else if (a.startsWith('--max=')) max = Number(a.slice('--max='.length));
  }
  if (!Number.isFinite(max) || max < 1) max = DEFAULT_MAX_PROPOSALS;
  return { dryRun, max };
}

// ---------------------------------------------------------------------------
// Reconcile-first — verify config vocab is a subset of the live schema and warn
// on drift before writing anything.
// ---------------------------------------------------------------------------

async function reconcile(): Promise<void> {
  const schema = await fetchSchema();
  const missing = (label: string, want: readonly string[], have: string[]) => {
    const gaps = want.filter((w) => !have.includes(w));
    if (gaps.length) {
      console.warn(`  ! ${label}: config values not in live schema: ${gaps.join(', ')}`);
    }
  };
  missing('Tradition', NOTION_TRADITIONS, schema.traditionOptions);
  missing('Era', NOTION_ERAS, schema.eraOptions);
  missing('Genre', NOTION_GENRES, schema.genreOptions);

  if (!schema.statusOptions.includes(PROVISIONAL_STATUS)) {
    console.warn(
      `  · Status option "${PROVISIONAL_STATUS}" not present yet — Notion will ` +
        `auto-create it on the first proposal (expected on first run).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — the Scout agent cannot run.');
  }
  assertToken();

  console.log(`Scout starting — mode: ${args.dryRun ? 'DRY-RUN' : 'APPLY'}, cap: ${args.max}`);

  console.log('Reconciling against live Notion schema…');
  await reconcile();

  console.log('Building coverage map from Supabase (read-only)…');
  const coverage = await buildCoverageMap();
  console.log(
    `  ${coverage.totalPublished} published texts · ` +
      `${coverage.coveredAuthors.size} authors · ${coverage.gaps.length} priority gaps`,
  );

  console.log('Fetching existing prospects for dedupe…');
  const existing = await fetchExistingProspects();
  console.log(`  ${existing.length} existing prospect rows`);

  const state = createRunState({
    dryRun: args.dryRun,
    maxProposals: args.max,
    coverage,
    existing,
  });
  const runDate = new Date().toISOString().split('T')[0];

  // The single create tool. Reached ONLY when the hook allows (apply-mode,
  // gate-passed); in dry-run the hook denies before the handler runs.
  const proposeTool = tool(
    'propose_prospect',
    'Propose ONE provisional gap-filling text as a Content Prospect List row. ' +
      'Status is stamped provisional automatically; you cannot publish or approve.',
    {
      title: z.string().describe('Display title, "Author — Work".'),
      author: z.string(),
      work: z.string().describe('The work title on its own.'),
      tradition: z.string().describe(`One of: ${NOTION_TRADITIONS.join(', ')}`),
      era: z.string().describe(`One of: ${NOTION_ERAS.join(', ')}`),
      genre: z.string().optional().describe(`Optional, one of: ${NOTION_GENRES.join(', ')}`),
      deathYear: z.number().nullable().optional().describe("Author's death year if known."),
      impact: z.number().describe('1–5, editorial priority × search gravity.'),
      confidence: z.number().describe('1–5, sureness a PD sourceable form exists.'),
      ease: z.number().describe('1–5, clean source availability / length / low translation risk.'),
      tier1: z.boolean().describe('Is the author a recognisable named search-driver?'),
      rationale: z.string().describe('One line: which gap this fills and why now.'),
      discoveryNote: z.string().describe('One line: is the author a Tier-1 search-driver?'),
      candidateSources: z.array(z.string()).describe('Unverified URL hint(s) where the text might be sourced.'),
      copyrightFlag: z.enum(['likely-clear', 'needs-check', 'trap-adjacent']),
      copyrightReason: z.string().describe('One line justifying the copyright flag.'),
    },
    async (rawArgs) => {
      // Only apply-mode, gate-passed calls arrive here. Re-derive the scored
      // proposal deterministically (identical to the hook's) and write it.
      const scored = scoreProposal(toProposalInput(rawArgs));
      try {
        const { url } = await createProspect(scored, runDate);
        state.written.push({ scored, url });
        return { content: [{ type: 'text' as const, text: `recorded: ${scored.title} → ${url}` }] };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        state.writeErrors.push({ title: scored.title, detail });
        return {
          content: [{ type: 'text' as const, text: `write failed for ${scored.title}: ${detail}` }],
          isError: true,
        };
      }
    },
  );

  const scoutServer = createSdkMcpServer({
    name: 'scout',
    version: '0.1.0',
    tools: [proposeTool],
  });

  const prompt = buildPrompt(coverage, existing, args.max);
  const hook = createEnforcementHook(state);

  console.log('Running Scout agent…\n');
  const response = query({
    prompt,
    options: {
      model: MODELS.scout,
      mcpServers: { scout: scoutServer },
      allowedTools: [PROPOSE_TOOL],
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
        'WebFetch', 'WebSearch', 'Glob', 'Grep', 'Task', 'TodoWrite',
      ],
      settingSources: [],
      // Headless/CI must never block on a permission prompt. The surface is
      // already sealed structurally (built-ins disallowed, only propose_prospect
      // registered, catch-all deny hook), and a PreToolUse `deny` overrides this
      // mode — so bypass is safe and keeps scheduled runs non-interactive.
      permissionMode: 'bypassPermissions',
      maxTurns: 80,
      hooks: {
        PreToolUse: [{ matcher: '.*', hooks: [hook] }],
      },
    },
  });

  for await (const message of response) {
    if (message.type === 'result') {
      const subtype = 'subtype' in message ? message.subtype : '';
      console.log(`\nAgent finished (${subtype}).`);
    }
  }

  const report = renderReport(state);
  console.log('\n' + report);
  const logFile = writeRunLog(report);
  appendStepSummary(report);
  console.log(`\nRun log: ${path.relative(process.cwd(), logFile)}`);

  if (state.writeErrors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
