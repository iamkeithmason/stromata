/**
 * Deterministic taxonomy — Era derivation (Fix 2) and the tradition consistency
 * guard (Fix 3). Both settle from the author's dates in code, because these are
 * exactly the classifications the model gets wrong (English → "Anglican"
 * anachronism; the whole Greek East → "Patristic").
 *
 * Era is fully determined by dates, so the model never proposes it. Tradition
 * the model MAY propose, but this guard validates it: it auto-reassigns only
 * among the three date-settled traditions (Early Church / Patristic /
 * Imperial), and otherwise flags `needs-editorial` rather than guess.
 */

import type { TaxonomyFlag } from './types';

// ---------------------------------------------------------------------------
// Era — derived from the representative year (death, else floruit, else birth).
// ---------------------------------------------------------------------------

/**
 * Upper bound (inclusive) of each era, in order. "Apostolic (to c.100)" is
 * circa: its bound is 110 so the Apostolic Fathers who died just after 100
 * (Ignatius d. c.108, Clement d. c.99) land in Apostolic, not Ante-Nicene.
 */
const ERA_RANGES: Array<{ canonical: string; maxYear: number }> = [
  { canonical: 'Apostolic', maxYear: 110 },
  { canonical: 'Ante-Nicene', maxYear: 325 },
  { canonical: 'Nicene & Post-Nicene', maxYear: 600 },
  { canonical: 'Early Medieval', maxYear: 1000 },
  { canonical: 'High Medieval', maxYear: 1350 },
  { canonical: 'Late Medieval', maxYear: 1500 },
  { canonical: 'Reformation', maxYear: 1600 },
  { canonical: 'Post-Reformation', maxYear: 1800 },
  { canonical: 'Modern', maxYear: 1900 },
];

/** The single year that settles Era and the tradition window. */
export function representativeYear(dates: {
  deathYear?: number | null;
  floruitYear?: number | null;
  birthYear?: number | null;
}): number | null {
  for (const y of [dates.deathYear, dates.floruitYear, dates.birthYear]) {
    if (y != null && Number.isFinite(y)) return y;
  }
  return null;
}

/** Derive the canonical Era from a representative year, or null if unknown/out of range. */
export function deriveEra(year: number | null): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  for (const r of ERA_RANGES) {
    if (year <= r.maxYear) return r.canonical;
  }
  return null; // post-1900 — never proposed (copyright gate excludes it)
}

// ---------------------------------------------------------------------------
// Tradition guard.
// ---------------------------------------------------------------------------

/** The only traditions the death year fully settles — safe to auto-reassign among. */
export const ERA_BUCKET_TRADITIONS = ['Early Church', 'Patristic', 'Imperial'] as const;

/** Validity windows by death year. Empty object = no date constraint. */
const TRADITION_WINDOWS: Record<string, { min?: number; max?: number }> = {
  'Early Church': { max: 325 },
  Patristic: { min: 325, max: 600 },
  Imperial: { min: 600, max: 1054 },
  'Eastern Orthodox': { min: 1054 },
  'Roman Catholic': { min: 1054 },
  Anglican: { min: 1530 },
  Reformed: { min: 1520 },
  Lutheran: { min: 1517 },
  'Oriental Orthodox': {}, // region-defined — never flag on date alone
  Ecumenical: {}, // escape hatch — never flag on date alone
};

/** Which date-settled bucket a year falls in (the auto-reassign target). */
function eraBucketFor(year: number): (typeof ERA_BUCKET_TRADITIONS)[number] | null {
  if (year <= 325) return 'Early Church';
  if (year <= 600) return 'Patristic';
  if (year <= 1054) return 'Imperial';
  return null; // post-1054 needs an East/West judgement code can't make
}

export interface TraditionResolution {
  /** Final tradition to write: a valid option, or null (cleared → needs-editorial). */
  tradition: string | null;
  flag: TaxonomyFlag | null;
  /** ↻ / ⚑ marker for Editorial notes, or null when the proposal was already valid. */
  note: string | null;
}

/**
 * Validate a proposed tradition against the author's death year.
 * - Valid → keep it.
 * - Conflict on an era-bucket tradition, year ≤ 1054 → auto-reassign to the bucket.
 * - Anything else (post-1054 East/West, a Reformation confession, a boundary
 *   figure, or missing dates) → clear the field and flag `needs-editorial`.
 */
export function resolveTradition(
  proposed: string | null | undefined,
  year: number | null,
): TraditionResolution {
  const clean = (proposed ?? '').trim() || null;

  if (year == null) {
    if (!clean) {
      return { tradition: null, flag: 'needs-editorial', note: '⚑ tradition: needs-editorial — no tradition proposed and dates unknown' };
    }
    return { tradition: null, flag: 'needs-editorial', note: `⚑ tradition: needs-editorial — proposed «${clean}» but dates unknown` };
  }

  if (!clean) {
    // No tradition proposed but dates known: auto-set only if the year settles it.
    const bucket = eraBucketFor(year);
    if (bucket) {
      return { tradition: bucket, flag: 'auto', note: `↻ tradition auto-set «${bucket}» — d.${year} falls in the «${bucket}» window` };
    }
    return { tradition: null, flag: 'needs-editorial', note: `⚑ tradition: needs-editorial — no tradition proposed; d.${year} needs an East/West judgement` };
  }

  const win = TRADITION_WINDOWS[clean];
  // Traditions with no window (Oriental Orthodox / Ecumenical) or unknown labels
  // are never flagged on date alone; keep the proposal (a non-controlled label is
  // caught later by the contract validator).
  if (!win) return { tradition: clean, flag: null, note: null };

  const okMin = win.min == null || year >= win.min;
  const okMax = win.max == null || year <= win.max;
  if (okMin && okMax) return { tradition: clean, flag: null, note: null };

  // Conflict.
  if ((ERA_BUCKET_TRADITIONS as readonly string[]).includes(clean)) {
    const bucket = eraBucketFor(year);
    if (bucket) {
      return { tradition: bucket, flag: 'auto', note: `↻ tradition auto-set «${bucket}» — d.${year} falls in the «${bucket}» window (proposed «${clean}»)` };
    }
    // era-bucket tradition proposed for a post-1054 figure → can't auto-decide East/West
    return { tradition: null, flag: 'needs-editorial', note: `⚑ tradition: needs-editorial — proposed «${clean}» conflicts with d.${year}` };
  }

  // Non-bucket tradition whose window doesn't contain the death year → flag, don't guess.
  return { tradition: null, flag: 'needs-editorial', note: `⚑ tradition: needs-editorial — proposed «${clean}» conflicts with d.${year}` };
}
