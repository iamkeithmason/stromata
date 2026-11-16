/**
 * The judgement half of /search: how a query is split into words, which short
 * labels (themes, genres, traditions, eras) it matches, how the result lists
 * merge, and when the page may say "no results". Pure and unit-tested
 * (query.test.ts); app/search/page.tsx does the I/O.
 *
 * WHY WORDS. Until 9 Nov 2026 every field was matched against the whole query
 * as one substring, so "on the providence of god" found nothing, though the
 * Providence theme has texts. The whole-phrase match stays as the first pass;
 * the word pass is added beside it.
 */

/** Words too common to identify anything. Kept short on purpose. */
export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'with', 'his', 'her', 'its', 'their',
])

const MAX_WORDS = 6

/**
 * The words of a query that can identify something: lower-cased, split on
 * anything that is not a letter or digit, stop words and single letters
 * dropped, duplicates removed, at most six kept.
 */
export function contentWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
  return [...new Set(words)].slice(0, MAX_WORDS)
}

/**
 * Does a short label (a theme, genre, tradition or era name) match the query?
 * Yes if the whole query appears in it, as before, or if any content word of
 * three letters or more does. A label is one or two words, so asking for every
 * query word would almost never match: "on the providence of god" should reach
 * the Providence theme, though no theme is called "god".
 */
export function labelMatches(label: string, query: string): boolean {
  const l = label.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (l.includes(q)) return true
  return contentWords(q).some((w) => w.length >= 3 && l.includes(w))
}

/**
 * Whether the word pass for titles and author names should run: only when the
 * query has two or more content words. With one, the whole-phrase pass already
 * covers it, and running both would double the queries for nothing.
 */
export function needsWordPass(query: string): boolean {
  return contentWords(query).length >= 2
}

type HasIdTitle = { id: string; title: string }

/**
 * Merge the result lists into what the page shows. Matches on title, theme,
 * genre, tradition, era or author come first, alphabetically, as they always
 * have. Body matches follow in the order given: by relevance when the ranked
 * search answered, alphabetically when the old substring fallback did. Each
 * text appears once, at its first position.
 */
export function mergeResults<T extends HasIdTitle>(
  metadataLists: T[][],
  bodyList: T[],
  limit = 20
): { texts: T[]; bodyMatchIds: Set<string> } {
  const seen = new Set<string>()
  const metadata: T[] = []
  for (const list of metadataLists) {
    for (const t of list) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      metadata.push(t)
    }
  }
  metadata.sort((a, b) => a.title.localeCompare(b.title))

  const body: T[] = []
  const bodyMatchIds = new Set<string>()
  for (const t of bodyList) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    body.push(t)
    bodyMatchIds.add(t.id)
  }

  const texts = [...metadata, ...body].slice(0, limit)
  const shown = new Set(texts.map((t) => t.id))
  for (const id of [...bodyMatchIds]) if (!shown.has(id)) bodyMatchIds.delete(id)
  return { texts, bodyMatchIds }
}

/**
 * True when every query the page ran failed. The page must then say search is
 * unavailable, not "No results": a failed read must never render as an empty
 * one, or a database outage would look like a gap in the library and fire the
 * search-no-results event as if it were a real finding.
 */
export function allFailed(results: { error: unknown }[]): boolean {
  return results.length > 0 && results.every((r) => r.error != null)
}

/**
 * The word a snippet should centre on: the whole query if the text contains
 * it, otherwise the first content word it contains, otherwise the query.
 */
export function snippetFocus(text: string, query: string): string {
  const lower = text.toLowerCase()
  if (lower.includes(query.toLowerCase())) return query
  return contentWords(query).find((w) => lower.includes(w)) ?? query
}
