import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { THEME_CLUSTERS } from '@/lib/constants'
import SearchBar from './SearchBar'
import { Wordmark } from './components/Wordmark'

const TRADITION_COLORS: Record<string, string> = {
  'early-church':        '#7A6147',
  'patristic':           '#5A2A2A',
  'eastern-orthodox':    '#2C3A4A',
  'roman-catholic':      '#3D2E20',
  'anglican':            '#3D5167',
  'reformed':            '#2C3E2E',
  'lutheran':            '#3A3825',
  'radical-reformation': '#5A3A2A',
  'methodist':           '#2E3A4A',
  'ecumenical':          '#3D3D35',
  'byzantine':           '#2C2E4A',
  'oriental-orthodox':   '#3A2E20',
}
const FALLBACK_COLOR = '#3D5167'

type TextRow = {
  id: string
  title: string
  slug: string
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

function BookCover({
  title,
  authorName,
  deathYear,
  accessionNumber,
  traditionSlug,
  index,
}: {
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  index: number
}) {
  const ground = TRADITION_COLORS[traditionSlug ?? ''] ?? FALLBACK_COLOR
  const num = String(accessionNumber ?? index + 1).padStart(2, '0')
  const year = deathYear
    ? deathYear < 600
      ? `c. ${deathYear}`
      : `d. ${deathYear}`
    : null

  return (
    <div
      style={{
        background: ground,
        aspectRatio: '2/3',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* Top band: Stromata left + № right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '7px 10px',
          borderBottom: '1px solid rgba(245,240,230,.18)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: 8,
            letterSpacing: '0.24em',
            color: 'rgba(245,240,230,0.70)',
            textTransform: 'uppercase',
          }}
        >
          Stromata
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 8,
            color: 'rgba(245,240,230,0.60)',
            letterSpacing: '0.04em',
          }}
        >
          № {num}
        </span>
      </div>

      {/* Mid panel: vellum, italic title + rule + author */}
      <div
        style={{
          flex: 1,
          background: '#F5F0E6',
          margin: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: '12px 8px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 13,
            fontStyle: 'italic',
            fontWeight: 500,
            lineHeight: 1.15,
            color: 'var(--ink)',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </p>
        <div
          style={{
            width: 20,
            height: 1,
            background: 'var(--ink)',
            opacity: 0.35,
            margin: '8px auto',
            flexShrink: 0,
          }}
        />
        {authorName && (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 8,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
              margin: 0,
            }}
          >
            {authorName}
          </p>
        )}
        {year && (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 8,
              color: 'var(--ink-mute)',
              margin: '5px 0 0',
            }}
          >
            {year}
          </p>
        )}
      </div>

      {/* Bottom band: S mark */}
      <div
        style={{
          textAlign: 'center',
          padding: '5px 10px 6px',
          borderTop: '1px solid rgba(245,240,230,.18)',
          fontFamily: 'var(--serif-display)',
          fontSize: 15,
          color: 'rgba(245,240,230,0.70)',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        S
      </div>
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
      id, title, slug, accession_number,
      author:authors(name, slug, death_year, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(8)

  const texts = (recentTexts ?? []) as unknown as TextRow[]

  return (
    <div style={{ background: 'var(--paper)' }} className="min-h-screen">

      {/* Nav */}
      <header className="border-b" style={{ borderColor: 'var(--rule)', background: 'var(--paper)' }}>
        <nav className="flex justify-between items-center px-6 py-5 max-w-6xl mx-auto">
          <Wordmark size={18} />
          <div className="flex gap-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <Link href="/authors" className="hover:opacity-70 transition-opacity font-serif">Authors</Link>
            <Link href="/texts" className="hover:opacity-70 transition-opacity font-serif">Library</Link>
            <Link href="/about" className="hover:opacity-70 transition-opacity font-serif">About</Link>
          </div>
        </nav>
      </header>

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
                  const count = themeCountMap[theme.slug] ?? 0
                  return (
                    <Link
                      key={theme.slug}
                      href={`/search?q=${encodeURIComponent(theme.name)}`}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 transition-colors hover:opacity-70"
                      style={{
                        color: 'var(--ink)',
                        borderColor: 'var(--rule)',
                        border: '1px solid var(--rule)',
                        background: 'transparent',
                        fontFamily: 'var(--serif)',
                      }}
                    >
                      {theme.name}
                      <span style={{ color: 'var(--ink-mute)' }} className="font-mono text-[10px]">
                        {count}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

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
      <footer style={{ borderTop: '1px solid var(--rule)', padding: '0 32px 64px' }}>
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
            >
              a small contribution helps keep the lights on →
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
