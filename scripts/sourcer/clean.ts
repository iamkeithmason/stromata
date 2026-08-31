/**
 * Deterministic, unattended-grade clean — the ONLY changes actually written into
 * the text. It is intentionally conservative: every transform here is a
 * same-input-same-output rewrite with no probabilistic judgement. Anything that
 * requires a guess (character-substitution scannos, Greek reconstruction,
 * homograph disambiguation) is DETECTED elsewhere (detect.ts), never applied.
 *
 * Chain (reusing existing pipeline exports where they exist):
 *   1. minimal HTML → text (for the HTML allowlist sources; djvu.txt passes through)
 *   2. deterministic character fixes: ligature failures, doubled apostrophes,
 *      soft-hyphen removal, control-char scrub
 *   3. stripFootnoteMarkers (footnote-strip.mjs) — orphaned-marker removal
 *   4. normaliseMarkdown (normalise-markdown.mjs) — Google-Docs single-newline
 *      block repair + verse flagging
 */

import { normaliseMarkdown, stripFootnoteMarkers } from './pipeline-adapters';

const LIGATURES: Array<[RegExp, string]> = [
  [/ﬀ/g, 'ff'],
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  [/ﬅ/g, 'st'],
  [/ﬆ/g, 'st'],
];

/** Looks-like-HTML heuristic (a real djvu.txt scan never trips this). */
export function looksLikeHtml(raw: string, contentType = ''): boolean {
  if (/html/i.test(contentType)) return true;
  const head = raw.slice(0, 4000).toLowerCase();
  return /<!doctype html|<html[\s>]|<body[\s>]|<div[\s>]|<p>|<p\s/.test(head);
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
};

/**
 * Minimal, deterministic HTML → text. Not a full converter — it drops
 * script/style, turns block tags into newlines, strips remaining tags and
 * decodes a small entity set. The editor refines body.md; this only needs to be
 * readable. (djvu.txt sources never reach here.)
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<\/(p|div|section|article|li|tr|table|blockquote|h[1-6])>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<h([1-6])[^>]*>/gi, (_m, n) => '\n\n' + '#'.repeat(Number(n)) + ' ');
  s = s.replace(/<[^>]+>/g, '');
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
  return s;
}

/**
 * New Advent page chrome, line-anchored. Every pattern is unmistakably New Advent
 * (nav, the $19.99 support banner, the About/Source/Contact/Copyright/advertise
 * footer), so running this on non-New-Advent text is a no-op. The `# … (Book N)`
 * and `## Chapter N.` headings are deliberately NOT matched — they are the book /
 * chapter dividers the downstream split needs.
 */
const NEWADVENT_CHROME: RegExp[] = [
  /^CHURCH FATHERS:/,
  /^\s*Search:\s*$/,
  /^\s*Submit Search\s*$/,
  /^\s*Home\s+Encyclopedia\s+Summa\s+Fathers\s+Bible\s+Library\s*$/,
  /^\s*(?:[A-Z]\s+){12,}[A-Z]\s*$/, // the A B C … Z alphabet nav
  /^\s*Home\s*>\s*Fathers of the Church\s*>/, // breadcrumb
  /^Please help support the mission of New Advent/, // support banner
  /^##\s+About this page\s*$/,
  /Revised and edited for New Advent by/, // the Source. line
  /^\s*Contact information\.\s+The editor of New Advent is/,
  /^Copyright\b.*New Advent LLC/,
  /^\s*CONTACT US\s*\|\s*ADVERTISE WITH NEW ADVENT\s*$/,
];

/**
 * Strip New Advent's per-page boilerplate (repeated once per concatenated Book
 * page). Deterministic and line-anchored; leaves the translated body + the book
 * and chapter headings intact. Returns the cleaned text and how many lines went.
 */
export function stripNewAdventChrome(text: string): { text: string; removed: number } {
  let removed = 0;
  const kept = text.split('\n').filter((line) => {
    if (NEWADVENT_CHROME.some((re) => re.test(line))) {
      removed++;
      return false;
    }
    return true;
  });
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n'), removed };
}

