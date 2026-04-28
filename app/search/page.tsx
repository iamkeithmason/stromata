import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { BookCover } from '@/app/components/BookCover'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'

type Props = { searchParams: Promise<{ q?: string }> }

type TextResult = {
  id: string
  title: string
  slug: string
  body: string
  accession_number: number | null
  author: {
    name: string
    slug: string | null
    death_year: number | null
    tradition: { name: string; slug: string } | null
    era: { label: string } | null
  } | null
  genre: { name: string } | null
}

type AuthorResult = {
  id: string
  name: string
  slug: string | null
  tradition: { name: string } | null
}

type SuggestedText = {
  id: string
  title: string
  slug: string
  genre: { name: string } | null
  author: { name: string } | null
}

function bodySnippet(body: string, max = 150): string {
  const stripped = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > max ? stripped.slice(0, max).trimEnd() + '…' : stripped
}

export async function generateMetadata({ searchParams }: Props) {
  const { q } = await searchParams
  return { title: q ? `"${q}" — The Stromata` : 'Search — The Stromata' }
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  const supabase = createServerClient()

  let texts: TextResult[] = []
  let authors: AuthorResult[] = []
  let suggested: SuggestedText[] | null = null

  const textSelect = `id, title, slug, body, accession_number,
    author:authors(name, slug, death_year, tradition:traditions(name, slug), era:eras(label)),
    genre:genres(name)`

  if (query) {
    const pattern = `%${query}%`

    // Phase 1: gather matching IDs for extended dimensions (parallel)
    const [
      { data: genreMatches },
      { data: themeMatches },
      { data: traditionAuthorMatches },
      { data: eraAuthorMatches },
      { data: authorData },
    ] = await Promise.all([
      supabase.from('genres').select('id').ilike('name', pattern).limit(50),
      supabase.from('text_themes')
        .select('text_id, theme:themes!inner(name)')
        .ilike('themes.name', pattern)
        .limit(100),
      supabase.from('authors')
        .select('id, tradition:traditions!inner(name)')
        .ilike('traditions.name', pattern)
        .limit(100),
      supabase.from('authors')
        .select('id, era:eras!inner(label)')
        .ilike('eras.label', pattern)
        .limit(100),
      supabase.from('authors')
        .select('id, name, slug, tradition:traditions(name)')
        .ilike('name', pattern)
        .not('slug', 'is', null)
        .order('name')
        .limit(10),
    ])

    const genreIds = (genreMatches ?? []).map((g: { id: number }) => g.id)
    const themeTextIds = (themeMatches ?? []).map((tt: { text_id: string }) => tt.text_id)
    const extendedAuthorIds = [
      ...(traditionAuthorMatches ?? []).map((a: { id: string }) => a.id),
      ...(eraAuthorMatches ?? []).map((a: { id: string }) => a.id),
    ]
    const uniqueAuthorIds = [...new Set(extendedAuthorIds)]

    authors = (authorData ?? []) as unknown as AuthorResult[]

    // Phase 2: text queries (always by title; conditionally by extended dimensions)
    const textQueryPromises = [
      supabase.from('texts').select(textSelect).eq('published', true).ilike('title', pattern).order('title').limit(20),
      ...(genreIds.length > 0
        ? [supabase.from('texts').select(textSelect).eq('published', true).in('genre_id', genreIds).order('title').limit(20)]
        : []),
      ...(themeTextIds.length > 0
        ? [supabase.from('texts').select(textSelect).eq('published', true).in('id', themeTextIds).order('title').limit(20)]
        : []),
      ...(uniqueAuthorIds.length > 0
        ? [supabase.from('texts').select(textSelect).eq('published', true).in('author_id', uniqueAuthorIds).order('title').limit(20)]
        : []),
    ]

    const textResults = await Promise.all(textQueryPromises)

    // Phase 3: merge and deduplicate
    const seen = new Set<string>()
    const merged: TextResult[] = []
    for (const { data } of textResults) {
      for (const t of (data ?? []) as unknown as TextResult[]) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          merged.push(t)
        }
      }
    }
    merged.sort((a, b) => a.title.localeCompare(b.title))
    texts = merged.slice(0, 20)
  }

  const total = texts.length + authors.length

  // Suggested texts for zero-results state
  if (query && total === 0) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, genre:genres(name), author:authors(name)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(4)
    suggested = data as unknown as SuggestedText[]
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={<span>Search</span>} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Search form */}
        <form method="GET" action="/search" className="mb-10">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded border shadow-sm"
            style={{ background: 'white', borderColor: '#d6d0c8' }}
          >
            <svg
              style={{ color: '#6f6a60' }}
              className="shrink-0"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search authors, titles, ideas…"
              className="flex-1 bg-transparent outline-none font-serif text-base"
              style={{ color: '#1b1b1b' }}
              autoFocus
            />
          </div>
        </form>

        {query && (
          <p className="text-sm mb-8" style={{ color: '#6f6a60' }}>
            {total === 0
              ? `No results for "${query}"`
              : `${total} result${total === 1 ? '' : 's'} for "${query}"`}
          </p>
        )}

        {/* Authors */}
        {authors.length > 0 && (
          <section className="mb-10">
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Authors</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {authors.map(a => (
                <li key={a.id}>
                  <Link
                    href={`/authors/${a.slug}`}
                    className="flex items-baseline justify-between py-4 group"
                  >
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {a.name}
                    </span>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {a.tradition?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Texts */}
        {texts.length > 0 && (
          <section>
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Texts</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {texts.map((t, i) => {
                const author = t.author
                const tradition = author?.tradition?.name
                const era = author?.era?.label
                const metaParts = [tradition, era].filter(Boolean).join(' · ')
                const snippet = t.body ? bodySnippet(t.body) : ''
                return (
                  <li key={t.id}>
                    <Link
                      href={`/texts/${t.slug}`}
                      className="flex items-start py-4 gap-4 group"
                    >
                      <div style={{ width: 64, height: 96, flexShrink: 0, overflow: 'hidden', position: 'relative' }} className="group-hover:opacity-80 transition-opacity">
                        <div style={{ width: 256, transformOrigin: 'top left', transform: 'scale(0.25)', position: 'absolute', top: 0, left: 0 }}>
                          <BookCover
                            title={t.title}
                            authorName={author?.name ?? null}
                            deathYear={author?.death_year ?? null}
                            accessionNumber={t.accession_number}
                            traditionSlug={author?.tradition?.slug ?? null}
                            index={i}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline flex-wrap gap-x-3">
                          <span
                            className="font-serif group-hover:opacity-70 transition-opacity"
                            style={{ color: '#1b1b1b' }}
                          >
                            {t.title}
                          </span>
                          {author && (
                            <span className="text-xs" style={{ color: '#6f6a60' }}>
                              {author.name}
                            </span>
                          )}
                        </div>
                        {metaParts && (
                          <p className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                            {metaParts}
                          </p>
                        )}
                        {snippet && (
                          <p className="font-serif text-xs mt-1 leading-relaxed" style={{ color: '#9c9589' }}>
                            {snippet}
                          </p>
                        )}
                      </div>
                      <span className="text-xs mt-1 shrink-0" style={{ color: '#6f6a60' }}>
                        {t.genre?.name}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Zero-results suggestions */}
        {query && total === 0 && <TrackPageEvent event="search-no-results" data={{ query }} />}
        {query && total === 0 && suggested && suggested.length > 0 && (
          <section className="mt-10">
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>From the library</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {suggested.map(t => (
                <li key={t.id}>
                  <Link
                    href={`/texts/${t.slug}`}
                    className="flex items-baseline justify-between py-4 group"
                  >
                    <div>
                      <span
                        className="font-serif group-hover:opacity-70 transition-opacity"
                        style={{ color: '#1b1b1b' }}
                      >
                        {t.title}
                      </span>
                      {t.author && (
                        <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                          {t.author.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {t.genre?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!query && (
          <p className="text-sm" style={{ color: '#6f6a60' }}>
            Search by title, author, theme, or tradition.
          </p>
        )}
      </main>
    </div>
  )
}
