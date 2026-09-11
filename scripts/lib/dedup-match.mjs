/**
 * dedup-match.mjs — shared text/author matching used by both the dedup tool
 * (scripts/dedup-draft-texts.mjs) and the import-time duplicate guard
 * (scripts/pipeline-import.mjs).
 *
 * These MUST stay a single source of truth: if the import guard normalised
 * titles/names differently from the cleanup tool, the pipeline could keep
 * creating duplicates the tool then can't recognise (or vice versa).
 *
 * Normalisation is deliberately conservative. We lowercase, collapse
 * whitespace, normalise quotes/dashes and strip surrounding punctuation — but
 * we KEEP distinguishing parentheticals, so "(Book I)" and "(Book II)" never
 * collapse into one work.
 */

export function normaliseText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:'"-]+|[\s.,;:'"-]+$/g, '')
    .trim();
}

// Titles normalise with the base rules (parentheticals preserved).
export const normaliseTitle = normaliseText;

export function normaliseName(str) {
  // Base rules, plus drop honorific prefixes and internal periods so
  // "St. John of Damascus" and "John of Damascus" match.
  return normaliseText(str)
    .replace(/^(st|saint|ss|pope|blessed)\.?\s+/i, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The cluster key that groups two rows as "the same work by the same person".
export function clusterKey(title, authorName) {
  return `${normaliseTitle(title)} ${normaliseName(authorName)}`;
}

// A compact fingerprint of a body: length plus a normalised opening slice.
// Two rows for the same work should agree closely on both.
export function bodyFingerprint(body) {
  const norm = normaliseText(body).replace(/[^a-z0-9 ]/g, '');
  return { len: norm.length, head: norm.slice(0, 300), norm };
}

// HIGH   — lengths within 10% and identical 300-char normalised opening.
// MEDIUM — lengths within 30% and a shared 120-char opening.
// LOW    — neither; probably not the same content (or one side is a stub).
export function bodyConfidence(a, b) {
  const fa = bodyFingerprint(a);
  const fb = bodyFingerprint(b);
  const longer = Math.max(fa.len, fb.len) || 1;
  const ratio = Math.min(fa.len, fb.len) / longer;
  if (ratio >= 0.9 && fa.head === fb.head) return 'HIGH';
  if (ratio >= 0.7 && fa.head.slice(0, 120) === fb.head.slice(0, 120)) return 'MEDIUM';
  return 'LOW';
}

// Token Jaccard for the fuzzy near-title pass.
export function titleSimilarity(a, b) {
  const toks = s => new Set(normaliseText(s).split(' ').filter(Boolean));
  const ta = toks(a);
  const tb = toks(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
