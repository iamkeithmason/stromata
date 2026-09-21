import { createPublicClient } from '@/lib/supabase/public'
import { buildTextMarkdown, markdownFilename, type DownloadableText } from '@/lib/downloads'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /texts/[slug]/download/markdown
// Serves a published text as a .md file attachment (frontmatter + colophon +
// body). Ungated, mirroring the reading page's own publication check.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createPublicClient()

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

  const markdown = buildTextMarkdown(data as unknown as DownloadableText)

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${markdownFilename(slug)}"`,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
