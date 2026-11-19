import { collectionPdfPathname, collectionPdfUrl } from '@/lib/pdf/collection-pdf'

export const runtime = 'nodejs'

// GET /collections/[slug]/download/pdf
//
// Redirects to the collection's stored PDF. It never renders one: the file is
// built when the collection or one of its texts is published or edited
// (lib/pdf/collection-pdf-schedule.ts), or by `npm run build:collection-pdfs`.
// Until 18 Nov 2026 this route rendered the whole collection with @react-pdf
// on every CDN miss (~9s of CPU for The City of God).
//
// No database read either: the stored file's URL is fixed by the slug, so the
// redirect is pure string work, and the CDN holds it for a week. An unpublished
// collection's file is removed, so its redirect lands on the store's 404.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = collectionPdfUrl(slug)

  if (!url) {
    // The Blob store is not connected to this deployment (BLOB_READ_WRITE_TOKEN).
    return new Response(`The PDF of this collection is not available yet (${collectionPdfPathname(slug)}).`, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '86400', 'Cache-Control': 'no-store' },
    })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=604800',
    },
  })
}
