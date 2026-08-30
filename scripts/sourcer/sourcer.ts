/**
 * Sourcer — acquire, clean, and stage the ONE edition the editor pinned and
 * rights-cleared, as a reviewable draft bundle under content/staging/. It never
 * chooses a source, never clears copyright, never applies a probabilistic
 * correction, and never touches the live site or database.
 *
 *   --dry-run   (default) read intake, run the entry gate, print the plan +
 *               discriminated skip log — fetch NOTHING, write NOTHING.
 *   --apply     process the gated batch: fetch → clean → detect → stage.
 *   --max N     cap prospects this run (default 3 — sourcing is heavy).
 *   --refresh <slug>   clear a prospect's staged bundle before re-sourcing, so a
 *               corrected pin isn't blocked by the immutable raw.txt / already-staged
 *               guards (--apply only; comma-separate or repeat for several).
 *   --set-notion-status   bump each staged prospect to "In progress" (off by default).
 *
 * Sealed by design: the agent's only tools are the five sourcer tools; no bash,
 * no filesystem, no web, no project settings inherited. The PreToolUse hook
 * (hook.ts) enforces every boundary.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

import { DEFAULT_MAX_PROSPECTS, MODELS } from './config';
import {
  allowlistedDomain,
  authorKey,
  dedupeKey,
  extractClearanceRecord,
  resolveAllowlistedFetchUrl,
} from './contract';
import { buildCorpusView, hasCredentials } from './corpus';
import {
  assertToken,
  bumpStatusInProgress,
  fetchCandidateProspects,
  fetchSchema,
} from './notion';
import { runGate } from './gate';
import { fetchPinnedSource, politenessDelay } from './fetch';
import { runPipelineAction, type DetectOutcome } from './runner';
import { validateProposedMetadata, type AgentMetadataProposal } from './metadata';
import { stageDraft } from './stage';
import { clearStagedBundle } from './staging';
import { loadCorpus, loadAllowlist, type CorpusIndex } from './pipeline-adapters';
import {
  ALLOWED_TOOLS,
  createEnforcementHook,
  type AcceptedProspect,
  type RunState,
} from './hook';
import { buildPrompt } from './prompt';
import { appendStepSummary, renderReport, writeRunLog, type ReportInput } from './report';
import type { ClearanceRecord, DetectionSummary } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

// ---------------------------------------------------------------------------
// Args — dry-run default.
// ---------------------------------------------------------------------------

interface Args {
  dryRun: boolean;
  max: number;
  setNotionStatus: boolean;
  /** Slugs whose staged bundle to clear before re-sourcing (--apply only). */
  refreshSlugs: string[];
}

function parseArgs(argv: string[]): Args {
  let dryRun = true;
  let max = DEFAULT_MAX_PROSPECTS;
  let setNotionStatus = false;
  const refreshSlugs: string[] = [];
  const addRefresh = (v: string) => refreshSlugs.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') dryRun = false;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--set-notion-status') setNotionStatus = true;
    else if (a === '--max') max = Number(argv[++i]);
    else if (a.startsWith('--max=')) max = Number(a.slice('--max='.length));
    else if (a === '--refresh') addRefresh(argv[++i] ?? '');
    else if (a.startsWith('--refresh=')) addRefresh(a.slice('--refresh='.length));
  }
  if (!Number.isFinite(max) || max < 1) max = DEFAULT_MAX_PROSPECTS;
  return { dryRun, max, setNotionStatus, refreshSlugs };
}

// ---------------------------------------------------------------------------
// Reconcile — confirm the two human-owned gate fields exist on the live schema.
// ---------------------------------------------------------------------------

