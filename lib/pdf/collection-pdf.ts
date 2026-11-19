import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatAuthorNames,
  resolveCollectionAuthors,
  type CollectionAuthorRef,
  type MaybeEmbedded,
} from '@/lib/collections/author'
import type { DownloadableCollection, DownloadableText } from '@/lib/downloads'
import { CollectionDocument } from '@/lib/pdf/TextDocument'

/**
 * A collection's PDF, built once and stored, never rendered on request.
 *
 * WHY (18 Nov 2026). `/collections/[slug]/download/pdf` used to render the
 * whole collection with @react-pdf on every CDN miss: ~9s of CPU for The City
 * of God, and every deploy or week-old cache entry paid it again. The PDF only
 * changes when the collection or one of its texts does, so it is now built at
 * that moment (an admin save or publish, via collection-pdf-schedule.ts) or by
 * the backfill script, and the download route redirects to the stored file.
 *
 * STORAGE: Vercel Blob, not Supabase Storage. Supabase egress is 5 GB a cycle
 * shared with Paideia and was overrun in Sept 2026; a PDF averages ~0.8 MB
 * (City of God 3.5 MB), so downloads would draw straight on it. Blob draws on
 * the Vercel account's Blob allowance instead. Comparison and numbers: the PR
 * and CHANGELOG 2026-11-18.
 *
 * METERS, per build: Supabase egress for the collection's published bodies
 * (avg ~0.5 MB, max ~2.4 MB); one Blob write; and wherever it runs, the render
 * CPU (0.5–9s). Reading is a plain CDN fetch of the stored file.
 */

/** The file's path inside the store. Deterministic, so the URL is too. */
export function collectionPdfPathname(slug: string): string {
  return `collections/${slug.replace(/[^a-z0-9-]/gi, '-')}.pdf`
}

/**
 * The store's public base URL, from its read-write token
 * (`vercel_blob_rw_<storeId>_<secret>` → `https://<storeid>.public.blob.vercel-storage.com`).
 * `BLOB_PUBLIC_BASE_URL` overrides it. Null when neither is set, i.e. the store
 * is not connected yet. Pure; exported for tests.
 */
export function blobBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const override = env.BLOB_PUBLIC_BASE_URL?.trim()
  if (override) return override.replace(/\/+$/, '')
  const token = env.BLOB_READ_WRITE_TOKEN?.trim()
  if (!token) return null
  const storeId = token.split('_')[3]
  if (!storeId) return null
  return `https://${storeId.replace(/^store_/, '').toLowerCase()}.public.blob.vercel-storage.com`
}

/** Where a collection's stored PDF is served from, or null with no store. */
export function collectionPdfUrl(slug: string, env?: Record<string, string | undefined>): string | null {
  const base = blobBaseUrl(env)
  return base ? `${base}/${collectionPdfPathname(slug)}` : null
}

const TEXT_SELECT = `
  title, slug, body, summary, editorial_introduction, accession_number,
  source_attribution, provenance_notes, translation_notes,
  genre:genres(name),
  author:authors(name, tradition:traditions(name), era:eras(label))
`

/**
 * Render a published collection's PDF. Null when there is no published
 * collection with that slug (or it has no published texts), which callers
 * treat as "remove the stored file".
 *
 * Explicit `published` filters, so it gives the same answer through the
 * service-role client (admin routes) as through the anon key (the backfill).
 * Never pass the public client from inside Next: its reads are cached for a
 * week, and a rebuild would render last week's text.
 */
export async function renderCollectionPdf(
  supabase: SupabaseClient,
  slug: string
): Promise<Buffer | null> {
  const { data: collection } = await supabase
    .from('collections')
    .select('id, title, slug, description, author:authors(name)')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (!collection) return null
  const id = (collection as { id: string }).id

  const { data: texts } = await supabase
    .from('texts')
    .select(TEXT_SELECT)
    .eq('collection_id', id)
    .eq('published', true)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')
  if (!texts || texts.length === 0) return null

  // The byline is derived from the published texts by the collection page's
  // rule (lib/collections/author.ts), from the rows already in hand: asking
  // fetchCollectionAuthors through the service-role client would count drafts.
  const authorNames = formatAuthorNames(
    resolveCollectionAuthors(
      (collection as { author?: MaybeEmbedded<CollectionAuthorRef> }).author ?? null,
      (texts as Array<{ author: MaybeEmbedded<CollectionAuthorRef> }>).map(t => t.author)
    )
  )
  const downloadable: DownloadableCollection = {
    ...(collection as unknown as DownloadableCollection),
    author: authorNames ? { name: authorNames } : null,
  }

  // ESM-only package: a dynamic import, as TextDocument.tsx explains.
  const { renderToBuffer } = await import('@react-pdf/renderer')
  return renderToBuffer(
    await CollectionDocument({ collection: downloadable, texts: texts as unknown as DownloadableText[] })
  )
}

export type RebuildOutcome =
  | { slug: string; action: 'stored'; bytes: number; url: string }
  | { slug: string; action: 'removed' }
  | { slug: string; action: 'skipped'; reason: string }

/**
 * Render and store one collection's PDF, or remove the stored file when the
 * collection is no longer published (unpublished, renamed away, emptied).
 * Overwrites in place, so the URL never changes.
 */
export async function rebuildCollectionPdf(
  supabase: SupabaseClient,
  slug: string,
  options: { dryRun?: boolean } = {}
): Promise<RebuildOutcome> {
  if (!options.dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
    return { slug, action: 'skipped', reason: 'BLOB_READ_WRITE_TOKEN is not set' }
  }
  const buffer = await renderCollectionPdf(supabase, slug)
  const pathname = collectionPdfPathname(slug)

  if (!buffer) {
    if (!options.dryRun) {
      const { del } = await import('@vercel/blob')
      const url = collectionPdfUrl(slug)
      if (url) await del(url).catch(() => undefined) // absent already is fine
    }
    return { slug, action: 'removed' }
  }

  if (options.dryRun) {
    return { slug, action: 'stored', bytes: buffer.length, url: collectionPdfUrl(slug) ?? '(no store)' }
  }

  const { put } = await import('@vercel/blob')
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
    allowOverwrite: true,
    // A day at the CDN and in the browser: an edit shows in the PDF within a
    // day at worst, and a popular file costs at most one store read a day.
    cacheControlMaxAge: 86400,
  })

  // The download route builds the URL from the token rather than asking the
  // store on every click. If that derivation is ever wrong, say so loudly here
  // instead of letting readers find out from a 404.
  const expected = collectionPdfUrl(slug)
  if (expected && blob.url !== expected) {
    throw new Error(
      `Stored ${pathname} at ${blob.url}, but the download route would redirect to ${expected}. ` +
        'Set BLOB_PUBLIC_BASE_URL to the origin of the first URL.'
    )
  }
  return { slug, action: 'stored', bytes: buffer.length, url: blob.url }
}
