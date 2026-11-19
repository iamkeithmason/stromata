/**
 * The Umami `from` vocabulary as code: every surface a navigational click can
 * originate on. CLAUDE.md ("Property vocabulary") is the written record and the
 * Notion Events Register is the full one; this list exists so scripts can check
 * a value instead of trusting it. from-surfaces.test.mjs fails if this list and
 * the CLAUDE.md row drift apart, so a new surface is added in both places.
 */
export const FROM_SURFACES = Object.freeze([
  // Homepage
  'seasonal-panel', 'featured-lead', 'homepage-grid', 'featured-band', 'reading-history', 'homepage-entrance',
  // Reader
  'text-reader', 'text-page', 'related-figures', 'read-next',
  // Reader: phone header and its sheet (PR #187)
  'text-hero-contents', 'text-running-head', 'text-sheet-contents', 'text-sheet-next',
  'text-sheet-read-next', 'text-sheet-prev', 'text-sheet',
  // Browse and index
  'ten-minutes', 'texts-index', 'authors-index', 'locations-index', 'search-results', 'search-chip',
  // Entity pages
  'author-page', 'collection-page', 'theme-page', 'era-page', 'tradition-page',
  'scripture-page', 'location-page',
])

const KNOWN = new Set(FROM_SURFACES)

/** True when `value` is a recorded `from` surface. */
export function isFromSurface(value) {
  return KNOWN.has(value)
}
