import { renderToBuffer } from '@react-pdf/renderer'
import { createServerClient } from '@/lib/supabase/server'
import { markdownFilename, type DownloadableText } from '@/lib/downloads'
import { TextDocument } from '@/lib/pdf/TextDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /texts/[slug]/download/pdf
// Renders a published text as a styled PDF (server-side, @react-pdf/renderer).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

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
    .single()

  if (!data) {
    return new Response('Not found', { status: 404 })
  }

  const buffer = await renderToBuffer(TextDocument({ text: data as unknown as DownloadableText }))

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${markdownFilename(slug).replace(/\.md$/, '.pdf')}"`,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
