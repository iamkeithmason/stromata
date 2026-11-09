/**
 * The body-match half of /search, with its fallback. The I/O arrives as three
 * functions, so the order of attempts can be tested without a database
 * (body-matches.test.ts).
 *
 * 1. `ranked`: the search_texts_body function (migration 036), which matches
 *    whole words and returns ids in relevance order with an excerpt each.
 * 2. `fetchByIds`: the listing columns for those ids (never `body`).
 * 3. `substring`: the old ilike '%query%' body match. Used when the function
 *    is missing (the migration not applied yet) or errors, so shipping the page
 *    before the migration changes nothing for readers.
 */

export type Excerpt = { excerpt: string; has_before: boolean; has_after: boolean }
export type RankedHit = Excerpt & { id: string; rank: number }
type Result<T> = { data: T | null; error: unknown }

export type BodyMatches<T> = {
  /** Body-matched texts, in relevance order when ranked, title order otherwise. */
  rows: T[]
  /** Excerpts by id when the ranked search supplied them; null means fetch them separately. */
  excerpts: Map<string, Excerpt> | null
  source: 'ranked' | 'substring'
  /** Set only when every attempt failed. */
  error: unknown
}

export async function findBodyMatches<T extends { id: string }>(deps: {
  ranked: () => PromiseLike<Result<RankedHit[]>>
  fetchByIds: (ids: string[]) => PromiseLike<Result<T[]>>
  substring: () => PromiseLike<Result<T[]>>
}): Promise<BodyMatches<T>> {
  const ranked = await deps.ranked()
  if (ranked.error == null && ranked.data) {
    const hits = ranked.data
    const excerpts = new Map<string, Excerpt>(
      hits.map((h) => [h.id, { excerpt: h.excerpt, has_before: h.has_before, has_after: h.has_after }])
    )
    if (hits.length === 0) return { rows: [], excerpts, source: 'ranked', error: null }
    const fetched = await deps.fetchByIds(hits.map((h) => h.id))
    if (fetched.error == null && fetched.data) {
      const byId = new Map(fetched.data.map((t) => [t.id, t]))
      const rows = hits.map((h) => byId.get(h.id)).filter((t): t is T => t !== undefined)
      return { rows, excerpts, source: 'ranked', error: null }
    }
  }
  const sub = await deps.substring()
  return {
    rows: sub.data ?? [],
    excerpts: null,
    source: 'substring',
    error: sub.error == null ? null : sub.error,
  }
}
