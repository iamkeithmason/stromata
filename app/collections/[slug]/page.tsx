import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { DownloadLinks } from '@/app/components/DownloadLinks'
import { JsonLd } from '@/app/components/JsonLd'
import { readingTime } from '@/lib/reading-time'
import { OG_IMAGE, SITE_URL } from '@/lib/metadata'

// Incremental Static Regeneration: cache the rendered page and revalidate
// hourly. Safe given the manual publish cadence — a newly published or edited
// collection appears within the window rather than requiring a redeploy.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('collections')
    .select('title, author:authors(name)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!data) return { title: 'Collection — The Stromata' }

  const author = (data.author as unknown as { name: string } | null)?.name
  // Format: "Collection Title — Author Name | The Stromata"
  // Omits author segment if the collection has no linked author.
  const title = author
    ? `${data.title} — ${author} | The Stromata`
    : `${data.title} | The Stromata`

  const description = author
    ? `${data.title} by ${author} — a collection of freely readable texts at The Stromata.`
    : `${data.title} — a collection of freely readable texts at The Stromata.`
  const canonical = `/collections/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: collection } = await supabase
    .from('collections')
    .select('*, author:authors(name, slug)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!collection) notFound()

  // Fetch published texts in this collection, ordered by collection_order then title
  const { data: texts } = await supabase
    .from('texts')
    .select('id, title, slug, body, collection_order, genre:genres(name)')
    .eq('collection_id', collection.id)
    .eq('published', true)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')

  const author = collection.author as { name: string; slug: string | null } | null

  // ── Structured data — built from real fields only (no null values) ──────────
  const canonicalUrl = `${SITE_URL}/collections/${slug}`
  const orderedTexts = (texts ?? []) as { id: string; title: string; slug: string }[]
  const collectionJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.title,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    ...(collection.description ? { description: collection.description as string } : {}),
    ...(orderedTexts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: orderedTexts.length,
            itemListElement: orderedTexts.map((t, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/texts/${t.slug}`,
              name: t.title,
            })),
          },
        }
      : {}),
  }

  // BreadcrumbList mirrors the SiteHeader breadcrumb chain: Home → author → collection.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'The Stromata', item: SITE_URL },
      ...(author?.slug
        ? [{ '@type': 'ListItem', position: 2, name: author.name, item: `${SITE_URL}/authors/${author.slug}` }]
        : []),
      { '@type': 'ListItem', position: author?.slug ? 3 : 2, name: collection.title, item: canonicalUrl },
    ],
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <JsonLd data={collectionJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <SiteHeader breadcrumb={author?.slug
        ? <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
        : undefined}
      />

      <main id="main-content" className="content-shell py-12">
        {/* Collection header */}
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#6f6a60' }}>
            Collection
          </p>
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>
            {collection.title}
          </h1>
          {author && (
            <p className="text-sm mb-4" style={{ color: '#6f6a60' }}>
              {author.slug ? (
                <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.name}
                </Link>
              ) : author.name}
            </p>
          )}
          {collection.description && (
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>
              {collection.description}
            </p>
          )}
          {texts && texts.length > 0 && (
            <div className="mt-6">
              {/* Free, ungated download of the whole collection as one markdown file. */}
              <DownloadLinks collectionSlug={slug} from="collection-page" />
            </div>
          )}
        </div>

        {/* Divider */}
        <hr className="mb-8" style={{ borderColor: '#e5e0d8' }} />

        {/* Text list */}
        {texts && texts.length > 0 ? (
          <ol className="space-y-1">
            {texts.map((text, i) => {
              const genre = text.genre as unknown as { name: string } | null
              // Sequential display position among visible (published) texts — not the raw
              // collection_order, which can start above 1 if earlier items are unpublished.
              const position = i + 1
              return (
                <li key={text.id}>
                  <Link
                    href={`/texts/${text.slug}`}
                    className="flex items-start gap-4 py-3 group"
                    style={{ borderBottom: '1px solid #e5e0d8' }}
                  >
                    <span
                      className="text-sm tabular-nums shrink-0 w-6 text-right mt-0.5"
                      style={{ color: '#c8c3bb' }}
                    >
                      {position}
                    </span>
                    <span className="flex-1">
                      <span className="block">
                        <span
                          className="font-serif group-hover:opacity-70 transition-opacity"
                          style={{ color: '#1b1b1b' }}
                        >
                          {text.title}
                        </span>
                        {genre?.name && (
                          <span className="ml-3 text-xs" style={{ color: '#6f6a60' }}>
                            {genre.name}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: '#9c9589' }}>
                        approx. {readingTime((text as unknown as { body: string }).body)} min read
                      </span>
                    </span>
                    <span className="text-xs shrink-0 mt-0.5" style={{ color: '#c8c3bb' }}>→</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm italic" style={{ color: '#6f6a60' }}>
            No published texts in this collection yet.
          </p>
        )}
      </main>

      <TrackPageEvent event="collection-view" data={{ collection: slug }} />
    </div>
  )
}
