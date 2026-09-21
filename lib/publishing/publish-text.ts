import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one way a text becomes public.
 *
 * Publishing used to be "set published = true somewhere and remember to call
 * revalidatePath five times" — written out inline in the two admin text routes,
 * and about to be written a third time for the review queue. Three copies of a
 * side-effect list is three chances to miss a surface, and the list was already
 * wrong: the inline version revalidates the home page, /texts, the text, its
 * author and its themes, but NOT the collection, era, tradition, authors index
 * or location pages — all of which render published texts and all of which are
 * ISR (`export const revalidate = 3600`). A text published from the collection
 * page's point of view simply didn't appear there for up to an hour.
 *
 * So: one `publishText()`, one `textPaths()`, and the admin routes call them
 * too. The review queue must never grow its own publish path.
 *
 * `published_at` is deliberately NOT set here. A database trigger
 * (`set_published_at_on_publish`, 019/021) stamps it on the false→true
 * transition and never rewrites it. Setting it from application code as well
 * would reintroduce exactly the read-then-write race that migration exists to
 * remove — see its comment.
 */

// ── Paths ────────────────────────────────────────────────────────────────────

/**
 * Everything that renders a published text, as page paths.
 *
 * Pure, so the surface list is testable without mocking `next/cache` or
 * Supabase — the I/O below just feeds it. Same shape as
 * `lib/authors/revalidate.ts#authorPaths`, for the same reason: a second
 * implementation of "where does this appear" is the thing that goes stale when
 * a new surface is added.
 *
 * NOT included, on purpose:
 *   /rss, /sitemap.xml, /llms.txt — `dynamic = 'force-dynamic'` + `revalidate = 0`.
 *     They are rendered per request and have nothing to invalidate.
 *   /texts/{slug}/download/*, /collections/{slug}/download/* — same.
 *   /search — renders from a live query, not ISR.
 *   /locations — its query reads authors only, never texts.
 *   /scripture/{ref} — one text cites up to 200 distinct book+chapter pages
 *     (30 on average), so a 122-text collection publish would mean thousands of
 *     revalidations. The /scripture index is refreshed; the per-reference pages
 *     stay on their existing cache behaviour, unchanged from before this module.
 */
export type TextSurfaces = {
  slug: string
  authorSlug?: string | null
  collectionSlug?: string | null
  themeSlugs?: (string | null | undefined)[]
  eraSlug?: string | null
  traditionSlug?: string | null
  locationSlug?: string | null
}

export function textPaths(t: TextSurfaces): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  const add = (p: string | null | undefined) => {
    if (!p) return
    if (seen.has(p)) return
    seen.add(p)
    paths.push(p)
  }

  add('/')            // homepage — recent additions, featured band
  add('/texts')       // the texts index
  add('/authors')     // the authors index shows per-author text counts
  add(`/texts/${t.slug}`)
  if (t.authorSlug) add(`/authors/${t.authorSlug}`)
  if (t.collectionSlug) add(`/collections/${t.collectionSlug}`)
  for (const s of t.themeSlugs ?? []) if (s) add(`/themes/${s}`)
  if (t.eraSlug) add(`/eras/${t.eraSlug}`)
  if (t.traditionSlug) add(`/traditions/${t.traditionSlug}`)
  if (t.locationSlug) add(`/locations/${t.locationSlug}`)
  add('/scripture')   // the index counts references across published texts

  return paths
}

// ── Result type ──────────────────────────────────────────────────────────────

/**
 * Discriminated reasons, per `scripts/pipeline-import.mjs`: a caller must be
 * able to tell a benign skip (`already_published`, on a re-submitted batch)
 * from a real refusal (`provenance_unverified`) from a failure (`write_failed`),
 * and never report a batch as published on the strength of skips alone.
 */
export type PublishRefusal =
  | 'not_found'
  | 'already_published'
  | 'not_approved'
  | 'provenance_unverified'
  | 'missing_introduction'
  | 'missing_summary'
  | 'summary_too_long'
  | 'description_not_approved'
  | 'write_failed'

export type PublishResult =
  | { ok: true; id: string; title: string; slug: string; paths: string[] }
  | { ok: false; id: string; title: string; reason: PublishRefusal; detail: string }

export const SUMMARY_MAX = 160

// ── The publish ──────────────────────────────────────────────────────────────

type PublishOptions = {
  /** Final introduction text. Falls back to the row's note_draft. */
  editorialIntroduction?: string | null
  /** Final summary. Falls back to the row's summary_draft, then its summary. */
  summary?: string | null
  /**
   * Require `review_state = 'approved'` and a provenance-verified collection.
   * The review queue passes true — the UI gates on both, and this is the
   * server-side re-check that actually enforces them. The plain admin edit form
   * passes false: it has always been a direct publish and stays one.
   */
  requireApproval?: boolean
  /** Skip revalidation — for batch callers that revalidate once at the end. */
  skipRevalidation?: boolean
}

