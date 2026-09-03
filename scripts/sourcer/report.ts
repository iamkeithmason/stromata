/**
 * Reporting — the plan (gated intake + discriminated skip log) and, after an
 * apply run, the staged-bundle summary. Printed to stdout, written to a dated run
 * log, and (in CI) appended to the GitHub Actions step summary.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCER_VERSION } from './config';
import type { GateDecision, RefusalReason, SkipRecord, StagedBundle } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_LOG_DIR = path.join(__dirname, 'run-log');

const SKIP_ORDER: RefusalReason[] = [
  'already-live',
  'rights-not-cleared',
  'no-cleared-edition',
  'source-not-allowlisted',
  'no-provenance-basis',
  'author-copyright-fail',
  'author-missing',
  'already-present',
  'already-staged',
  'over-cap',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url || '—';
  }
}

function planTable(accepted: GateDecision[]): string {
  if (accepted.length === 0) return '_No cleared prospects passed the gate._';
  const header =
    '| Slug | Title | Author | Pinned host | Flag |\n' + '|---|---|---|---|:-:|';
  const body = accepted
    .map((d) => {
      const flag = d.outcome === 'flagged' ? '⚑' : '';
      return `| \`${d.prospect.slug}\` | ${d.prospect.title} | ${d.prospect.author} | ${hostOf(d.prospect.clearedEditionUrl)} | ${flag} |`;
    })
    .join('\n');
  return `${header}\n${body}`;
}

function skipLog(skips: SkipRecord[]): string {
  if (skips.length === 0) return '_No candidates skipped._';
  const counts: Record<string, number> = {};
  for (const s of skips) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
  const summary = SKIP_ORDER.filter((r) => counts[r]).map((r) => `${r}: ${counts[r]}`).join(' · ');
  const lines = [...skips]
    .sort((a, b) => SKIP_ORDER.indexOf(a.reason) - SKIP_ORDER.indexOf(b.reason))
    .map((s) => `- \`${s.reason}\` — ${s.author} — ${s.title}: ${s.detail}`)
    .join('\n');
  return `**${skips.length} skipped** (${summary})\n\n${lines}`;
}

function stagedSection(staged: StagedBundle[]): string {
  if (staged.length === 0) return '_No bundles staged._';
  return staged
    .map((b) => {
      const flags = b.flags.length ? ` · ⚑ ${b.flags.length} flag(s)` : '';
      return `- \`${b.slug}\` → ${b.files.length}/6 files${flags}\n  - ${b.files.join(', ')}`;
    })
    .join('\n');
}

export interface ReportInput {
  dryRun: boolean;
  max: number;
  corpusTexts: number;
  candidates: number;
  accepted: GateDecision[];
  skips: SkipRecord[];
  staged?: StagedBundle[];
  denials?: Array<{ tool: string; reason: string }>;
  errors?: Array<{ slug: string; detail: string }>;
}

export function renderReport(input: ReportInput): string {
  const mode = input.dryRun ? 'DRY-RUN (nothing fetched or written)' : 'APPLY';
  const runDate = new Date().toISOString();

  let stagedBlock = '';
  if (!input.dryRun) {
    const denials =
      input.denials && input.denials.length
        ? `\n\n### Tool denials (enforcement working)\n` +
          input.denials.map((d) => `- \`${d.tool}\`: ${d.reason}`).join('\n')
        : '';
    const errors =
      input.errors && input.errors.length
        ? `\n\n### Errors\n` + input.errors.map((e) => `- \`${e.slug}\`: ${e.detail}`).join('\n')
        : '';
    stagedBlock = `\n\n## Staged bundles\n${stagedSection(input.staged ?? [])}${denials}${errors}`;
  }

  return `# Sourcer run — ${runDate}
Mode: **${mode}** · ${SOURCER_VERSION}
Corpus: ${input.corpusTexts} texts · candidates: ${input.candidates} · cap ${input.max}
Cleared prospects passing the gate: ${input.accepted.length}

## Plan — gated intake
${planTable(input.accepted)}

## Skip log
${skipLog(input.skips)}${stagedBlock}
`;
}

export function writeRunLog(markdown: string): string {
  fs.mkdirSync(RUN_LOG_DIR, { recursive: true });
  const day = new Date().toISOString().split('T')[0];
  const file = path.join(RUN_LOG_DIR, `${day}.md`);
  const sep = fs.existsSync(file) ? '\n\n---\n\n' : '';
  fs.appendFileSync(file, sep + markdown);
  return file;
}

export function appendStepSummary(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    fs.appendFileSync(summaryPath, markdown + '\n');
  } catch {
    // Non-fatal: the summary is a convenience, not a gate.
  }
}
