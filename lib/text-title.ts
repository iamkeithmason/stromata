/**
 * The <title> and og:title of a text page.
 *
 * Named authors lead, because readers find texts by author: "Augustine of
 * Hippo — Confessions | The Stromata". A placeholder author does not: "Unknown
 * (Early Church) — The Didache" put the placeholder first in search results
 * and share previews (seen in a Facebook preview, 10 Nov 2026), so anonymous
 * and unknown authors drop out and the title leads: "The Didache | The Stromata".
 */

/** True for the corpus's placeholder authors: "Unknown (…)" and "Anonymous (…)". */
export function isPlaceholderAuthor(name: string | null | undefined): boolean {
  return !name || /^\s*(unknown|anonymous)\b/i.test(name)
}

export function textPageTitle(title: string, author: string | null | undefined): string {
  return isPlaceholderAuthor(author) ? `${title} | The Stromata` : `${author} — ${title} | The Stromata`
}

/** The description used when a text has no summary. */
export function textPageFallbackDescription(title: string, author: string | null | undefined): string {
  return isPlaceholderAuthor(author)
    ? `${title}, freely readable at The Stromata.`
    : `${author}'s ${title}, freely readable at The Stromata.`
}
