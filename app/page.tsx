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
  text_themes: { theme: { name: string; slug: string } | null }[]
}

type FeastAuthor = {
  id: string
  name: string
  slug: string
  bio: string | null
  death_year: number | null
  feast_day_note: string | null
  tradition: { name: string; slug: string } | null
  era: { label: string } | null
}
type FeastText = {
  id: string
  title: string
  slug: string
  body: string
  accession_number: number | null
  genre: { name: string } | null
}

type EditorialText = {
  id: string
  title: string
  slug: string
  accession_number: number | null
  featured_note: string | null
  author: { name: string; slug: string | null; death_year: number | null; tradition: { slug: string } | null } | null
  genre: { name: string } | null
}

type FeaturedSlot =
  | { type: 'feast'; author: FeastAuthor; texts: FeastText[] }
  | { type: 'editorial'; text: EditorialText }

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

  // ── Featured slot ─────────────────────────────────────────────────────────
  // Today as DD/MM in UTC (British format, matching feast_day column).
  // Phase 1 limitation: off by one for readers many timezones from UTC.
  const now = new Date()
  const mmdd = `${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  let featured: FeaturedSlot | null = null

  // 1. Feast day: check if any author's feast_day matches today
  const { data: feastAuthorRaw } = await supabase
    .from('authors')
    .select('id, name, slug, bio, death_year, feast_day_note, tradition:traditions(name, slug), era:eras(label)')
    .eq('feast_day', mmdd)
    .not('slug', 'is', null)
    .limit(1)
    .maybeSingle()

  if (feastAuthorRaw) {
    const feastAuthor = feastAuthorRaw as unknown as FeastAuthor
    const { data: feastTexts } = await supabase
      .from('texts')
      .select('id, title, slug, body, accession_number, genre:genres(name)')
      .eq('author_id', feastAuthor.id)
      .eq('published', true)
      .order('title')
    if (feastTexts && feastTexts.length > 0) {
      featured = { type: 'feast', author: feastAuthor, texts: feastTexts as unknown as FeastText[] }
    }
  }

  // 2. Editorial pick fallback: most recently featured published text
  if (!featured) {
    const { data: editorialRaw } = await supabase
      .from('texts')
      .select(`id, title, slug, accession_number, featured_note,
        author:authors(name, slug, death_year, tradition:traditions(slug)),
        genre:genres(name)`)
      .eq('published', true)
      .eq('featured', true)
      .order('featured_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (editorialRaw) {
      featured = { type: 'editorial', text: editorialRaw as unknown as EditorialText }
    }
  }
  // ── End featured slot ──────────────────────────────────────────────────────

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
      text_themes(theme:themes(name, slug))
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
            fontSize: '4rem',
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

      {/* ── Featured slot ─────────────────────────────────────────────────── */}
      {featured && (
        <section className="max-w-5xl mx-auto px-6 pb-20">
          <SectionHeader
            title={featured.type === 'feast' ? 'Featured author' : 'Editorial pick'}
            aside={featured.type === 'feast' ? 'Feast day' : 'Editor\'s choice'}
          />
          <div className="pb-4">
            {featured.type === 'feast' ? (
              /* ── Feast day ── */
              <div>
                <p className="text-xs uppercase tracking-widest mb-4 font-serif" style={{ color: 'var(--ink-mute)' }}>
                  Today is the feast of
                </p>
                <Link
                  href={`/authors/${featured.author.slug}`}
                  className="hover:opacity-70 transition-opacity"
                  data-umami-event="featured-click"
                  data-umami-event-type="feast"
                >
                  <h2
                    className="mb-2"
                    style={{ fontFamily: 'var(--serif-display)', fontSize: '2rem', lineHeight: 1.2, color: 'var(--ink)' }}
                  >
                    {featured.author.name}
                  </h2>
                </Link>
                <p className="text-sm mb-4 font-serif" style={{ color: 'var(--ink-mute)' }}>
                  {[
                    featured.author.tradition?.name,
                    featured.author.era?.label?.replace(/\s*\(.*?\)/, ''),
                  ].filter(Boolean).join(' · ')}
                  {featured.author.feast_day_note && (
                    <span className="italic"> · {featured.author.feast_day_note}</span>
                  )}
                </p>
                {featured.author.bio && (
                  <p className="font-serif leading-relaxed mb-6 max-w-2xl" style={{ color: 'var(--ink-soft)', fontSize: '1rem' }}>
                    {featured.author.bio.length > 300
                      ? featured.author.bio.slice(0, 300).trimEnd() + '…'
                      : featured.author.bio}
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  {(featured.texts as FeastText[]).map((t, i) => (
                    <div key={t.id} className="w-2/3 mx-auto sm:w-full">
                      <Link href={`/texts/${t.slug}`} className="group block">
                        <BookCover
                          title={t.title}
                          authorName={featured.type === 'feast' ? featured.author.name : null}
                          deathYear={featured.type === 'feast' ? featured.author.death_year : null}
                          accessionNumber={t.accession_number}
                          traditionSlug={featured.type === 'feast' ? (featured.author.tradition?.slug ?? null) : null}
                          index={i}
                        />
                      </Link>
                      <div className="px-0.5 mt-3">
                        <p style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
                          ~ {readingTime(t.body)} min
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Editorial pick ── */
              <div className="sm:flex sm:gap-8 items-start">
                <div className="shrink-0 mb-4 sm:mb-0" style={{ width: 80 }}>
                  <Link
                    href={`/texts/${featured.text.slug}`}
                    data-umami-event="featured-click"
                    data-umami-event-type="editorial"
                  >
                    <div style={{ width: 256, transformOrigin: 'top left', transform: 'scale(0.3125)', position: 'absolute' }}>
                      <BookCover
                        title={featured.text.title}
                        authorName={(featured.text.author as unknown as { name: string } | null)?.name ?? null}
                        deathYear={(featured.text.author as unknown as { death_year: number | null } | null)?.death_year ?? null}
                        accessionNumber={featured.text.accession_number}
                        traditionSlug={(featured.text.author as unknown as { tradition: { slug: string } | null } | null)?.tradition?.slug ?? null}
                        index={0}
                      />
                    </div>
                    <div style={{ height: 80 }} />
                  </Link>
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-widest mb-3 font-serif" style={{ color: 'var(--ink-mute)' }}>
                    Editorial pick
                  </p>
                  <Link
                    href={`/texts/${featured.text.slug}`}
                    className="hover:opacity-70 transition-opacity"
                    data-umami-event="featured-click"
                    data-umami-event-type="editorial"
                  >
                    <h2
                      className="mb-2"
                      style={{ fontFamily: 'var(--serif-display)', fontSize: '1.75rem', lineHeight: 1.2, color: 'var(--ink)' }}
                    >
                      {featured.text.title}
                    </h2>
                  </Link>
                  {featured.text.author && (
                    <p className="text-sm mb-4 font-serif" style={{ color: 'var(--ink-mute)' }}>
                      {(featured.text.author as unknown as { slug: string | null; name: string }).slug ? (
                        <Link href={`/authors/${(featured.text.author as unknown as { slug: string }).slug}`} className="hover:opacity-70 transition-opacity">
                          {(featured.text.author as unknown as { name: string }).name}
                        </Link>
                      ) : (featured.text.author as unknown as { name: string }).name}
                    </p>
                  )}
                  {featured.text.featured_note && (
                    <p className="font-serif leading-relaxed mb-5 max-w-2xl" style={{ color: 'var(--ink-soft)', fontSize: '1rem' }}>
                      {featured.text.featured_note}
                    </p>
                  )}
                  <Link
                    href={`/texts/${featured.text.slug}`}
                    className="font-serif text-sm hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--ink)' }}
                    data-umami-event="featured-click"
                    data-umami-event-type="editorial"
                  >
                    Read this text →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

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
                      href={`/themes/${theme.slug}`}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {texts.map((text, i) => {
              const author = text.author
              const themes = text.text_themes
                .map(tt => tt.theme)
                .filter(Boolean) as { name: string; slug: string }[]

              return (
                <div key={text.id} className="w-2/3 mx-auto sm:w-full">
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
                    <p className="mb-2" style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
                      ~ {readingTime(text.body)} min
                    </p>
                    {themes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {themes.map(t => (
                          <Link
                            key={t.slug}
                            href={`/themes/${t.slug}`}
                            className="px-2 py-0.5 hover:opacity-70 transition-opacity"
                            style={{
                              color: 'var(--ink-mute)',
                              border: '1px solid var(--rule)',
                              fontFamily: 'var(--serif)',
                              fontSize: '0.625rem',
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {t.name}
                          </Link>
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
            fontSize: '1.375rem',
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
            fontSize: '0.875rem',
            color: 'var(--ink-soft)',
            lineHeight: 1.85,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.6875rem',
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
                fontSize: '0.6875rem',
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
              fontSize: '0.875rem',
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
