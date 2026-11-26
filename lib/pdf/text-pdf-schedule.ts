import { after } from 'next/server'

/**
 * Rebuild the stored PDFs of texts whose content just changed (text-pdf.ts).
 *
 * Called with explicit slugs by the places that change a text: publishText,
 * revalidateText (every admin save, with the pre-rename slug too, so the old
 * file is removed), the paragraph-break approval, and the CLI revalidation
 * endpoint. Not keyed on revalidated paths, unlike collections: publishing one
 * chapter refreshes every sibling's page (prev/next), and rebuilding every
 * sibling's PDF for that would waste CPU on files that did not change.
 *
 * Runs in `after()`, once the admin response has gone. Best-effort: a failure
 * is logged, the save stands, and `npm run build:text-pdfs -- --slug=<slug>
 * --write` repairs it.
 */

const TEXT_PAGE = /^\/texts\/([^/?#]+)$/

/** `/texts/<slug>` paths → their slugs, de-duplicated. Pure; exported for tests. */
export function textSlugsIn(paths: Iterable<string>): string[] {
  const slugs = new Set<string>()
  for (const p of paths) {
    const m = TEXT_PAGE.exec(p)
    if (m) slugs.add(decodeURIComponent(m[1]))
  }
  return [...slugs]
}

export function scheduleTextPdfRebuilds(slugs: Iterable<string | null | undefined>): void {
  const list = [...new Set([...slugs].filter((s): s is string => !!s))]
  if (list.length === 0) return
  // No store connected (a local dev server, a preview): nothing to write to.
  if (!process.env.BLOB_READ_WRITE_TOKEN) return
  try {
    after(async () => {
      const [{ createServerClient }, { rebuildTextPdf }] = await Promise.all([
        import('@/lib/supabase/server'),
        import('@/lib/pdf/text-pdf'),
      ])
      const supabase = createServerClient()
      for (const slug of list) {
        try {
          const outcome = await rebuildTextPdf(supabase, slug)
          console.log(`[text-pdf] ${slug}: ${outcome.action}`)
        } catch (err) {
          console.error(`[text-pdf] ${slug}: rebuild failed`, err)
        }
      }
    })
  } catch {
    // Outside a request scope (a test, a script): nothing to schedule.
  }
}
