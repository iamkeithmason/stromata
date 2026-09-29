import { createPublicClient } from '@/lib/supabase/public'
import { fetchCollectionAuthors, formatAuthorNames } from '@/lib/collections/author'
import {
  buildCollectionMarkdown,
  markdownFilename,
  type DownloadableText,
  type DownloadableCollection,
} from '@/lib/downloads'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /collections/[slug]/download/markdown
// Bundles every published text in a collection into a single .md file, in the
// same reading order as the collection page (collection_order, then title).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createPublicClient()

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
  // correctly even where `collections.author_id` was never filled in. The anon
  // key scopes it to published texts, matching what the bundle contains.
  const authorNames = formatAuthorNames(
    await fetchCollectionAuthors(supabase, (collection as { id: string }).id, collection.author)
  )
  const downloadable: DownloadableCollection = {
    ...(collection as unknown as DownloadableCollection),
    author: authorNames ? { name: authorNames } : null,
  }

  const markdown = buildCollectionMarkdown(
    downloadable,
    (texts ?? []) as unknown as DownloadableText[]
  )

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${markdownFilename(slug)}"`,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
