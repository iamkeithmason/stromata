/**
 * Parameters for the admin Library (/admin/texts): one server-paginated,
 * searchable index of every text, replacing the dashboard's unpaginated list.
 *
 * Pure so it is unit-tested; /admin cannot be opened by Claude (CLAUDE.md), so
 * the parsing and the search-term escaping are verified here instead.
 *
 * Meter: Egress. A page reads PAGE_SIZE rows of metadata columns, never `body`.
 */

export const PAGE_SIZE = 50

export type StatusFacet = 'all' | 'published' | 'draft'
export type TriFacet = 'any' | 'yes' | 'no'

export type TextIndexParams = {
  q: string
  status: StatusFacet
  /** Facet values are slugs/ids as strings; '' means no filter. */
  genre: string
  tradition: string
  era: string
  intro: TriFacet
  authorDraft: TriFacet
  /** `missing` = no source URL or no provenance notes. */
  provenance: 'any' | 'missing'
  page: number
}

type Raw = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
}

function pick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export function parseTextIndexParams(raw: Raw): TextIndexParams {
  const page = Number.parseInt(first(raw.page), 10)
  return {
    q: first(raw.q).slice(0, 100),
    status: pick(first(raw.status), ['all', 'published', 'draft'] as const, 'all'),
    genre: first(raw.genre),
    tradition: first(raw.tradition),
    era: first(raw.era),
    intro: pick(first(raw.intro), ['any', 'yes', 'no'] as const, 'any'),
    authorDraft: pick(first(raw.authorDraft), ['any', 'yes', 'no'] as const, 'any'),
    provenance: pick(first(raw.provenance), ['any', 'missing'] as const, 'any'),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/**
 * Make a free-text term safe inside a PostgREST `or=(…)` / `ilike` filter.
 * Commas, parentheses and quotes would end or reshape the filter expression;
 * `%`, `_` and `\` are LIKE wildcards/escapes. Dropping them loses nothing a
 * title or name search needs.
 */
export function searchTerm(q: string): string {
  return q.replace(/[,()"'%_\\*]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Inclusive row range for `.range()` for a 1-based page. */
export function pageRange(page: number): [number, number] {
  const from = (Math.max(1, page) - 1) * PAGE_SIZE
  return [from, from + PAGE_SIZE - 1]
}

export function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE))
}

/** Query string for a link, omitting defaults so URLs stay short and stable. */
export function toQueryString(p: TextIndexParams, over: Partial<TextIndexParams> = {}): string {
  const m = { ...p, ...over }
  const u = new URLSearchParams()
  if (m.q) u.set('q', m.q)
  if (m.status !== 'all') u.set('status', m.status)
  if (m.genre) u.set('genre', m.genre)
  if (m.tradition) u.set('tradition', m.tradition)
  if (m.era) u.set('era', m.era)
  if (m.intro !== 'any') u.set('intro', m.intro)
  if (m.authorDraft !== 'any') u.set('authorDraft', m.authorDraft)
  if (m.provenance !== 'any') u.set('provenance', m.provenance)
  if (m.page > 1) u.set('page', String(m.page))
  const s = u.toString()
  return s ? `?${s}` : ''
}
