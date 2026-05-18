import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { readingTime } from '@/lib/reading-time'
import MarkdownBody from '@/app/components/MarkdownBody'

type Props = { params: Promise<{ slug: string }> }

// genre is many-to-one from texts → object; text_themes is one-to-many → array of { theme: object }
type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('authors').select('name').eq('slug', slug).single()
  // Format: "Author Name | The Stromata"
  return { title: data ? `${data.name} | The Stromata` : 'Author — The Stromata' }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  // tradition and era are many-to-one from authors → objects
  const { data: author } = await supabase
    .from('authors')
    .select('*, tradition:traditions(name), era:eras(label, slug), loc:locations(name, slug)')
    .eq('slug', slug)
    .single()

  if (!author) notFound()

  const { data: texts } = await supabase
    .from('texts')
    .select('id, title, slug, body, genre:genres(name), text_themes(theme:themes(name))')
    .eq('author_id', author.id)
    .eq('published', true)
    .order('title')

  const rows = (texts ?? []) as unknown as TextRow[]

  // tradition/era come back as objects (many-to-one)
  const tradition = (author.tradition as { name: string } | null)?.name
  const eraObj = author.era as { label: string; slug: string } | null
  const eraLabel = eraObj?.label
  const eraSlug = eraObj?.slug
  const locationObj = author.loc as { name: string; slug: string } | null
  const locationCity = author.location as string | null

  const dateStr = author.birth_year && author.death_year
    ? `${author.birth_year}–${author.death_year}`
    : author.death_year
      ? `d. ${author.death_year}`
      : null

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={<Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Author header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl mb-2" style={{ color: '#1b1b1b' }}>{author.name}</h1>
          {(dateStr || tradition || eraLabel || locationObj) && (
            <p className="text-sm" style={{ color: '#6f6a60' }}>
              {[dateStr, tradition].filter(Boolean).join(' · ')}
              {eraLabel && eraSlug && (
                <>
                  {(dateStr || tradition) ? ' · ' : ''}
                  <Link href={`/eras/${eraSlug}`} className="hover:opacity-70 transition-opacity">
                    {eraLabel}
                  </Link>
                </>
              )}
              {eraLabel && !eraSlug && (
                <>{(dateStr || tradition) ? ' · ' : ''}{eraLabel}</>
              )}
              {locationObj && (
                <>
                  {(dateStr || tradition || eraLabel) ? ' · ' : ''}
                  <Link
                    href={`/locations/${locationObj.slug}`}
                    className="hover:opacity-70 transition-opacity"
                    data-umami-event="location-country-click"
                    data-umami-event-country={locationObj.name}
                    data-umami-event-from="author-page"
                  >
                    {locationObj.name}
                  </Link>
                </>
              )}
            </p>
          )}
          {locationCity && (
            <p className="text-sm mt-0.5" style={{ color: '#6f6a60' }}>{locationCity}</p>
          )}
        </div>

        {/* Bio */}
        {author.bio && (
          <div className="mb-10">
            <MarkdownBody content={author.bio} numbered={false} />
          </div>
        )}

        {/* Texts */}
        {rows.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>
                  Texts in the library
                </h2>
                <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
                  {rows.length}
                </span>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>

            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {rows.map(t => {
                const themes = t.text_themes.map(tt => tt.theme?.name).filter(Boolean)
                return (
                  <li key={t.id}>
                    <Link
                      href={`/texts/${t.slug}`}
                      className="flex items-start justify-between py-4 group"
                    >
                      <div>
                        <div>
                          <span
                            className="font-serif group-hover:opacity-70 transition-opacity"
                            style={{ color: '#1b1b1b' }}
                          >
                            {t.title}
                          </span>
                          {themes.length > 0 && (
                            <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                              {themes.join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                          approx. {readingTime(t.body)} min read
                        </div>
                      </div>
                      <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: '#6f6a60' }}>
                        {t.genre?.name}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {rows.length === 0 && (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No texts published yet.</p>
        )}
      </main>

      <TrackPageEvent event="author-page-view" data={{ author: slug, tradition: tradition ?? null }} />
    </div>
  )
}
