/**
 * reading-depth.mjs — the arithmetic behind the digest's "Reading depth" section. Pure.
 *
 * Two questions, both read off Umami's event-data/values rows ({ value, total }):
 *
 *  1. Second-text rate. `text-session-depth` fires at most once per session for
 *     depth 1 (first distinct text) and depth 2 (second). The rate is
 *     depth-2 ÷ depth-1. Depth 3+ is deliberately not instrumented (CLAUDE.md).
 *
 *  2. Read-next clicks by pick. `text-open` carries `pick` (editorial | author |
 *     theme | genre) only when `from` is `read-next` or `text-sheet-read-next`, so
 *     the `pick` values ARE the read-next clicks, split by the rule that chose them.
 *     The two surfaces' `from` counts are the independent total; when the sum of
 *     picks disagrees with it, a click went out without a `pick` (or with one it
 *     should not carry) and the report says so rather than hiding the gap.
 */

export const READ_NEXT_SURFACES = ['read-next', 'text-sheet-read-next'];
export const PICK_KINDS = ['editorial', 'author', 'theme', 'genre'];

/** event-data/values or metrics rows -> Map(value -> count), tolerant of both response shapes. */
export function valueCounts(data) {
  const m = new Map();
  for (const r of Array.isArray(data) ? data : []) {
    const key = String(r.value ?? r.x ?? r.name ?? '(none)');
    m.set(key, (m.get(key) ?? 0) + Number(r.total ?? r.y ?? r.count ?? 0));
  }
  return m;
}

/**
 * @param {object} input
 * @param {Array} input.depthValues  text-session-depth / depth rows
 * @param {Array} input.fromValues   text-open / from rows
 * @param {Array} input.pickValues   text-open / pick rows
 */
export function buildReadingDepth({ depthValues, fromValues, pickValues }) {
  const depths = valueCounts(depthValues);
  const depth1 = depths.get('1') ?? 0;
  const depth2 = depths.get('2') ?? 0;
  const rate = depth1 > 0 ? depth2 / depth1 : null;

  const from = valueCounts(fromValues);
  const surfaces = Object.fromEntries(READ_NEXT_SURFACES.map((s) => [s, from.get(s) ?? 0]));
  const surfaceTotal = Object.values(surfaces).reduce((a, b) => a + b, 0);

  const picks = valueCounts(pickValues);
  // Every known kind is listed, zeros included, so a week with no editorial
  // clicks reads as 0 rather than as a missing row.
  const byPick = Object.fromEntries(PICK_KINDS.map((k) => [k, picks.get(k) ?? 0]));
  const unknownPicks = Object.fromEntries([...picks].filter(([k]) => !PICK_KINDS.includes(k)));
  const pickTotal = [...picks.values()].reduce((a, b) => a + b, 0);

  return {
    secondTextRate: {
      depth1,
      depth2,
      rate,
      // One decimal, as the Growth Digest records it ("Second-text rate %").
      percent: rate == null ? null : Math.round(rate * 1000) / 10,
    },
    readNext: {
      surfaces,
      total: surfaceTotal,
      byPick,
      unknownPicks,
      pickTotal,
      reconciles: pickTotal === surfaceTotal,
    },
  };
}
