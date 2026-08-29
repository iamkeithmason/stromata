/**
 * Typed adapters over the existing pipeline helpers. The Sourcer ORCHESTRATES
 * these deterministic transforms rather than reimplementing them — it imports
 * their pure exports (dynamic import isolates the cross-language `any` so the
 * rest of the Sourcer stays strict). No new dependencies.
 *
 *   - normalise-markdown.mjs  → normaliseMarkdown (block repair + verse flagging)
 *   - ingestion/footnote-strip.mjs → stripFootnoteMarkers (deterministic marker removal)
 *   - detect-scannos.mjs → detectScannos / formatReport / loadCorpus / loadAllowlist
 *
 * All are DETECTION or DETERMINISTIC-CLEAN only. The correction-apply half of
 * detect-scannos (applyReviewed / --apply-reviewed) is deliberately NOT adapted:
 * the Sourcer detects, it never corrects.
 */

export interface ScannoFlag {
  slug: string;
  file?: string;
  line: number;
  col: number;
  word: string;
  suggestion: string;
  tier: number;
  freq: number;
  context: string;
}

export interface CorpusIndex {
  meta: { textCount: number; totalTokens: number; distinctWords: number };
  words: Record<string, { count: number }>;
}

interface NormaliseResult {
  output: string;
  report: {
    changed: boolean;
    blanksInserted: number;
    verseFlags: Array<{ startLine: number; endLine: number; preview: string }>;
  };
}

interface FootnoteResult {
  text: string;
  count: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function normaliseMarkdown(
  input: string,
  options: Record<string, unknown> = {},
): Promise<NormaliseResult> {
  const mod: any = await import('../normalise-markdown.mjs');
  return mod.normaliseMarkdown(input, options) as NormaliseResult;
}

export async function stripFootnoteMarkers(
  text: string,
  config: Record<string, unknown> = {},
): Promise<FootnoteResult> {
  const mod: any = await import('../ingestion/footnote-strip.mjs');
  return mod.stripFootnoteMarkers(text, config) as FootnoteResult;
}

export async function detectScannos(
  text: string,
  opts: { corpus: CorpusIndex; allowlist?: Set<string>; slug?: string },
): Promise<ScannoFlag[]> {
  const mod: any = await import('../detect-scannos.mjs');
  return mod.detectScannos(text, opts) as ScannoFlag[];
}

export async function formatScannoReport(
  flags: ScannoFlag[],
  opts: { corpus: CorpusIndex; minTier: number },
): Promise<string> {
  const mod: any = await import('../detect-scannos.mjs');
  return mod.formatReport(flags, opts) as string;
}

export async function loadCorpus(): Promise<CorpusIndex | null> {
  const mod: any = await import('../detect-scannos.mjs');
  return mod.loadCorpus() as CorpusIndex | null;
}

export async function loadAllowlist(): Promise<Set<string>> {
  const mod: any = await import('../detect-scannos.mjs');
  return mod.loadAllowlist() as Set<string>;
}