async function reconcile(): Promise<void> {
  const schema = await fetchSchema();
  if (!schema.hasClearedEditionUrl) {
    console.warn(
      '  ! Content Prospect List is missing the "Cleared edition URL" property — the editor ' +
        'must add it (url). Until then every prospect refuses with no-cleared-edition.',
    );
  }
  if (!schema.hasRightsCleared) {
    console.warn(
      '  ! Content Prospect List is missing the "Rights cleared" property — the editor must ' +
        'add it (checkbox). Until then every prospect refuses with rights-not-cleared.',
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertToken();

  console.log(`Sourcer starting — mode: ${args.dryRun ? 'DRY-RUN' : 'APPLY'}, cap: ${args.max}`);

  console.log('Reconciling against live Notion schema…');
  await reconcile();

  console.log('Building read-only corpus view from Supabase…');
  let corpusView;
  try {
    corpusView = await buildCorpusView();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (process.env.SOURCER_ALLOW_EMPTY_CORPUS === '1' || !hasCredentials()) {
      console.warn(`  ! corpus read unavailable (${detail}); proceeding with an EMPTY corpus view.`);
      console.warn('  ! dedup + author checks are blind — the human clearance gate still holds.');
      corpusView = { coveredWorks: new Set<string>(), coveredSlugs: new Set<string>(), authorsByKey: new Map(), totalTexts: 0 };
    } else {
      throw err;
    }
  }
  console.log(`  ${corpusView.totalTexts} texts · ${corpusView.authorsByKey.size} authors`);

  // --refresh: clear named staged bundles so a corrected pin can be re-sourced
  // (immutable raw.txt / already-staged would otherwise block it). Apply-only —
  // clearing in dry-run would delete a bundle without re-creating it.
  if (args.refreshSlugs.length) {
    if (args.dryRun) {
      console.warn(`  ! --refresh is ignored in dry-run (it clears bundles only on --apply): ${args.refreshSlugs.join(', ')}`);
    } else {
      for (const slug of args.refreshSlugs) {
        const cleared = clearStagedBundle(REPO_ROOT, slug);
        console.log(cleared ? `  refreshed: cleared staged bundle for "${slug}"` : `  refresh: no staged bundle to clear for "${slug}"`);
      }
    }
  }

  console.log('Fetching cleared intake from the Content Prospect List…');
  const candidates = await fetchCandidateProspects();
  console.log(`  ${candidates.length} candidate prospect(s) in flight`);

  const { accepted, skips } = runGate(candidates, corpusView, { max: args.max, repoRoot: REPO_ROOT });

  const reportInput: ReportInput = {
    dryRun: args.dryRun,
    max: args.max,
    corpusTexts: corpusView.totalTexts,
    candidates: candidates.length,
    accepted,
    skips,
  };

  // Dry-run stops here — fetch nothing, write nothing.
  if (args.dryRun) {
    finish(reportInput);
    return;
  }

  // Apply — run the sealed agent over the gated batch.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — the Sourcer agent cannot run in --apply.');
  }
  if (accepted.length === 0) {
    console.log('No cleared prospects passed the gate; nothing to source.');
    finish(reportInput);
    return;
  }

  const byId = new Map<string, AcceptedProspect>();
  for (const decision of accepted) {
    const resolved = resolveAllowlistedFetchUrl(decision.prospect);
    const host = resolved ? new URL(resolved).hostname.toLowerCase() : '';
    const domain = allowlistedDomain(host) ?? host;
    const clearanceRecord =
      extractClearanceRecord(decision.prospect, domain) ??
      ({
        clearedEditionUrl: decision.prospect.clearedEditionUrl,
        translator: null,
        editionYear: null,
        publicationYear: null,
        pdBasis: decision.prospect.translationNotes,
        ocrSource: domain,
      } satisfies ClearanceRecord);
    byId.set(decision.prospect.id, { decision, prospect: decision.prospect, clearanceRecord });
  }

  const state: RunState = {
    repoRoot: REPO_ROOT,
    dryRun: false,
    byId,
    staged: [],
    toolDenials: [],
    errors: [],
  };

  // Per-prospect progress (fetch → detect), keyed by prospectId. Filled by handlers.
  const progress = new Map<string, { resolvedUrls: string[]; fetchedAt: string; detection?: DetectionSummary }>();

  // Corpus-frequency index + allowlist for the detection pass (may be absent).
  let corpusIndex: CorpusIndex | null = null;
  try {
    corpusIndex = await loadCorpus();
  } catch {
    corpusIndex = null;
  }
  const scannoAllowlist = await loadAllowlist();
  const runnerCtx = { repoRoot: REPO_ROOT, corpus: corpusIndex, allowlist: scannoAllowlist };

  const stagedBundles: Array<import('./types').StagedBundle> = [];
  let fetchCount = 0;

  // ---- The five sealed tools. Each reached ONLY when the hook allows. ----

  const readProspectsTool = tool(
    'read_cleared_prospects',
    'Return the cleared, gate-passed prospects to source this run (read-only).',
    {},
    async () => {
      const batch = accepted.map((d) => ({
        prospectId: d.prospect.id,
        slug: d.prospect.slug,
        title: d.prospect.title,
        author: d.prospect.author,
        tradition: d.prospect.tradition,
        era: d.prospect.era,
        notionGenre: d.prospect.genre,
        flags: d.flags,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(batch, null, 2) }] };
    },
  );

  const readCorpusTool = tool(
    'read_corpus',
    'Read-only corpus check: is an author present (and their death year), or a work already in the library?',
    {
      authorName: z.string().optional().describe('Author to look up in the corpus.'),
      work: z.string().optional().describe('Work title to check for presence (with authorName).'),
    },
    async (a) => {
      const authorName = typeof a.authorName === 'string' ? a.authorName : '';
      const work = typeof a.work === 'string' ? a.work : '';
      const author = authorName ? corpusView.authorsByKey.get(authorKey(authorName)) ?? null : null;
      const present = authorName && work ? corpusView.coveredWorks.has(dedupeKey(authorName, work)) : false;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ authorPresent: Boolean(author), authorDeathYear: author?.deathYear ?? null, workPresent: present }),
          },
        ],
      };
    },
  );

  const fetchTool = tool(
    'fetch_pinned_source',
    'Fetch ONLY the editor-pinned edition for a prospect (URL resolved server-side) and store raw.txt immutably.',
    { prospectId: z.string().describe('The gate-passed prospect id.') },
    async (a) => {
      const entry = byId.get(String(a.prospectId));
      if (!entry) return errorResult(`unknown prospectId ${String(a.prospectId)}`);
      try {
        if (fetchCount > 0) await politenessDelay();
        fetchCount++;
        const res = await fetchPinnedSource(entry.prospect, REPO_ROOT);
        progress.set(entry.prospect.id, { resolvedUrls: res.urls, fetchedAt: new Date().toISOString() });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                slug: res.slug,
                fetched: res.url,
                parts: res.parts,
                bytes: res.bytes,
                alreadyPresent: res.alreadyPresent,
                preview: res.preview,
              }),
            },
          ],
        };
      } catch (err) {
        return recordError(state, entry.prospect.slug, err);
      }
    },
  );

  const runScriptTool = tool(
    'run_pipeline_script',
    'Run a NON-mutating pipeline action over a prospect\'s staged files. Actions: "clean" (raw.txt → body.md) | "detect" (body.md → ocr-report.md). No import, no correction-apply.',
    {
      prospectId: z.string(),
      action: z.enum(['clean', 'detect']).describe('clean = deterministic body.md; detect = ocr-report.md (never edits body.md).'),
    },
    async (a) => {
      const entry = byId.get(String(a.prospectId));
      if (!entry) return errorResult(`unknown prospectId ${String(a.prospectId)}`);
      try {
        const outcome = await runPipelineAction(String(a.action), entry.prospect.slug, runnerCtx);
        if (outcome.action === 'detect') {
          const d = outcome as DetectOutcome;
          const prev = progress.get(entry.prospect.id) ?? { resolvedUrls: [], fetchedAt: new Date().toISOString() };
          prev.detection = {
            ocrQuality: d.ocrQuality,
            scannoCount: d.scannoCount,
            footnoteOrphans: d.footnoteOrphans,
            greekFlags: d.greekFlags,
            homographs: d.homographs,
            artefactDensity: d.artefactDensity,
          };
          progress.set(entry.prospect.id, prev);
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(outcome) }] };
      } catch (err) {
        return recordError(state, entry.prospect.slug, err);
      }
    },
  );

  const stageTool = tool(
    'stage_draft',
    'Complete the bundle under content/staging/<slug>/ — write provenance.yml (verbatim), metadata.yml (your proposals), and SOURCER.md.',
    {
      prospectId: z.string(),
      genre: z.string().optional(),
      themes: z.array(z.string()).optional(),
      collection: z
        .object({
          shape: z.string().optional(),
          rationale: z.string().optional(),
          parts: z
            .array(z.object({ order: z.number().optional(), title: z.string().optional(), note: z.string().optional() }))
            .optional(),
        })
        .optional(),
    },
    async (a) => {
      const entry = byId.get(String(a.prospectId));
      if (!entry) return errorResult(`unknown prospectId ${String(a.prospectId)}`);
      const prog = progress.get(entry.prospect.id);
      if (!prog || prog.resolvedUrls.length === 0) return errorResult(`stage_draft: fetch "${entry.prospect.slug}" before staging`);
      try {
        const proposal: AgentMetadataProposal = {
          genre: typeof a.genre === 'string' ? a.genre : null,
          themes: Array.isArray(a.themes) ? a.themes.map(String) : [],
          collection: a.collection as AgentMetadataProposal['collection'],
        };
        const meta = validateProposedMetadata(proposal, {
          slug: entry.prospect.slug,
          title: entry.prospect.title,
          author: entry.prospect.author,
          ocrQuality: prog.detection?.ocrQuality ?? 'medium',
          flags: entry.decision.flags,
        });
        const bundle = stageDraft(REPO_ROOT, {
          prospect: entry.prospect,
          clearanceRecord: entry.clearanceRecord,
          fetchedAt: prog.fetchedAt,
          resolvedUrls: prog.resolvedUrls,
          meta,
          detection: prog.detection ?? null,
        });
        stagedBundles.push(bundle);
        state.staged.push(bundle.slug);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ staged: bundle.slug, files: bundle.files, flags: bundle.flags }) }] };
      } catch (err) {
        return recordError(state, entry.prospect.slug, err);
      }
    },
  );

  const server = createSdkMcpServer({
    name: 'sourcer',
    version: '0.0.0',
    tools: [readProspectsTool, readCorpusTool, fetchTool, runScriptTool, stageTool],
  });

  const hook = createEnforcementHook(state);
  console.log(`Running Sourcer agent over ${accepted.length} prospect(s)…\n`);

  const response = query({
    prompt: buildPrompt(accepted),
    options: {
      model: MODELS.sourcer,
      mcpServers: { sourcer: server },
      allowedTools: [...ALLOWED_TOOLS],
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
        'WebFetch', 'WebSearch', 'Glob', 'Grep', 'Task', 'TodoWrite',
      ],
      settingSources: [],
      permissionMode: 'bypassPermissions',
      maxTurns: 40 * accepted.length + 20,
      hooks: { PreToolUse: [{ matcher: '.*', hooks: [hook] }] },
    },
  });

  for await (const message of response) {
    if (message.type === 'result') {
      const subtype = 'subtype' in message ? message.subtype : '';
      console.log(`\nAgent finished (${subtype}).`);
    }
  }

  // Optional Notion Status bump for staged prospects.
  if (args.setNotionStatus) {
    for (const decision of accepted) {
      if (state.staged.includes(decision.prospect.slug)) {
        try {
          await bumpStatusInProgress(decision.prospect.id);
        } catch (err) {
          state.errors.push({ slug: decision.prospect.slug, detail: `status bump failed: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
    }
  }

  reportInput.staged = stagedBundles;
  reportInput.denials = state.toolDenials;
  reportInput.errors = state.errors;
  finish(reportInput);
  if (state.errors.length > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

function recordError(state: RunState, slug: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  state.errors.push({ slug, detail });
  return errorResult(`${slug}: ${detail}`);
}

function finish(reportInput: ReportInput): void {
  const report = renderReport(reportInput);
  console.log('\n' + report);
  const logFile = writeRunLog(report);
  appendStepSummary(report);
  console.log(`\nRun log: ${path.relative(process.cwd(), logFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
