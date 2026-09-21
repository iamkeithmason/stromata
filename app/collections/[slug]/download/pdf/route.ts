import { createServerClient } from '@/lib/supabase/server'
import { fetchCollectionAuthors, formatAuthorNames } from '@/lib/collections/author'
import { markdownFilename, type DownloadableText, type DownloadableCollection } from '@/lib/downloads'
import { CollectionDocument } from '@/lib/pdf/TextDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /collections/[slug]/download/pdf
// Renders a whole collection as one PDF: a cover/contents page, then every
// published text in reading order on its own page-break-delimited section.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: collection } = await supabase
    .from('collections')
    .select('id, title, slug, description, author:authors(name)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!collection) {
    return new Response('Not found', { status: 404 })
  }

  const { data: texts } = await supabase
    .from('texts')
    .select(`
      title, slug, body, summary, editorial_introduction, accession_number,
      source_attribution, provenance_notes, translation_notes,
      genre:genres(name),
      author:authors(name, tradition:traditions(name), era:eras(label))
    `)
    .eq('collection_id', (collection as { id: string }).id)
    .eq('published', true)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')

  // The byline is derived from the collection's texts rather than read off the
  // collection row (see lib/collections/author.ts), so a bundle is attributed
  // correctly even where `collections.author_id` was never filled in.
  const authorNames = formatAuthorNames(
    await fetchCollectionAuthors(supabase, (collection as { id: string }).id, collection.author)
  )
  const downloadable: DownloadableCollection = {
    ...(collection as unknown as DownloadableCollection),
    author: authorNames ? { name: authorNames } : null,
  }

  // @react-pdf/renderer is ESM-only; a static top-level import compiles to a
  // `require()` in Next's CommonJS route bundle, which throws ERR_REQUIRE_ESM
  // on Node runtimes without CJS-requiring-ESM support. Dynamic import avoids
  // that on any Node version.
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const buffer = await renderToBuffer(
    await CollectionDocument({
      collection: downloadable,
      texts: (texts ?? []) as unknown as DownloadableText[],
    })
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${markdownFilename(slug).replace(/\.md$/, '.pdf')}"`,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