/**
 * Project Gutenberg header/footer boilerplate, line-anchored. A PG plain-text file
 * wraps the work between `*** START OF THE PROJECT GUTENBERG EBOOK … ***` and
 * `*** END OF THE PROJECT GUTENBERG EBOOK … ***` lines (older files say "THIS"),
 * with the PG license, transcriber credits and metadata outside them. The text
 * itself is public domain; only the boilerplate carries PG's trademark license,
 * so it is dropped. Anchored on the START marker, so this is a no-op on any text
 * that is not a Project Gutenberg file.
 */
const GUTENBERG_START = /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
const GUTENBERG_END = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;

/**
 * Strip Project Gutenberg boilerplate, keeping only the work between the START and
 * END markers. No START marker → not a PG file → returned unchanged. Also drops a
 * leading "Produced by …" transcriber credit and surrounding blank lines. Returns
 * the cleaned text and how many lines were removed.
 */
export function stripGutenbergBoilerplate(text: string): { text: string; removed: number } {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => GUTENBERG_START.test(l));
  if (startIdx === -1) return { text, removed: 0 };
  const endIdx = lines.findIndex((l) => GUTENBERG_END.test(l));
  const bodyEnd = endIdx > startIdx ? endIdx : lines.length;
  const kept = lines.slice(startIdx + 1, bodyEnd);
  const removed = lines.length - kept.length;
  const body = kept
    .join('\n')
    .replace(/^\s*\n+/, '') // leading blanks after the START marker
    .replace(/^Produced by[^\n]*\n/i, '') // transcriber credit line
    .replace(/^\s*\n+/, '');
  return { text: body, removed };
}

/** Deterministic character-level OCR/print fixes. Same input → same output. */
export function normalizeChars(text: string): string {
  let s = text;
  for (const [re, rep] of LIGATURES) s = s.replace(re, rep);
  s = s.replace(/­/g, ''); // soft hyphen
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // stray control chars (keep \t \n)
  // Doubled straight/curly apostrophes standing in for a double quote (OCR artefact).
  s = s.replace(/''/g, '"').replace(/‘‘/g, '“').replace(/’’/g, '”').replace(/``/g, '“');
  s = s.replace(/[ \t]+\n/g, '\n'); // trailing whitespace
  return s;
}

export interface CleanResult {
  body: string;
  wasHtml: boolean;
  footnoteMarkersStripped: number;
  /** New Advent boilerplate lines removed (nav / support banner / footer). */
  chromeStripped: number;
  /** Project Gutenberg header/footer lines removed. */
  gutenbergStripped: number;
  blanksInserted: number;
  verseRuns: number;
  changed: boolean;
}

/**
 * Run the full deterministic clean over a raw capture, producing body.md.
 * Reuses stripFootnoteMarkers + normaliseMarkdown; adds only the enumerated
 * deterministic character fixes.
 */
export async function deterministicClean(
  raw: string,
  opts: { contentType?: string } = {},
): Promise<CleanResult> {
  const wasHtml = looksLikeHtml(raw, opts.contentType ?? '');
  let text = wasHtml ? htmlToText(raw) : raw;
  const chrome = stripNewAdventChrome(text);
  const gutenberg = stripGutenbergBoilerplate(chrome.text);
  text = normalizeChars(gutenberg.text);

  const footnote = await stripFootnoteMarkers(text, {});
  const { output, report } = await normaliseMarkdown(footnote.text, {});

  return {
    body: output.endsWith('\n') ? output : output + '\n',
    wasHtml,
    footnoteMarkersStripped: footnote.count,
    chromeStripped: chrome.removed,
    gutenbergStripped: gutenberg.removed,
    blanksInserted: report.blanksInserted,
    verseRuns: report.verseFlags.length,
    changed:
      report.changed || footnote.count > 0 || chrome.removed > 0 || gutenberg.removed > 0 || wasHtml,
  };
}
