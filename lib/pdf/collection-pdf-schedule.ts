import { after } from 'next/server'

/**
 * Rebuild a collection's stored PDF whenever its page is refreshed.
 *
 * Every save or publish that changes what a collection's PDF contains already
 * revalidates `/collections/<slug>`: publishing or editing a member text
 * (`textPaths` in publish-text.ts), saving the collection row or its
 * description (`entitySurfaces('collection')`), and a CLI script naming the
 * page. So the hook sits in the two revalidation helpers, keyed on that path,
 * rather than in each of the eight admin routes. A batch publish revalidates
 * once at the end, so a 40-chapter publish builds its collection's PDF once.
 *
 * The render runs in `after()`, once the admin response has gone, so a 9s
 * build never holds up a save. Best-effort, like revalidation itself: a
 * failure is logged, the save stands, and `npm run build:collection-pdfs --
 * --slug=<slug> --write` repairs it.
 *
 * Not covered: a CLI script that edits a chapter body and names only the text
 * page. Run the backfill for that collection afterwards.
 */

const COLLECTION_PAGE = /^\/collections\/([^/?#]+)$/

/** `/collections/<slug>` paths → their slugs, de-duplicated. Pure; exported for tests. */
export function collectionSlugsIn(paths: Iterable<string>): string[] {
  const slugs = new Set<string>()
  for (const p of paths) {
    const m = COLLECTION_PAGE.exec(p)
    if (m) slugs.add(decodeURIComponent(m[1]))
  }
  return [...slugs]
}

export function scheduleCollectionPdfRebuilds(paths: Iterable<string>): void {
  const slugs = collectionSlugsIn(paths)
  if (slugs.length === 0) return
  // No store connected (a local dev server, a preview): nothing to write to.
  if (!process.env.BLOB_READ_WRITE_TOKEN) return
  try {
    after(async () => {
      const [{ createServerClient }, { rebuildCollectionPdf }] = await Promise.all([
        import('@/lib/supabase/server'),
        import('@/lib/pdf/collection-pdf'),
      ])
      const supabase = createServerClient()
      // One at a time: each holds a whole collection's text in memory.
      for (const slug of slugs) {
        try {
          const outcome = await rebuildCollectionPdf(supabase, slug)
          console.log(`[collection-pdf] ${slug}: ${outcome.action}`)
        } catch (err) {
          console.error(`[collection-pdf] ${slug}: rebuild failed`, err)
        }
      }
    })
  } catch {
    // Outside a request scope (a test, a script): nothing to schedule.
  }
}
