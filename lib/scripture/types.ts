/**
 * A single scripture reference resolved from free text and normalised to a
 * canonical book / chapter / verse.
 *
 * Verse ranges that stay within one chapter carry `verseEnd`; whole-chapter
 * citations (e.g. "Romans 8") have `verse === null`. Cross-chapter ranges keep
 * only their starting point in the structured fields — the full span is still
 * preserved in `osis`.
 */
export interface ScriptureRef {
  /** OSIS string for the reference, e.g. "John.3.16" or a range "Rom.8.28-Rom.8.30". */
  osis: string
  /** OSIS book id — the stable canonical key, e.g. "John", "Rom", "1Cor", "Sir". */
  book: string
  /** Human-readable book name, e.g. "John", "1 Corinthians", "Sirach". */
  bookName: string
  /** Chapter number of the reference's start. */
  chapter: number
  /** Starting verse, or null for a whole-chapter reference. */
  verse: number | null
  /** Ending verse for a range within the same chapter, else null. */
  verseEnd: number | null
  /** The matched source substring (from the normalised text). */
  raw: string
  /** Start offset of the match in the ORIGINAL input text. */
  index: number
  /** End offset (exclusive) of the match in the ORIGINAL input text. */
  endIndex: number
}

/**
 * A parsed lookup query — the result of a reader typing a reference to search
 * for (e.g. "Romans 8:28"). Always a single point (book + chapter + optional
 * verse); ranges are collapsed to their start.
 */
export interface ReferenceQuery {
  book: string
  bookName: string
  chapter: number
  verse: number | null
  osis: string
}
