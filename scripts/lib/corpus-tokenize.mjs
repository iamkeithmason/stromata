/**
 * corpus-tokenize.mjs — shared word tokeniser for the corpus index and the
 * scanno detector, so the two can never drift apart.
 *
 * Tokenises on word boundaries: lowercasing is left to the caller (the detector
 * needs original case for its capitalisation signal). Surrounding punctuation is
 * stripped; internal apostrophes and hyphens are preserved (so "God's" and
 * "self-will" stay whole). YAML front matter, fenced code blocks, and tables are
 * excluded, but their lines still count toward the line numbering so reported
 * line numbers match the source file exactly.
 *
 * No dependencies — Node built-ins only.
 */

// Starts and ends on a letter or digit; may contain internal ' ’ or - .
const WORD_RE = /[\p{L}\p{N}](?:[\p{L}\p{N}'’-]*[\p{L}\p{N}])?/gu;

/** Boolean mask: true where the line is prose content (not excluded). */
export function contentLineMask(lines) {
  const mask = new Array(lines.length).fill(true);

  // YAML front matter: `---` on line 0 through its closing `---`.
  let start = 0;
  if (lines.length && /^---\s*$/.test(lines[0])) {
    let j = 1;
    while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
    if (j < lines.length) {
      for (let i = 0; i <= j; i++) mask[i] = false;
      start = j + 1;
    }
  }

  // Fenced code blocks.
  let inFence = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(lines[i])) {
      mask[i] = false;
      inFence = !inFence;
      continue;
    }
    if (inFence) mask[i] = false;
  }

  // Tables: delimiter row + contiguous pipe rows around it.
  const isDelim = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
  const hasPipe = (l) => /(?:^|[^\\])\|/.test(l);
  const isBlank = (l) => /^\s*$/.test(l);
  for (let i = start; i < lines.length; i++) {
    if (!isDelim(lines[i])) continue;
    mask[i] = false;
    for (let j = i - 1; j >= 0 && hasPipe(lines[j]) && !isBlank(lines[j]); j--) mask[j] = false;
    for (let j = i + 1; j < lines.length && hasPipe(lines[j]) && !isBlank(lines[j]); j++) mask[j] = false;
  }

  return mask;
}

/**
 * Tokenise text into words with 1-indexed source line numbers and columns.
 * @param {string} text
 * @returns {Array<{ word: string, line: number, col: number }>}
 */
export function tokenize(text) {
  const lines = text.split('\n');
  const mask = contentLineMask(lines);
  const tokens = [];
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i]) continue;
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(lines[i])) !== null) {
      tokens.push({ word: m[0], line: i + 1, col: m.index });
    }
  }
  return tokens;
}

export const wordKey = (word) => word.toLowerCase();

export const isPureNumber = (word) => /^\d+$/.test(word);
