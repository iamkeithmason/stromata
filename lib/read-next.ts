/**
 * read-next — the "Continue exploring" module at the end of a text.
 *
 * Up to three next reads, each with a rationale that is a plain rule, never a
 * score the reader can't see: more from the same author, a text sharing one of
 * this text's themes, another text of the same genre by someone else. The
 * selection is pure and deterministic (same inputs → same three), so a pilot
 * comparison against texts without the module is not muddied by shuffling.
 *
 * The reader already has prev/next for a collection's own parts, so siblings of
 * this text's collection are excluded here — the module is for leaving it.
 */

export type ReadNextCandidate = {
  id: string
  title: string
  slug: string
  word_count: number | null
  collection_id: string | null
  authorId: string | null
  authorName: string | null
  /** Slugs of the themes this candidate carries (theme pool only). */
  themeSlugs?: string[]
  /** Cover fields, for the lead pick's book cover. */
  accessionNumber?: number | null
  deathYear?: number | null
  traditionSlug?: string | null
}

export type ReadNextPick = {
  slug: string
  title: string
  authorName: string | null
  /** The rule that chose it, or the editor's sentence, shown to the reader. */
  reason: string
  kind: 'editorial' | 'author' | 'theme' | 'genre'
  wordCount: number | null
  accessionNumber: number | null
  deathYear: number | null
  traditionSlug: string | null
}

export type ReadNextInput = {
  self: { id: string; collectionId: string | null; authorId: string | null; wordCount: number | null }
  authorName: string | null
  genreName: string | null
  /** This text's themes, in display order. */
  themes: { name: string; slug: string }[]
  sameAuthor: ReadNextCandidate[]
  sameTheme: ReadNextCandidate[]
  sameGenre: ReadNextCandidate[]
  /**
   * The editor's pick (texts.read_next_text_id, migration 033) and the sentence
   * saying why (read_next_note). It leads the module; the rules fill the rest.
   */
  editorial?: { candidate: ReadNextCandidate; note: string | null } | null
}

/** At most this many next reads: the module is a nudge, not a feed. */
const MAX_PICKS = 3

/** Caption for an editorial pick whose sentence has not been written yet. */
const EDITORIAL_FALLBACK = 'The editor’s choice'

/** Below this a text is a fragment, not a next read. Unknown length is admitted (ranked last). */
const MIN_WORDS = 400

function distance(c: ReadNextCandidate, wordCount: number | null): number {
  if (c.word_count == null || wordCount == null) return Number.MAX_SAFE_INTEGER
  return Math.abs(c.word_count - wordCount)
}

/** Closest in length to the text just read, then title, then slug: total order. */
function byCloseness(wordCount: number | null) {
  return (a: ReadNextCandidate, b: ReadNextCandidate) =>
    distance(a, wordCount) - distance(b, wordCount) ||
    a.title.localeCompare(b.title) ||
    a.slug.localeCompare(b.slug)
}

export function pickReadNext(input: ReadNextInput): ReadNextPick[] {
  const { self } = input
  const taken = new Set<string>([self.id])
  const picks: ReadNextPick[] = []

  const eligible = (c: ReadNextCandidate) =>
    !taken.has(c.id) &&
    (c.word_count == null || c.word_count >= MIN_WORDS) &&
    !(self.collectionId && c.collection_id === self.collectionId)

  const take = (c: ReadNextCandidate | undefined, reason: string, kind: ReadNextPick['kind']) => {
    if (!c) return
    taken.add(c.id)
    picks.push({
      slug: c.slug, title: c.title, authorName: c.authorName, reason, kind,
      wordCount: c.word_count,
      accessionNumber: c.accessionNumber ?? null,
      deathYear: c.deathYear ?? null,
      traditionSlug: c.traditionSlug ?? null,
    })
  }

  // 0. The editor's pick leads. It skips the rule filters (an editor may send a
  //    reader to a short text or a sibling part on purpose) but never to itself.
  const ed = input.editorial
  if (ed && ed.candidate.id !== self.id) {
    take(ed.candidate, ed.note?.trim() || EDITORIAL_FALLBACK, 'editorial')
  }

  const cmp = byCloseness(self.wordCount)

  // 1. More from the same author.
  const author = input.sameAuthor.filter(eligible).sort(cmp)[0]
  take(author, input.authorName ? `More from ${input.authorName}` : 'More from this author', 'author')

  // 2. A text sharing a theme — most shared themes wins. Always a different
  //    author: the author slot has already spoken for this one.
  const mine = new Map(input.themes.map((t, i) => [t.slug, { name: t.name, rank: i }]))
  const scored = input.sameTheme
    .filter(eligible)
    .map(c => {
      const shared = (c.themeSlugs ?? []).filter(s => mine.has(s))
      return { c, shared }
    })
    .filter(s => s.shared.length > 0 && !(self.authorId && s.c.authorId === self.authorId))
    .sort((a, b) => b.shared.length - a.shared.length || cmp(a.c, b.c))
  const theme = scored[0]
  if (theme) {
    // Name the shared theme that comes first in this text's own theme order.
    const lead = theme.shared.map(s => mine.get(s)!).sort((a, b) => a.rank - b.rank)[0]
    take(theme.c, `On ${lead.name}`, 'theme')
  }

  // 3. Another text of the same genre by a different author.
  const genre = input.sameGenre
    .filter(c => eligible(c) && !(self.authorId && c.authorId === self.authorId))
    .sort(cmp)[0]
  take(genre, input.genreName ? `Another ${input.genreName.toLowerCase()}` : 'In the same genre', 'genre')

  return picks.slice(0, MAX_PICKS)
}
