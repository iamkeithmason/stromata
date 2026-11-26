import { textPdfPathname, textPdfUrl } from '@/lib/pdf/text-pdf'

export const runtime = 'nodejs'

// GET /texts/[slug]/download/pdf
//
// Redirects to the text's stored PDF. It never renders one: the file is built
// when the text is published or edited (lib/pdf/text-pdf-schedule.ts), or by
// `npm run build:text-pdfs`. Until 18 Nov 2026 this route rendered the PDF with
// @react-pdf on every CDN miss (~0.7s of CPU each, mostly for crawlers); from
// 18 to 20 Nov the address redirected to the text page's Print / Save as PDF.
//
// No database read: the stored file's URL is fixed by the slug, so the redirect
// is pure string work, and the CDN holds it for a week. An unpublished text's
// file is removed, so its redirect lands on the store's 404.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = textPdfUrl(slug)

  if (!url) {
    // The Blob store is not connected to this deployment (BLOB_READ_WRITE_TOKEN).
    return new Response(`The PDF of this text is not available yet (${textPdfPathname(slug)}).`, {
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