export async function publishText(
  supabase: SupabaseClient,
  id: string,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const { requireApproval = false, skipRevalidation = false } = options

  const { data: row, error: readError } = await supabase
    .from('texts')
    .select(SURFACE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    return { ok: false, id, title: id, reason: 'write_failed', detail: readError.message }
  }
  if (!row) {
    return { ok: false, id, title: id, reason: 'not_found', detail: 'No text with that id.' }
  }

  const text = row as unknown as TextRow
  const title = text.title

  // Idempotent: re-submitting a batch that partly succeeded must be safe.
  if (text.published) {
    return { ok: false, id, title, reason: 'already_published', detail: 'Already published.' }
  }

  const collection = one(text.collection)

  if (requireApproval) {
    if (text.review_state !== 'approved') {
      return {
        ok: false, id, title, reason: 'not_approved',
        detail: `review_state is "${text.review_state ?? 'null'}", not "approved".`,
      }
    }
    if (collection && !collection.provenance_verified_at) {
      return {
        ok: false, id, title, reason: 'provenance_unverified',
        detail: `Provenance for collection "${collection.slug}" has not been verified.`,
      }
    }
  }

  const introduction = firstNonEmpty(options.editorialIntroduction, text.editorial_introduction, text.note_draft)
  if (!introduction) {
    return {
      ok: false, id, title, reason: 'missing_introduction',
      detail: 'No editorial introduction, and no note_draft to fall back on.',
    }
  }

  const summary = firstNonEmpty(options.summary, text.summary, text.summary_draft)
  if (!summary) {
    return {
      ok: false, id, title, reason: 'missing_summary',
      detail: 'No summary, and no summary_draft to fall back on.',
    }
  }
  if (summary.length > SUMMARY_MAX) {
    return {
      ok: false, id, title, reason: 'summary_too_long',
      detail: `Summary is ${summary.length} characters; the limit is ${SUMMARY_MAX}.`,
    }
  }

  const { error: writeError } = await supabase
    .from('texts')
    .update({
      editorial_introduction: introduction,
      summary,
      published: true,
      // published_at: left to the database trigger, on purpose (see header).
      // note_draft: untouched, on purpose — it stays as the record of what the
      // generator originally produced, so an edit can always be compared back.
      review_state: null, // out of the queue
    })
    .eq('id', id)

  if (writeError) {
    return { ok: false, id, title, reason: 'write_failed', detail: writeError.message }
  }

  const paths = surfacePathsFor(text)

  if (!skipRevalidation) revalidatePaths(paths)

  return { ok: true, id, title, slug: text.slug, paths }
}

/**
 * Publish the collection row itself.
 *
 * Separate from publishText because a collection is published once, not once
 * per chapter — and because it has its own gate: its description has to exist
 * (approved from `description_draft`) before the collection page is worth
 * showing. Returns the same discriminated shape.
 */
export async function publishCollection(
  supabase: SupabaseClient,
  id: string,
  options: { description?: string | null; skipRevalidation?: boolean } = {}
): Promise<PublishResult> {
  const { data: row, error: readError } = await supabase
    .from('collections')
    .select('id, title, slug, published, description, description_draft, provenance_verified_at, author:authors(slug)')
    .eq('id', id)
    .maybeSingle()

  if (readError) return { ok: false, id, title: id, reason: 'write_failed', detail: readError.message }
  if (!row) return { ok: false, id, title: id, reason: 'not_found', detail: 'No collection with that id.' }

  const collection = row as unknown as CollectionRow
  const title = collection.title

  if (collection.published) {
    return { ok: false, id, title, reason: 'already_published', detail: 'Already published.' }
  }
  if (!collection.provenance_verified_at) {
    return {
      ok: false, id, title, reason: 'provenance_unverified',
      detail: 'Provenance has not been verified for this collection.',
    }
  }

  // Deliberately NOT falling back to `description_draft`. Approving the
  // description in the queue is what copies draft → description, so a filled
  // `description` *is* the approval record — there is no separate flag. Falling
  // back to the draft here would publish text nobody had approved, which is the
  // one thing the gate exists to prevent.
  const description = firstNonEmpty(options.description, collection.description)
  if (!description) {
    return {
      ok: false, id, title, reason: 'description_not_approved',
      detail: 'The collection description has not been approved.',
    }
  }

  const { error: writeError } = await supabase
    .from('collections')
    .update({ description, published: true })
    .eq('id', id)

  if (writeError) return { ok: false, id, title, reason: 'write_failed', detail: writeError.message }

  const paths = ['/', '/texts', `/collections/${collection.slug}`]
  const authorSlug = one(collection.author)?.slug
  if (authorSlug) paths.push(`/authors/${authorSlug}`)

  if (!options.skipRevalidation) revalidatePaths(paths)

  return { ok: true, id, title, slug: collection.slug, paths }
}

