/**
 * Reporting — the proposed-batch markdown table + the full discriminated skip
 * log. Printed to stdout, written to a dated run log, and (in CI) appended to
 * the GitHub Actions step summary so Keith gets a glance without opening Notion.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GENERATED_BY } from './config';
import type { RunState } from './hook';
import type { ScoredProposal, SkipReason, SkipRecord } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_LOG_DIR = path.join(__dirname, 'run-log');

const SKIP_ORDER: SkipReason[] = [
  'already-published',
  'already-proposed',
  'copyright-excluded',
  'below-threshold',
  'duplicate-in-batch',
  'over-cap',
  'contract-violation',
];

function proposedTable(rows: ScoredProposal[]): string {
  if (rows.length === 0) return '_No proposals cleared the gate._';
  const header =
    '| Title | Tradition | Era | V | C | E | ICE | Tier1 | Copyright | Source |\n' +
    '|---|---|---|--:|--:|--:|--:|:-:|---|---|';
  const body = rows
    .map((r) => {
      const src = r.candidateSources[0] ?? '';
      return `| ${r.title} | ${r.tradition} | ${r.era} | ${r.value} | ${r.complexity} | ${r.effort} | ${r.iceScore} | ${r.tier1 ? '✓' : ''} | ${r.copyrightFlag} | ${src} |`;
    })
    .join('\n');
  return `${header}\n${body}`;
}

function skipLog(skips: SkipRecord[]): string {
  if (skips.length === 0) return '_No candidates skipped._';
  const counts: Record<string, number> = {};
  for (const s of skips) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
  const summary = SKIP_ORDER.filter((r) => counts[r])
    .map((r) => `${r}: ${counts[r]}`)
    .join(' · ');

  const lines = [...skips]
    .sort((a, b) => SKIP_ORDER.indexOf(a.reason) - SKIP_ORDER.indexOf(b.reason))
    .map((s) => `- \`${s.reason}\` — ${s.author} — ${s.title}: ${s.detail}`)
    .join('\n');

  return `**${skips.length} skipped** (${summary})\n\n${lines}`;
}

export function renderReport(state: RunState): string {
  const mode = state.dryRun ? 'DRY-RUN (nothing written)' : 'APPLY';
  const runDate = new Date().toISOString();

  const proposed = state.dryRun ? state.accepted : state.written.map((w) => w.scored);
  const writtenNote = state.dryRun
    ? ''
    : `\nWritten to Notion: ${state.written.length}` +
      (state.writeErrors.length
        ? `\nWrite errors: ${state.writeErrors.length}\n` +
          state.writeErrors.map((e) => `- ${e.title}: ${e.detail}`).join('\n')
        : '');

  return `# Scout run — ${runDate}
Mode: **${mode}** · ${GENERATED_BY}
Corpus: ${state.coverage.totalPublished} published texts · cap ${state.maxProposals}
Proposals cleared: ${state.accepted.length}${writtenNote}

## Proposed batch
${proposedTable(proposed)}

## Skip log
${skipLog(state.skips)}
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
