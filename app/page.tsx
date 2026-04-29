import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { THEME_CLUSTERS } from '@/lib/constants'
import SearchBar from './SearchBar'
import { BookCover } from './components/BookCover'
import { SiteHeader } from './components/SiteHeader'
import { ReadingHistorySection } from './components/ReadingHistorySection'
import { readingTime } from '@/lib/reading-time'

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  accession_number: number | null
  author: {
    name: string
    slug: string | null
    death_year: number | null
    tradition: { slug: string } | null
  } | null
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
}

export const metadata = {
  title: 'The Stromata — A reading room for the works of the ages',
}

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        {aside && (
          <span className="text-xs tracking-[0.18em] uppercase" style={{ color: 'var(--ink-mute)' }}>
            {aside}
          </span>
        )}
      </div>
      <hr style={{ borderColor: 'var(--ink)', borderTopWidth: '1px' }} />
    </div>
  )
}


export default async function Home() {
  const supabase = createServerClient()

  const { data: publishedTextsForCounts } = await supabase
    .from('texts')
    .select('text_themes(theme:themes(slug))')
    .eq('published', true)

  const themeCountMap: Record<string, number> = {}
  for (const text of publishedTextsForCounts ?? []) {
    for (const tt of (text.text_themes as unknown as { theme: { slug: string } | null }[])) {
      const slug = tt.theme?.slug
      if (slug) themeCountMap[slug] = (themeCountMap[slug] ?? 0) + 1
    }
  }

  const { data: recentTexts } = await supabase
    .from('texts')
    .select(`
      id, title, slug, body, accession_number,
      author:authors(name, slug, death_year, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(8)

  const texts = (recentTexts ?? []) as unknown as TextRow[]

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">

      <SiteHeader />

      {/* Hero */}
      <section className="text-center px-6 pt-16 pb-20">
        <h1
          className="mb-5"
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: 64,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
            color: 'var(--ink)',
          }}
        >
          The Stromata
        </h1>
        <p className="font-serif italic text-2xl mb-10" style={{ color: 'var(--ink-soft)' }}>
          A reading room for the works of the ages.
        </p>
        <SearchBar />
        <p className="text-sm mt-4" style={{ color: 'var(--ink-mute)' }}>
          try: &lsquo;grace&rsquo;&thinsp;·&thinsp;Augustine&thinsp;·&thinsp;on suffering
        </p>
      </section>

      {/* Theme clusters */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <SectionHeader title="Themes" aside="Five rooms of the library" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              <p className="font-serif text-base mb-3" style={{ color: 'var(--ink)' }}>
                {cluster.cluster}
              </p>
              <div className="flex flex-col gap-1.5 items-start">
                {cluster.themes.map(theme => {
                  return (
                    <Link
                      key={theme.slug}
                      href={`/search?q=${encodeURIComponent(theme.name)}`}
                      className="inline-flex items-center text-xs px-2.5 py-1 transition-colors hover:opacity-70"
                      style={{
                        color: 'var(--ink-mute)',
                        borderColor: 'var(--rule)',
                        border: '1px solid var(--rule)',
                        background: 'transparent',
                        fontFamily: '"EB Garamond", Georgia, serif',
                        letterSpacing: '0.1rem',
                        textTransform: 'uppercase',
                      }}
                      data-umami-event="theme-click"
                      data-umami-event-theme={theme.name}
                      data-umami-event-source="homepage"
                    >
                      {theme.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ReadingHistorySection />

      {/* Recently added */}
      {texts.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <SectionHeader
            title="Recently added"
            aside={`${texts.length} new volume${texts.length === 1 ? '' : 's'}`}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {texts.map((text, i) => {
              const author = text.author
              const themes = text.text_themes
                .map(tt => tt.theme?.name)
                .filter(Boolean) as string[]

              return (
                <div key={text.id}>
                  <Link href={`/texts/${text.slug}`} className="group block">
                    <BookCover
                      title={text.title}
                      authorName={author?.name ?? null}
                      deathYear={author?.death_year ?? null}
                      accessionNumber={text.accession_number}
                      traditionSlug={author?.tradition?.slug ?? null}
                      index={i}
                      readingMinutes={readingTime(text.body)}
                    />
                  </Link>
                  <div className="px-0.5 mt-3">
                    <Link
                      href={`/texts/${text.slug}`}
                      className="font-serif italic text-sm leading-snug hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--ink)' }}
                    >
                      {text.title}
                    </Link>
                    {author && (
                      <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--ink-mute)' }}>
                        {author.name}
                      </p>
                    )}
                    {themes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {themes.map(t => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5"
                            style={{
                              color: 'var(--ink-mute)',
                              border: '1px solid var(--rule)',
                              fontFamily: 'var(--serif)',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={{ padding: '0 32px 64px' }}>
        {/* Ornament rule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            margin: '32px 0',
            color: 'var(--ink-mute)',
            fontFamily: 'var(--serif-display)',
            fontSize: 22,
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          <span>§</span>
          <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        {/* 3-column */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 48,
            fontFamily: 'var(--serif)',
            fontSize: 14,
            color: 'var(--ink-soft)',
            lineHeight: 1.85,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
                marginBottom: 6,
              }}
            >
              Stromata
            </div>
            <div><Link href="/about" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>About</Link></div>
            <div><Link href="/authors" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Authors</Link></div>
            <div>
              <a href="/rss" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>RSS feed</a>
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
                marginBottom: 6,
              }}
            >
              Read
            </div>
            <div><Link href="/texts" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Library</Link></div>
            <div><Link href="/search" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Search</Link></div>
          </div>
          <div
            style={{
              fontStyle: 'italic',
              color: 'var(--ink-mute)',
              maxWidth: '44ch',
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            Public-domain texts, edited for legibility. Stromata has no investors and no
            advertising. If the texts here have been useful to you,{' '}
            <a
              href="https://ko-fi.com/stromata"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink-soft)' }}
              data-umami-event="ko-fi-click"
              data-umami-event-source="homepage"
            >
              a small contribution helps keep the lights on →
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
