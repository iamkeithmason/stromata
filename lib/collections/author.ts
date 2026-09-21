/**
 * Collection authorship — derived from the collection's texts.
 *
 * `collections.author_id` is an *override*, not the source of truth. A null
 * means "inherit from my texts", which is the ordinary case: every text carries
 * a NOT NULL `author_id` already, so the collection's byline is a fact that can
 * always be computed rather than a second copy that has to be kept in step.
 *
 * Why: a standalone column is a drift surface, and drift in a purely displayed
 * field is invisible until someone happens to look. It had already happened —
 * `hydriotaphia-browne` sat with a null `author_id` while all five of its texts
 * were Sir Thomas Browne's, so the live collection page rendered with no byline,
 * no breadcrumb back to Browne, and no author in its <title>, meta description,
 * OG tags or BreadcrumbList JSON-LD. Deriving makes that case right for free and
 * keeps it right as texts are added.
 *
 * Two deliberate choices:
 *
 *  - **Derived from ALL texts, not just published ones.** The byline states who
 *    wrote the work; it is not a listing of what happens to be visible today. A
 *    published collection whose texts are still drafts (pastoral-rule-gregory,
 *    at time of writing) should still say "Gregory the Great".
 *  - **Multi-author collections list their names.** The corpus is single-author
 *    40-for-40 today, but that is a property of the current acquisition path
 *    (one work by one author, split into chapters), not of collections. An
 *    anthology or a letters-between-two-figures collection names everyone.
 *
 * The override survives for the cases derivation genuinely cannot reach: a
 * compiler or editor, or a collection-level attribution that differs from its
 * parts. When set, it wins outright.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CollectionAuthorRef = {
  name: string
  slug?: string | null
  /** A pipeline stub that hasn't been reviewed yet. Its page 404s until it has
   *  a published text (app/authors/[slug]/page.tsx), so it must not be linked. */
  draft?: boolean | null
}

/** Supabase returns an embedded relation as an object or a single-element array
 *  depending on how it infers the join; normalise both to one value. */
export type MaybeEmbedded<T> = T | T[] | null | undefined

export function one<T>(value: MaybeEmbedded<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * The authors to show for a collection, in reading order.
 *
 * An explicit override returns exactly that author. Otherwise the distinct
 * authors of the collection's texts are returned in order of first appearance
 * (so callers should pass texts already sorted by `collection_order`). Returns
 * an empty array when there is nothing to show at all.
 */
export function resolveCollectionAuthors(
  explicit: MaybeEmbedded<CollectionAuthorRef>,
  textAuthors: Array<MaybeEmbedded<CollectionAuthorRef>>
): CollectionAuthorRef[] {
  const override = one(explicit)
  if (override?.name) return [override]

  const seen = new Set<string>()
  const authors: CollectionAuthorRef[] = []

  for (const entry of textAuthors) {
    const author = one(entry)
    if (!author?.name) continue
    // Key on the slug where there is one — two authors can share a display name
    // far more easily than a slug, which is unique.
    const key = author.slug || `name:${author.name}`
    if (seen.has(key)) continue
    seen.add(key)
    authors.push(author)
  }

  return authors
}

/**
 * Whether to render this author as a link to their page.
 *
 * A draft author is an unreviewed pipeline stub whose page 404s while it has no
 * published texts. Deriving the byline from *all* texts means a published
 * collection can name an author who is still a stub — right as attribution,
 * wrong as a link — so the name renders as plain text in that case.
 */
export function isLinkable(author: CollectionAuthorRef): boolean {
  return Boolean(author.slug) && !author.draft
}

/** "Augustine", "Jerome and Augustine", "Basil, Gregory and John". */
export function formatAuthorNames(authors: CollectionAuthorRef[]): string {
  const names = authors.map(a => a.name).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Read a collection's authors straight from its texts.
 *
 * Note the absence of an `.eq('published', true)` filter — see the note above:
 * authorship is a fact about the work, not about what is currently visible.
 */
export async function fetchCollectionAuthors(
  supabase: SupabaseClient,
  collectionId: string,
  explicit: MaybeEmbedded<CollectionAuthorRef> = null
): Promise<CollectionAuthorRef[]> {
  const override = one(explicit)
  if (override?.name) return [override]

  const { data } = await supabase
    .from('texts')
    .select('author:authors(name, slug, draft)')
    .eq('collection_id', collectionId)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')

  const rows = (data ?? []) as Array<{ author: MaybeEmbedded<CollectionAuthorRef> }>
  return resolveCollectionAuthors(null, rows.map(r => r.author))
}
