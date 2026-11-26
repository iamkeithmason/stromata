import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Revalidate every cached page that renders an author.
 *
 * The content routes are ISR (`export const revalidate = 3600`), so without
 * this an edit is invisible for up to an hour — which is how reframing a
 * portrait came to look broken on 2026-09-15: the framing was stored and the
 * component applied it correctly, but the homepage kept serving a render from
 * before the edit. The texts routes have called `revalidatePath` on save since
 * they were written; the author routes simply never did.
 *
 * One function rather than a copy in each of the four author-mutating routes:
 * a second implementation of "where does an author appear" is the thing that
 * goes stale when a new surface is added.
 *
 * Surfaces, all of which draw the portrait through LancetArch:
 *   /                — FeaturedAuthors and SeasonalPanel
 *   /authors         — AuthorsBrowser
 *   /authors/{slug}  — the author page
 *   /texts/{slug}    — AuthorAside, for every text of theirs
 *
 * `alsoSlugs` covers a renamed author: pass the slug as it was before the
 * update, or the page at the old path keeps serving its stale copy.
 *
 * Best-effort by design — a revalidation failure must not fail the save the
 * operator just made. The work is already committed by the time this runs.
 */
/**
 * The paths an author's data appears on. Pure, so the surface list is testable
 * without mocking `next/cache` or Supabase — the I/O below just feeds it.
 *
 * Nullish and duplicate slugs are dropped rather than producing `/authors/null`
 * or a repeated revalidation when the slug did not change.
 */
export function authorPaths(
  authorSlugs: (string | null | undefined)[],
  textSlugs: (string | null | undefined)[] = []
): string[] {
  const paths = ['/', '/authors']
  const seen = new Set(paths)
  const add = (p: string) => {
    if (!seen.has(p)) { seen.add(p); paths.push(p) }
  }
  for (const s of authorSlugs) if (s) add(`/authors/${s}`)
  for (const s of textSlugs) if (s) add(`/texts/${s}`)
  return paths
}

export async function revalidateAuthor(
  supabase: SupabaseClient,
  authorId: string | number,
  alsoSlugs: (string | null | undefined)[] = []
): Promise<void> {
  try {
    const { data: author } = await supabase
      .from('authors')
      .select('slug')
      .eq('id', authorId)
      .single()

    const { data: texts } = await supabase
      .from('texts')
      .select('slug')
      .eq('author_id', authorId)

    const paths = authorPaths(
      [author?.slug as string | undefined, ...alsoSlugs],
      (texts ?? []).map(t => t?.slug as string | undefined)
    )
    for (const path of paths) revalidatePath(path)
  } catch {
    // Swallowed on purpose: the write succeeded, and a stale page is a far
    // smaller problem than a save that reports failure after committing.
  }
}

/**
 * Revalidate one author page only. For a change that no other surface renders
 * (the Begin with pick appears only on /authors/{slug}), so a save does not
 * mark every one of the author's texts stale as `revalidateAuthor` does: for
 * Augustine that would be 208 pages for crawlers to re-render.
 */
export function revalidateAuthorPage(slug: string | null | undefined): void {
  if (!slug) return
  try {
    revalidatePath(`/authors/${slug}`)
  } catch {
    // Best-effort, as above.
  }
}
