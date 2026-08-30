/**
 * The pipeline runner — a FIXED action enum, not a free command. The agent's
 * `run_pipeline_script` tool routes here; the action is one of a closed set and
 * its only argument (the slug) comes from run state, never free text. There is
 * no `import`, `apply-reviewed`, `publish`, or DB-write member — those modes are
 * structurally unreachable, not merely discouraged. The PreToolUse hook
 * re-asserts the action is in this enum before the handler runs.
 *
 * Each action reuses the deterministic pipeline transforms (clean.ts / detect.ts)
 * and writes only inside content/staging/.
 */

import { BUNDLE_FILES } from './config';
import { deterministicClean } from './clean';
import { runDetection, renderOcrReport } from './detect';
import { bundlePath, readStaged, writeStaged } from './staging';
import type { CorpusIndex } from './pipeline-adapters';
import type { DetectionResult } from './types';

/** The closed set of runner actions. Correction-apply / import / publish are absent by design. */
export const RUNNER_ACTIONS = ['clean', 'detect'] as const;
export type RunnerAction = (typeof RUNNER_ACTIONS)[number];

/** Modes the runner must never expose — asserted here and in the hook. */
export const FORBIDDEN_RUNNER_ACTIONS = [
  'import',
  'pipeline-import',
  'apply-reviewed',
  'apply',
  'publish',
  'write-db',
  'fetch-texts', // fetching goes through the dedicated fetch tool, never here
] as const;

export function isRunnerAction(v: unknown): v is RunnerAction {
  return typeof v === 'string' && (RUNNER_ACTIONS as readonly string[]).includes(v);
}

export interface RunnerContext {
  repoRoot: string;
  corpus: CorpusIndex | null;
  allowlist: Set<string>;
}

export interface CleanOutcome {
  action: 'clean';
  slug: string;
  bodyPath: string;
  wasHtml: boolean;
  footnoteMarkersStripped: number;
  blanksInserted: number;
  verseRuns: number;
  wordCount: number;
  /** Detected internal divisions (markdown headings) — feeds the collection proposal. */
  headings: string[];
  /** First ~4 KB of body.md, for the agent to propose genre / themes / structure. */
  bodyPreview: string;
}

export interface DetectOutcome {
  action: 'detect';
  slug: string;
  reportPath: string;
  ocrQuality: DetectionResult['ocrQuality'];
  scannoCount: number;
  footnoteOrphans: number;
  greekFlags: number;
  homographs: number;
  artefactDensity: number;
}

export type RunnerOutcome = CleanOutcome | DetectOutcome;

/** Deterministic clean: raw.txt → body.md (inside staging). */
async function runClean(slug: string, ctx: RunnerContext): Promise<CleanOutcome> {
  const raw = readStaged(ctx.repoRoot, slug, BUNDLE_FILES.raw);
  if (raw == null) {
    throw new Error(`clean: no ${BUNDLE_FILES.raw} for "${slug}" — fetch the pinned source first`);
  }
  const result = await deterministicClean(raw);
  const bodyPath = bundlePath(ctx.repoRoot, slug, BUNDLE_FILES.body);
  writeStaged(ctx.repoRoot, bodyPath, result.body);
  const headings = result.body
    .split('\n')
    .filter((l) => /^#{1,6}\s+\S/.test(l))
    .map((l) => l.replace(/^#{1,6}\s+/, '').trim())
    .slice(0, 40);
  const words = result.body.match(/[\p{L}\p{N}]+/gu);
  return {
    action: 'clean',
    slug,
    bodyPath,
    wasHtml: result.wasHtml,
    footnoteMarkersStripped: result.footnoteMarkersStripped,
    blanksInserted: result.blanksInserted,
    verseRuns: result.verseRuns,
    wordCount: words ? words.length : 0,
    headings,
    bodyPreview: result.body.slice(0, 4096),
  };
}

/** Detection pass: body.md → ocr-report.md (inside staging). Never edits body.md. */
async function runDetect(slug: string, ctx: RunnerContext): Promise<DetectOutcome> {
  const body = readStaged(ctx.repoRoot, slug, BUNDLE_FILES.body);
  if (body == null) {
    throw new Error(`detect: no ${BUNDLE_FILES.body} for "${slug}" — run the clean action first`);
  }
  const result = await runDetection(body, slug, { corpus: ctx.corpus, allowlist: ctx.allowlist });
  const reportPath = bundlePath(ctx.repoRoot, slug, BUNDLE_FILES.ocrReport);
  writeStaged(ctx.repoRoot, reportPath, renderOcrReport(result));
  return {
    action: 'detect',
    slug,
    reportPath,
    ocrQuality: result.ocrQuality,
    scannoCount: result.scannoCount,
    footnoteOrphans: result.footnoteOrphans.length,
    greekFlags: result.greekFlags.length,
    homographs: result.homographs.length,
    artefactDensity: result.artefactDensity,
  };
}

/**
 * Dispatch a runner action. Throws a discriminated error for any action outside
 * the enum (defence in depth — the hook blocks it first).
 */
export async function runPipelineAction(
  action: string,
  slug: string,
  ctx: RunnerContext,
): Promise<RunnerOutcome> {
  if (!isRunnerAction(action)) {
    throw new Error(
      `refused: "${action}" is not a permitted runner action. Allowed: ${RUNNER_ACTIONS.join(', ')}. ` +
        'Correction-apply, pipeline-import, and any DB-write mode are structurally unavailable.',
    );
  }
  if (action === 'clean') return runClean(slug, ctx);
  return runDetect(slug, ctx);
}
