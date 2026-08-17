/**
 * scanno-config.mjs — tunables for detect-scannos.mjs.
 *
 * The confusion table grows as new OCR patterns are observed. Groups are
 * fully-connected sets of mutually-confusable glyphs; pairs are directed-both-
 * ways swaps (usually multi-character). A suspect word one substitution away
 * from a corpus-common word is the detector's strongest signal.
 */

// Mutually-confusable single glyphs. Every ordered pair within a group is a
// candidate substitution in both directions.
export const CONFUSION_GROUPS = [
  ['l', 'U', 'I', '1', 'i'],
  ['c', 'e'],
  ['o', '0'],
  ['b', 'h'],
  ['t', 'f'],
  ['f', 'ſ'], // long s
];

// Multi-character (and single) confusions, applied in both directions.
export const CONFUSION_PAIRS = [
  ['rn', 'm'],
  ['cl', 'd'],
  ['vv', 'w'],
  ['ii', 'n'],
  ['ii', 'u'],
  ['n', 'u'],
];

export const THRESHOLDS = {
  // PRIMARY GATE (Signal B). A word appearing MORE than this many times across
  // the whole corpus is self-evidently correct and is never flagged — even if
  // it happens to sit one confusion-substitution from another common word.
  // Without this, common words like "this"→"thus" or "into"→"unto" flood the
  // report (25k+ false Tier-2 flags on the real corpus). This is why the
  // frequency index, not a dictionary, is the foundation: archaic forms like
  // "shew" are common here and so are exempt automatically.
  suspectMaxFreq: 4,
  // A candidate correction must be at least this frequent in the corpus to be
  // trusted as a real word (Signal A).
  commonMin: 8,
  // Suspect corpus frequency at or below this counts as a hapax (Signal B).
  hapaxMax: 2,
  // Suspect corpus frequency at or below this counts as merely rare (Tier 3).
  rareMax: 2,
  // Ignore very short tokens — too many false positives, too little to correct.
  minWordLength: 4,
  // Default reporting threshold: report tiers 1..N (1 = highest confidence).
  defaultMinTier: 2,
};

/** All confusion substitutions as directed [from, to] pairs, de-duplicated. */
export function directedPairs(config = { CONFUSION_GROUPS, CONFUSION_PAIRS }) {
  const out = new Set();
  const add = (a, b) => {
    if (a !== b) out.add(`${a}\t${b}`);
  };
  for (const group of config.CONFUSION_GROUPS || []) {
    for (const a of group) for (const b of group) add(a, b);
  }
  for (const [a, b] of config.CONFUSION_PAIRS || []) {
    add(a, b);
    add(b, a);
  }
  return [...out].map((s) => s.split('\t'));
}

export default { CONFUSION_GROUPS, CONFUSION_PAIRS, THRESHOLDS, directedPairs };
