// Reading time, in minutes, rounded up to the nearest 5.
//
// TWO ENTRY POINTS, ONE RULE
//
// `readingMinutes(wordCount)` is what listing pages use. It takes the
// `texts.word_count` column (migration 028) so a page that prints "approx. N
// min read" for fifty rows transfers fifty integers rather than fifty bodies.
// Before that column existed every listing selected `body` for this one
// number, which is what put 11 GB through Supabase's egress in a month.
//
// `readingTime(body)` stays for the places that legitimately hold a body
// already — the reader page, the admin forms, scripts working on local
// markdown — so they need not thread a count around. It is the same rule
// applied to a body the caller was going to fetch anyway.
//
// The word-count expression in migration 028 is a deliberate mirror of the
// `.trim().split(/\s+/)` below, and reading-time.test.ts pins the pair.

/** Words per minute assumed for the reading-time estimate. */
const WORDS_PER_MINUTE = 200

/** Reading times are shown in 5-minute steps, so they read as estimates. */
const ROUND_TO_MINUTES = 5

/** Minutes for a known word count — the `texts.word_count` column. */
export function readingMinutes(wordCount: number | null | undefined): number {
  // A null count means the column was not selected, or a row predates it.
  // Zero is the honest answer: better a missing estimate than a wrong one.
  if (wordCount == null || !Number.isFinite(wordCount) || wordCount <= 0) return 0
  const raw = Math.ceil(wordCount / WORDS_PER_MINUTE)
  return Math.ceil(raw / ROUND_TO_MINUTES) * ROUND_TO_MINUTES
}

/** Words in a body, counted exactly as migration 028's generated column does. */
export function wordCount(body: string): number {
  return body.trim().split(/\s+/).length
}

/** Minutes for a body already in hand. Prefer `readingMinutes` in listings. */
export function readingTime(body: string): number {
  return readingMinutes(wordCount(body))
}
