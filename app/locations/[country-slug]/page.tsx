import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { readingTime } from '@/lib/reading-time'

type Props = { params: Promise<{ 'country-slug': string }> }

type AuthorRow = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  tradition: { name: string } | null
  era: { label: string } | null
}

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  author_id: string
  genre: { name: string } | null
}

export async function generateStaticParams() {
  const supabase = createServerClient()
  const { data } = await supabase.from('locations').select('slug')
  return (data ?? []).map(l => ({ 'country-slug': l.slug }))
}

export async function generateMetadata({ params }: Props) {
  const slug = (await params)['country-slug']
  const supabase = createServerClient()
  const { data } = await supabase.from('locations').select('name').eq('slug', slug).single()
  return { title: data ? `${data.name} — The Stromata` : 'Locations — The Stromata' }
}

export default async function CountryPage({ params }: Props) {
  const slug = (await params)['country-slug']
  const supabase = createServerClient()

  const { data: location } = await supabase
    .from('locations')
    .select('id, name, slug, alternative_names, description')
    .eq('slug', slug)
    .single()

  if (!location) notFound()

  const { data: authorsData } = await supabase
    .from('authors')
    .select('id, name, slug, birth_year, death_year, tradition:traditions(name), era:eras(label)')
    .eq('location_id', location.id)
    .not('slug', 'is', null)
    .order('name')

  const authors = (authorsData ?? []) as unknown as AuthorRow[]

  let texts: TextRow[] = []
  if (authors.length > 0) {
    const authorIds = authors.map(a => a.id)
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, body, author_id, genre:genres(name)')
      .in('author_id', authorIds)
      .eq('published', true)
      .order('title')
    texts = (data ?? []) as unknown as TextRow[]
  }

  const textsByAuthor: Record<string, TextRow[]> = {}
  for (const t of texts) {
    if (!textsByAuthor[t.author_id]) textsByAuthor[t.author_id] = []
    textsByAuthor[t.author_id].push(t)
  }

  const dateStr = (a: AuthorRow) =>
    a.birth_year && a.death_year
      ? `${a.birth_year}–${a.death_year}`
      : a.death_year ? `d. ${a.death_year}` : null

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={
        <Link href="/locations" className="hover:opacity-70 transition-opacity">Locations</Link>
      } />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>{location.name}</h1>
            <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
              {authors.length} {authors.length === 1 ? 'author' : 'authors'}
            </span>
          </div>
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>

        {location.alternative_names && (
          <p className="text-sm mb-6" style={{ color: '#6f6a60' }}>
            Also known as: {location.alternative_names}
          </p>
        )}

        {location.description && (
          <div className="mb-10">
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>{location.description}</p>
          </div>
        )}

        {authors.length > 0 ? (
          <div className="space-y-10">
            {authors.map(a => {
              const authorTexts = textsByAuthor[a.id] ?? []
              const dates = dateStr(a)
              return (
                <div key={a.id}>
                  <div className="mb-3">
                    <Link
                      href={`/authors/${a.slug}`}
                      className="font-serif text-lg hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                      data-umami-event="location-browse-click"
                      data-umami-event-from="location-page"
                    >
                      {a.name}
                    </Link>
                    {(dates || a.tradition || a.era) && (
                      <p className="text-sm mt-0.5" style={{ color: '#6f6a60' }}>
                        {[dates, a.tradition?.name, a.era?.label].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  {authorTexts.length > 0 && (
                    <ul className="divide-y border-l-2 pl-4" style={{ borderColor: '#e5e0d8' }}>
                      {authorTexts.map(t => (
                        <li key={t.id} className="py-2">
                          <Link href={`/texts/${t.slug}`} className="flex items-baseline justify-between group">
                            <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                              {t.title}
                            </span>
                            <span className="text-xs ml-4 shrink-0" style={{ color: '#9c9589' }}>
                              {readingTime(t.body)} min · {t.genre?.name}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  {authorTexts.length === 0 && (
                    <p className="text-sm ml-4" style={{ color: '#9c9589' }}>No texts published yet.</p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No authors from this location yet.</p>
        )}
      </main>
      <TrackPageEvent event="location-page-view" data={{ location: location.name }} />
    </div>
  )
}
