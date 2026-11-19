/**
 * The editorial slot on the homepage: which text, if any, the editor is
 * putting forward today.
 *
 * The rule is the sentence the admin text form states (EditTextForm):
 * "One text is shown at a time — the most recently featured wins. Feast days
 * take priority over editorial picks." Plus a third step, the fallback, which
 * lives in the page: with no pick the slot is simply absent and the recency
 * lead ("New addition") carries the top of the feed as before.
 *
 *   1. an author whose `feast_day` is today        → kind 'feast'
 *   2. the featured text with the latest `featured_from` that has begun
 *      (a null `featured_from` counts as "from the start", ranked last)
 *                                                  → kind 'editorial'
 *   3. nothing                                     → null
 *
 * Pure, so it is tested without a database. The page does the reads.
 */

export type FeaturedCandidate = {
  id: string
  /** YYYY-MM-DD, or null = no start date. */
  featured_from: string | null
  /** Rank within a feast day: newest first. */
  created_at: string
}

export type EditorialPick<T extends FeaturedCandidate> =
  | { kind: 'feast'; text: T }
  | { kind: 'editorial'; text: T }

/** 'MM-DD' for a date, in UTC — the format `authors.feast_day` is stored in. */
export function feastKey(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${m}-${d}`
}

/** 'YYYY-MM-DD' for a date, in UTC — comparable with a Postgres DATE. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function pickEditorial<T extends FeaturedCandidate>(input: {
  /** Published texts by authors whose feast day is today. */
  feastTexts: T[]
  /** Published texts with featured = true. */
  featured: T[]
  today: Date
}): EditorialPick<T> | null {
  const { feastTexts, featured, today } = input

  if (feastTexts.length > 0) {
    // Several texts by one saint (or several saints on one day): newest first,
    // id as the tie-break so the choice never flickers between renders.
    const [first] = [...feastTexts].sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
    )
    return { kind: 'feast', text: first }
  }

  const day = isoDay(today)
  const begun = featured.filter(t => !t.featured_from || t.featured_from <= day)
  if (begun.length === 0) return null
  const [first] = [...begun].sort((a, b) => {
    // A dated pick outranks an undated one; later date outranks earlier.
    if (a.featured_from !== b.featured_from) {
      if (!a.featured_from) return 1
      if (!b.featured_from) return -1
      return b.featured_from.localeCompare(a.featured_from)
    }
    return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)
  })
  return { kind: 'editorial', text: first }
}
