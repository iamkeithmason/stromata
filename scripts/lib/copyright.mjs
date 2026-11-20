/**
 * copyright.mjs — HARD CONSTRAINT 3, the import-time re-check (CLAUDE.md).
 *
 * A prospect clears on one of three grounds:
 *   1. the author died before 1900;
 *   2. a translation explicitly marked clear whose translator died before 1928;
 *   3. a recorded ruling by Keith that the edition was published before 1929
 *      (US public domain by publication date). Both `publication_year` (< 1929)
 *      and `copyright_ruling` (who ruled, when, on what evidence) must be present:
 *      the year alone is a claim; the ruling is the decision. Added 20 Nov 2026
 *      for J. H. Jowett (d. 1923), The Passion for Souls, Revell 1905.
 *
 * Pure; unit-tested in copyright.test.mjs.
 */

export function copyrightBasis(p) {
  if (p.death_year && p.death_year < 1900) return 'author-death';
  if (p.translation_copyright_clear && p.translator_death_year && p.translator_death_year < 1928) return 'translator-death';
  const year = Number(p.publication_year);
  if (Number.isInteger(year) && year > 0 && year < 1929 && String(p.copyright_ruling || '').trim()) return 'publication-ruling';
  return null;
}

export function copyrightClear(p) {
  return copyrightBasis(p) !== null;
}
