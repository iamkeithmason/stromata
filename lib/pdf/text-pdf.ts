import type { SupabaseClient } from '@supabase/supabase-js'
import type { DownloadableText } from '@/lib/downloads'
import { TextDocument } from '@/lib/pdf/TextDocument'
import { blobBaseUrl, type RebuildOutcome } from '@/lib/pdf/collection-pdf'

/**
 * A text's PDF, built once and stored, never rendered on request.
 *
 * The same arrangement as a collection's (collection-pdf.ts), restored for texts
 * on 20 Nov 2026. From 18 Nov a text's PDF had been the browser's own Print /
 * Save as PDF, but readers choose PDF for 88-94% of downloads, so Keith kept
 * the real file: rendered with the same TextDocument as before 18 Nov, stored
 * in Vercel Blob at `texts/<slug>.pdf`, and served by a redirect from
 * `/texts/[slug]/download/pdf`.
 *
 * WHEN IT IS BUILT: when the text itself changes, through
 * `scheduleTextPdfRebuilds` (text-pdf-schedule.ts), called by publishText,
 * revalidateText (every admin save), the paragraph-break approval and the CLI
 * revalidation endpoint. NOT on a sibling's publish: a chapter's PDF carries no
 * prev/next, so the other chapters' PDFs do not change. An author's name or
 * dates, which the PDF prints, are not a text save: run the backfill for that
 * author's texts after such an edit.
 *
 * METERS, per build: Supabase egress for one body (avg ~50 KB); one Blob write;
 * ~0.7s of render CPU wherever it runs.
 */

/** The file's path inside the store. Deterministic, so the URL is too. */
export function textPdfPathname(slug: string): string {
  return `texts/${slug.replace(/[^a-z0-9-]/gi, '-')}.pdf`
}

/** Where a text's stored PDF is served from, or null with no store. */
export function textPdfUrl(slug: string, env?: Record<string, string | undefined>): string | null {
  const base = blobBaseUrl(env)
  return base ? `${base}/${textPdfPathname(slug)}` : null
}

/**
 * Render a published text's PDF, or null when no published text has the slug
 * (unpublished, renamed away), which callers treat as "remove the stored file".
 * Pass the service-role client (admin) or the anon key (backfill), never the
 * cached public client: its reads are a week old.
 */
export async function renderTextPdf(supabase: SupabaseClient, slug: string): Promise<Buffer | null> {
  const { data } = await supabase
    .from('texts')
    .select(`
      title, slug, body, summary, editorial_introduction, accession_number,
      source_attribution, provenance_notes, translation_notes,
      genre:genres(name),
      author:authors(name, tradition:traditions(name), era:eras(label))
    `)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (!data) return null

  // ESM-only package: a dynamic import, as TextDocument.tsx explains.
  const { renderToBuffer } = await import('@react-pdf/renderer')
  return renderToBuffer(await TextDocument({ text: data as unknown as DownloadableText }))
}

/**
 * Render and store one text's PDF, or remove the stored file when the text is
 * no longer published. Overwrites in place, so the URL never changes.
 */
export async function rebuildTextPdf(
  supabase: SupabaseClient,
  slug: string,
  options: { dryRun?: boolean } = {}
): Promise<RebuildOutcome> {
  if (!options.dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
    return { slug, action: 'skipped', reason: 'BLOB_READ_WRITE_TOKEN is not set' }
  }
  const buffer = await renderTextPdf(supabase, slug)
  const pathname = textPdfPathname(slug)

  if (!buffer) {
    if (!options.dryRun) {
      const { del } = await import('@vercel/blob')
      const url = textPdfUrl(slug)
      if (url) await del(url).catch(() => undefined) // absent already is fine
    }
    return { slug, action: 'removed' }
  }

  if (options.dryRun) {
    return { slug, action: 'stored', bytes: buffer.length, url: textPdfUrl(slug) ?? '(no store)' }
  }

  const { put } = await import('@vercel/blob')
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 86400,
  })

  const expected = textPdfUrl(slug)
  if (expected && blob.url !== expected) {
    throw new Error(
      `Stored ${pathname} at ${blob.url}, but the download route would redirect to ${expected}. ` +
        'Set BLOB_PUBLIC_BASE_URL to the origin of the first URL.'
    )
  }
  return { slug, action: 'stored', bytes: buffer.length, url: blob.url }
}