/**
 * Refresh every surface a text appears on, without changing it.
 *
 * This is what the ordinary admin edit form needs: it has already written the
 * row, and now has to invalidate the same set of pages a publish would. Reading
 * the row back is deliberate — the alternative is for each caller to assemble
 * era / tradition / location / collection slugs from its own request payload,
 * which is how the inline version came to be missing four of them.
 *
 * `alsoTextSlugs` covers a renamed text: pass the slug as it was before the
 * save, or the page at the old path keeps serving its stale copy. Same reason
 * `revalidateAuthor` takes `alsoSlugs`.
 *
 * Best-effort, like `revalidateAuthor`: the save is already committed by the
 * time this runs, and a stale page is a far smaller problem than a save that
 * reports failure after having saved.
 */
export async function revalidateText(
  supabase: SupabaseClient,
  id: string,
  alsoTextSlugs: (string | null | undefined)[] = []
): Promise<void> {
  try {
    const { data } = await supabase.from('texts').select(SURFACE_SELECT).eq('id', id).maybeSingle()
    if (!data) return
    const paths = surfacePathsFor(data as unknown as TextRow)
    for (const s of alsoTextSlugs) if (s) paths.push(`/texts/${s}`)
    revalidatePaths([...new Set(paths)])
  } catch {
    // Swallowed on purpose — see above.
  }
}

/**
 * Best-effort, like `revalidateAuthor`: the write is already committed by the
 * time this runs, and a stale page is a far smaller problem than a publish that
 * reports failure after having published.
 */
export function revalidatePaths(paths: string[]): void {
  for (const path of paths) {
    try {
      revalidatePath(path)
    } catch {
      /* one bad path must not stop the rest */
    }
  }
}

// ── internals ────────────────────────────────────────────────────────────────

/**
 * The one select that names every relation a text's public surfaces depend on.
 * Shared by `publishText` and `revalidateText` so the two can't disagree about
 * which relations matter.
 */
const SURFACE_SELECT =
  'id, title, slug, published, review_state, note_draft, editorial_introduction, summary, summary_draft, ' +
  'author:authors(slug, era:eras(slug), tradition:traditions(slug), location:locations(slug)), ' +
  'collection:collections(id, slug, published, provenance_verified_at, description, description_draft), ' +
  'text_themes(theme:themes(slug))'

function surfacePathsFor(text: TextRow): string[] {
  const author = one(text.author)
  return textPaths({
    slug: text.slug,
    authorSlug: author?.slug,
    collectionSlug: one(text.collection)?.slug,
    themeSlugs: (text.text_themes ?? []).map(tt => one(tt.theme)?.slug),
    eraSlug: one(author?.era)?.slug,
    traditionSlug: one(author?.tradition)?.slug,
    locationSlug: one(author?.location)?.slug,
  })
}

/**
 * supabase-js types an embedded to-one relation as an array in some query
 * shapes and an object in others; every caller in this app already pays for
 * that with a `[0]` or a cast. One helper instead of that cast repeated.
 */
function one<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const trimmed = (v ?? '').trim()
    if (trimmed) return trimmed
  }
  return null
}

type SlugRef = { slug: string | null }
type TextRow = {
  id: string
  title: string
  slug: string
  published: boolean
  review_state: string | null
  note_draft: string | null
  editorial_introduction: string | null
  summary: string | null
  summary_draft: string | null
  author: { slug: string | null; era: SlugRef | SlugRef[] | null; tradition: SlugRef | SlugRef[] | null; location: SlugRef | SlugRef[] | null } | Array<{ slug: string | null; era: SlugRef | SlugRef[] | null; tradition: SlugRef | SlugRef[] | null; location: SlugRef | SlugRef[] | null }> | null
  collection: CollectionEmbed | CollectionEmbed[] | null
  text_themes: { theme: SlugRef | SlugRef[] | null }[]
}
type CollectionEmbed = {
  id: string
  slug: string
  published: boolean
  provenance_verified_at: string | null
  description: string | null
  description_draft: string | null
}
type CollectionRow = {
  id: string
  title: string
  slug: string
  published: boolean
  description: string | null
  description_draft: string | null
  provenance_verified_at: string | null
  author: SlugRef | SlugRef[] | null
}
