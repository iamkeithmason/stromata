import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { TRADITIONS } from '@/lib/constants'
import { readingTime } from '@/lib/reading-time'
import { JsonLd } from '@/app/components/JsonLd'
import { SITE_URL } from '@/lib/metadata'

// Incremental Static Regeneration: these pages are prerendered via
// generateStaticParams, so without a revalidate window newly published texts
// wouldn't appear here until the next redeploy. Revalidate hourly for freshness.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  genre: { name: string } | null
  author: {
    name: string
    slug: string | null
    era: { label: string; slug: string } | null
  } | null
}

export async function generateStaticParams() {
  return TRADITIONS.map(t => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const tradition = TRADITIONS.find(t => t.slug === slug)
  if (!tradition) return { title: 'Tradition — The Stromata' }
  return {
    title: `${tradition.seoTitle} | The Stromata`,
    description: `Browse texts from the ${tradition.name} tradition in the Stromata library — freely accessible writings from Christian history.`,
    alternates: { canonical: `/traditions/${slug}` },
  }
}

export default async function TraditionPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: tradition } = await supabase
    .from('traditions')
    .select('id, slug, name, description')
    .eq('slug', slug)
    .single()

  if (!tradition) notFound()

  const { data: authors } = await supabase
    .from('authors')
    .select('id')
    .eq('tradition_id', tradition.id)

  const authorIds = (authors ?? []).map((a: { id: string }) => a.id)

  let texts: TextRow[] = []
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, body, genre:genres(name), author:authors(name, slug, era:eras(label, slug))')
      .in('author_id', authorIds)
      .eq('published', true)
      .order('title')
    texts = (data ?? []) as unknown as TextRow[]
  }

  const traditionMeta = TRADITIONS.find(t => t.slug === slug)

  // ── Structured data — CollectionPage + ItemList of the tradition's texts ────
  const canonicalUrl = `${SITE_URL}/traditions/${tradition.slug}`
  const collectionJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: tradition.name,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    ...(tradition.description ? { description: tradition.description as string } : {}),
    ...(texts.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: texts.length,
            itemListElement: texts.map((t, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/texts/${t.slug}`,
              name: t.title,
            })),
          },
        }
      : {}),
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <JsonLd data={collectionJsonLd} />
      <SiteHeader breadcrumb={null} />

      <main id="main-content" className="content-shell py-12">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest mb-3 font-serif" style={{ color: 'var(--ink-mute)' }}>
            Tradition
          </p>
          <h1 className="font-serif text-3xl mb-2" style={{ color: 'var(--ink)' }}>
            {tradition.name}
          </h1>
          {traditionMeta?.seoTitle && traditionMeta.seoTitle !== tradition.name && (
            <p className="text-sm font-serif italic" style={{ color: 'var(--ink-mute)' }}>
              {traditionMeta.seoTitle}
            </p>
          )}
        </div>

        {tradition.description && (
          <div className="mb-10">
            <p className="font-serif leading-relaxed" style={{ color: 'var(--ink)' }}>
              {tradition.description}
            </p>
          </div>
        )}

        {texts.length > 0 ? (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: 'var(--ink)' }}>
                  Texts in the library
                </h2>
                <span className="text-xs tracking-[0.18em] uppercase" style={{ color: 'var(--ink-mute)' }}>
                  {texts.length}
                </span>
              </div>
              <hr style={{ borderColor: 'var(--ink)', borderTopWidth: '1px' }} />
            </div>

            <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
              {texts.map(t => (
                <li key={t.id}>
                  <Link
                    href={`/texts/${t.slug}`}
                    className="flex items-start justify-between py-4 group"
                  >
                    <div>
                      <div>
                        <span
                          className="font-serif group-hover:opacity-70 transition-opacity"
                          style={{ color: 'var(--ink)' }}
                        >
                          {t.title}
                        </span>
                        {t.author && (
                          <span className="text-xs ml-3" style={{ color: 'var(--ink-mute)' }}>
                            {t.author.name}
                            {t.author.era && ` · ${t.author.era.label.replace(/\s*\(.*?\)/, '')}`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                        approx. {readingTime(t.body)} min read
                      </div>
                    </div>
                    <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: 'var(--ink-mute)' }}>
                      {t.genre?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>No texts published yet.</p>
        )}
      </main>

      <TrackPageEvent event="tradition-page-view" data={{ tradition: tradition.slug }} />
    </div>
  )
}
