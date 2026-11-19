import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { DownloadLinks } from '@/app/components/DownloadLinks'
import { JsonLd } from '@/app/components/JsonLd'
import { readingMinutes } from '@/lib/reading-time'
import { shortCollectionTitles } from '@/lib/collections/short-titles'
import { fetchCollectionAuthors, formatAuthorNames, isLinkable } from '@/lib/collections/author'
import { OG_IMAGE, SITE_URL } from '@/lib/metadata'

// Incremental Static Regeneration: cache the rendered page and revalidate
// weekly (hourly until 2026-09-29, daily until 2026-10-04 — Vercel Hobby CPU). Safe given the manual
// publish cadence, and publish-text.ts revalidates the path on publish — a newly published or edited
// collection appears within the window rather than requiring a redeploy.
export const revalidate = 604800

// Cache each page on its first visit. Without generateStaticParams, Next 15
// classes a [param] route as dynamic and renders it on EVERY request, and the
// `revalidate` above does nothing for the page: in the 12 hours to 4 Nov 2026
// /texts/[slug] rendered 1,100 times for ~4 min of CPU, most of the Hobby
// allowance. An empty list prebuilds nothing at deploy (builds stay cheap) but
// makes the route ISR: `next build` shows it as ● with a cache window, not ƒ.
// lib/cache/public-pages-are-cached.test.ts keeps it that way.
export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('collections')
    .select('id, title, author:authors(name, slug)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!data) return { title: 'Collection — The Stromata' }

  // Derived from the collection's texts — `author_id` is only an override.
  const author =
    formatAuthorNames(await fetchCollectionAuthors(supabase, data.id as string, data.author)) || null
  // Format: "Collection Title — Author Name | The Stromata"
  // Omits the author segment when there are no texts to derive one from.
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
  const supabase = createPublicClient()

  // `.maybeSingle()` + orThrow, not `.single()`: `.single()` reports zero
  // rows as an ERROR, so a guard around it would turn a genuinely missing
  // collection into a 500. maybeSingle gives null for absence and an error only
  // when the query really failed — so notFound() below means "no such
  // collection", never "Supabase was down". See lib/supabase/query.ts.
  const collection = orThrow(
    await supabase
      .from('collections')
      // Explicit columns, not '*': anon cannot read description_draft /
      // provenance_verified_at (026), and PostgREST rejects the whole request
      // when select=* includes an unreadable column. Mirrors the shape the
      // download routes already use.
      .select('id, title, slug, description, published, author:authors(name, slug)')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle(),
    'a collection page',
  )

  if (!collection) notFound()

  // Fetch published texts in this collection, ordered by collection_order then title
  const { data: texts } = await supabase
    .from('texts')
    .select('id, title, slug, word_count, collection_order, genre:genres(name)')
    .eq('collection_id', collection.id)
    .eq('published', true)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')

  // Who the collection is by is derived from its texts rather than stored a
  // second time on the collection row (see lib/collections/author.ts).
  //
  // The derivation applies no `published` filter of its own, so the caller's
  // privileges decide its reach. On this page that is the anon key, and 023's
  // RLS policy scopes it to published texts — right for a public byline. The
  // admin dashboard and publishCollection() hold service_role and so see every
  // text, published or not, which is what they need.
  const authors = await fetchCollectionAuthors(supabase, collection.id, collection.author)
  // A breadcrumb points somewhere, so it needs exactly one author *and* a page
  // to point at — a draft author's page 404s until it has a published text.
  const soleAuthor = authors.length === 1 && isLinkable(authors[0]) ? authors[0] : null

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
      ...(soleAuthor?.slug
        ? [{ '@type': 'ListItem', position: 2, name: soleAuthor.name, item: `${SITE_URL}/authors/${soleAuthor.slug}` }]
        : []),
      { '@type': 'ListItem', position: soleAuthor?.slug ? 3 : 2, name: collection.title, item: canonicalUrl },
    ],
  }

  // The heading already names the work, so each row shows only the part that differs
  // ("Book IV", not "The Refutation of All Heresies, Book IV"). Display only.
  const rowTitles = shortCollectionTitles((texts ?? []).map(t => t.title as string))

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <JsonLd data={collectionJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <SiteHeader breadcrumb={soleAuthor?.slug
        ? <Link data-umami-event="author-open" data-umami-event-from="collection-page" data-umami-event-author={soleAuthor.name} href={`/authors/${soleAuthor.slug}`} className="hover:opacity-70 transition-opacity">{soleAuthor.name}</Link>
        : undefined}
      />

      <main id="main-content" className="content-shell py-12">
        {/* Collection header */}
        <div className="mb-10">
          <p className="smallcaps mb-3" style={{ color: 'var(--ink-faint)' }}>
            Collection
          </p>
          <h1 className="font-serif text-3xl mb-3" style={{ color: 'var(--ink)' }}>
            {collection.title}
          </h1>
          {authors.length > 0 && (
            <p className="text-sm mb-4" style={{ color: 'var(--ink-faint)' }}>
              {authors.map((a, i) => (
                <span key={a.slug ?? a.name}>
                  {/* "A", "A and B", "A, B and C" — mirrors formatAuthorNames. */}
                  {i > 0 && (i === authors.length - 1 ? ' and ' : ', ')}
                  {isLinkable(a) ? (
                    <Link data-umami-event="author-open" data-umami-event-from="collection-page" data-umami-event-author={a.name} href={`/authors/${a.slug}`} className="hover:opacity-70 transition-opacity">
                      {a.name}
                    </Link>
                  ) : a.name}
                </span>
              ))}
            </p>
          )}
          {collection.description && (
            <p className="font-serif leading-relaxed" style={{ color: 'var(--ink)' }}>
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
        <hr className="mb-8" style={{ borderColor: 'var(--rule-soft)' }} />

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
                  <Link data-umami-event="text-open" data-umami-event-from="collection-page" data-umami-event-text={text.slug}
                    href={`/texts/${text.slug}`}
                    className="flex items-start gap-4 py-3 group"
                    style={{ borderBottom: '1px solid var(--rule-soft)' }}
                  >
                    <span
                      className="text-sm tabular-nums shrink-0 w-6 text-right mt-0.5"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      {position}
                    </span>
                    <span className="flex-1">
                      <span className="block">
                        <span
                          className="font-serif group-hover:opacity-70 transition-opacity"
                          style={{ color: 'var(--ink)' }}
                        >
                          {rowTitles[i]}
                        </span>
                        {genre?.name && (
                          <span className="ml-3 text-xs" style={{ color: 'var(--ink-faint)' }}>
                            {genre.name}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                        approx. {readingMinutes((text as unknown as { word_count: number | null }).word_count)} min read
                      </span>
                    </span>
                    <span className="text-xs shrink-0 mt-0.5" aria-hidden="true" style={{ color: 'var(--rule)' }}>→</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--ink-faint)' }}>
            No published texts in this collection yet.
          </p>
        )}
      </main>

      <TrackPageEvent event="collection-view" data={{ collection: slug }} />
    </div>
  )
}
