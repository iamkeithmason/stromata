/**
 * The columns on `texts` that the public (anon) role may read.
 *
 * WHY THIS FILE EXISTS
 *
 * Migration 026 narrowed the anon role's SELECT on `texts` from a table-level
 * grant to a column-level one, so the editorial columns — `note_draft`,
 * `summary_draft`, `review_state`, `review_note` — are no longer readable by
 * the public client. That is correct and should stay.
 *
 * The trap is how PostgREST reports it. `select=*` expands to every column
 * including the ungranted ones, and the whole request is then refused with
 * `permission denied for table texts` — not a partial row, not a warning about
 * one column, a flat refusal. In a page that does
 *
 *     const { data: text } = await supabase.from('texts').select('*, …').single()
 *     if (!text) notFound()
 *
 * that refusal is indistinguishable from "no such text", so every reading page
 * on the site answered 404 while the indexes, which select explicit columns,
 * carried on working. It shipped silently and stayed silent.
 *
 * `app/authors/[slug]/page.tsx` already carried a comment about this on one
 * count query. The lesson had been learned in one place and written down
 * nowhere the next `select('*')` would meet it. Hence a shared constant: the
 * readable set is stated once, next to the reason, and a public page that needs
 * "everything" asks for this instead of `*`.
 *
 * WHAT IT CONTAINS
 *
 * Deliberately the whole anon-granted set, not the narrower list any one page
 * happens to render. The grant is the security boundary; this list only mirrors
 * it. Keeping them identical means a public page can never 404 for selecting a
 * column it was always allowed to read, while a newly added editorial column is
 * excluded by default — it simply never gets added here.
 *
 * KEEPING IT TRUE
 *
 * If a migration grants anon a new column on `texts`, add it here. If a
 * migration revokes one, remove it here in the same change. `public-columns.test.ts`
 * pins the editorial columns out of this list so a careless paste of `*`'s
 * expansion cannot quietly put them back.
 */
export const PUBLIC_TEXT_COLUMNS = [
  'accession_number',
  'author_id',
  'body',
  'collection_id',
  'collection_order',
  'created_at',
  'editorial_introduction',
  'featured',
  'featured_from',
  'featured_note',
  'genre_id',
  'id',
  'ocr_quality',
  'provenance_notes',
  'published',
  'published_at',
  'slug',
  'source_attribution',
  'source_url',
  'summary',
  'title',
  'translation_notes',
  'updated_at',
  'word_count',
] as const

/** Ready to drop into a PostgREST `.select()` in place of `*`. */
export const PUBLIC_TEXT_SELECT = PUBLIC_TEXT_COLUMNS.join(', ')

/**
 * Columns on `texts` the anon role is NOT granted (migration 026). Listed so
 * the test can assert they stay out of the public set, and so the next person
 * to meet a `permission denied for table texts` has the answer in one place.
 */
export const EDITORIAL_TEXT_COLUMNS = [
  'note_draft',
  'summary_draft',
  'review_state',
  'review_note',
] as const

/**
 * The same story on `collections`: anon cannot read `provenance_verified_at`
 * or `description_draft`, so `select('*')` there would fail identically. No
 * public query does that today — this is here so that if one is ever written,
 * the readable set is already stated rather than rediscovered through a 404.
 */
export const PUBLIC_COLLECTION_COLUMNS = [
  'author_id',
  'created_at',
  'description',
  'id',
  'published',
  'published_at',
  'slug',
  'title',
  'updated_at',
] as const

export const PUBLIC_COLLECTION_SELECT = PUBLIC_COLLECTION_COLUMNS.join(', ')

export const EDITORIAL_COLLECTION_COLUMNS = [
  'provenance_verified_at',
  'description_draft',
] as const
