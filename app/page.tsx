import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { THEME_CLUSTERS } from '@/lib/constants'
import SearchBar from './SearchBar'

// Penguin-classics palette — rotated across book covers
const COVER_COLORS = [
  '#8C3A2E', // deep red
  '#2F4A3A', // forest green
  '#3B4A6B', // slate blue
  '#6B4226', // warm brown
  '#4A3B6B', // deep purple
  '#2E5C6B', // teal
  '#6B3A4A', // burgundy
  '#3A5C3B', // dark green
]

type TextRow = {
  id: string
  title: string
  slug: string
  author: { name: string; slug: string | null; death_year: number | null }[]
  genre: { name: string }[]
  text_themes: { theme: { name: string }[] }[]
}

export const metadata = {
  title: 'The Stromata — A reading room for the works of the ages',
}

// Reusable section heading — solid rule, italic serif left, small-caps right
function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>
          {title}
        </h2>
        {aside && (
          <span
            className="text-xs tracking-[0.18em] uppercase"
            style={{ color: '#6f6a60' }}
          >
            {aside}
          </span>
        )}
      </div>
      <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
    </div>
  )
}

export default async function Home() {
  const supabase = createServerClient()

  // Count published texts per theme so we can show e.g. "Prayer 3"
  const { data: publishedTextsForCounts } = await supabase
    .from('texts')
    .select('text_themes(theme:themes(slug))')
    .eq('published', true)

  const themeCountMap: Record<string, number> = {}
  for (const text of publishedTextsForCounts ?? []) {
    for (const tt of (text.text_themes as { theme: { slug: string }[] }[])) {
      const slug = tt.theme?.[0]?.slug
      if (slug) themeCountMap[slug] = (themeCountMap[slug] ?? 0) + 1
    }
  }

  // Recently added texts with author date + themes for the book cards
  const { data: recentTexts } = await supabase
    .from('texts')
    .select(`
      id, title, slug,
      author:authors(name, slug, death_year),
      genre:genres(name),
      text_themes(theme:themes(name))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(8)

  const texts = (recentTexts ?? []) as TextRow[]

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">

      {/* Nav */}
      <nav className="flex justify-between items-center px-8 py-5 max-w-6xl mx-auto">
        <span className="font-serif text-sm" style={{ color: '#6f6a60' }}>
          The Stromata
        </span>
        <div className="flex gap-6 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/authors" className="hover:text-stone-900 transition-colors">Authors</Link>
          <Link href="/texts" className="hover:text-stone-900 transition-colors">Library</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 pt-16 pb-20">
        <h1 className="font-serif text-5xl mb-5" style={{ color: '#1b1b1b' }}>
          The Stromata
        </h1>
        <p className="font-serif italic text-2xl mb-10" style={{ color: '#6f6a60' }}>
          A reading room for the works of the ages.
        </p>

        <SearchBar />

        <p className="text-sm mt-4" style={{ color: '#6f6a60' }}>
          try: &lsquo;grace&rsquo;&thinsp;·&thinsp;Augustine&thinsp;·&thinsp;on suffering
        </p>
      </section>

      {/* ── Theme clusters ── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <SectionHeader title="Themes" aside="Five rooms of the library" />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              {/* Cluster name */}
              <p className="font-serif text-base mb-1" style={{ color: '#1b1b1b' }}>
                {cluster.cluster}
              </p>
              {/* Decorative curved rule */}
              <svg width="36" height="6" viewBox="0 0 36 6" className="mb-3" fill="none">
                <path d="M2 4 Q18 0 34 4" stroke="#1b1b1b" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {/* Tags — auto-width, stacked */}
              <div className="flex flex-col gap-1.5 items-start">
                {cluster.themes.map(theme => {
                  const count = themeCountMap[theme.slug] ?? 0
                  return (
                    <Link
                      key={theme.slug}
                      href={`/search?q=${encodeURIComponent(theme.name)}`}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm border transition-colors hover:bg-stone-100"
                      style={{ color: '#1b1b1b', borderColor: '#c8c3bb', background: 'transparent' }}
                    >
                      {theme.name}
                      {count > 0 && (
                        <span style={{ color: '#6f6a60' }} className="font-mono text-[10px]">
                          {count}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recently added ── */}
      {texts.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <SectionHeader
            title="Recently added"
            aside={`${texts.length} new volume${texts.length === 1 ? '' : 's'}`}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {texts.map((text, i) => {
              const color = COVER_COLORS[i % COVER_COLORS.length]
              const author = text.author?.[0]
              const genre = text.genre?.[0]
              const themes = text.text_themes
                .map(tt => tt.theme?.[0]?.name)
                .filter(Boolean) as string[]

              // Format author date for bottom-left of cover
              const authorDate = author?.death_year
                ? (author.death_year < 600 ? `c. ${author.death_year}` : `d. ${author.death_year}`)
                : null

              return (
                <div key={text.id}>
                  <Link href={`/texts/${text.slug}`} className="group block">
                    {/* ── Book cover ── */}
                    <div
                      className="relative w-full rounded overflow-hidden mb-3"
                      style={{ background: color, aspectRatio: '2/3' }}
                    >
                      {/* Diagonal linen texture */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundImage: `repeating-linear-gradient(
                            135deg,
                            transparent,
                            transparent 3px,
                            rgba(0,0,0,0.07) 3px,
                            rgba(0,0,0,0.07) 4px
                          )`,
                        }}
                      />

                      {/* Top bar: STROMATA · catalogue number */}
                      <div
                        className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2.5"
                        style={{ borderBottom: '1px solid rgba(251,248,241,0.35)' }}
                      >
                        <span
                          className="text-[10px] uppercase tracking-[0.18em]"
                          style={{ color: 'rgba(251,248,241,0.75)' }}
                        >
                          Stromata
                        </span>
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: 'rgba(251,248,241,0.75)' }}
                        >
                          № {String(i + 1).padStart(2, '0')}
                        </span>
                      </div>

                      {/* Centre: title + author — padded so it never hides behind the bars */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 pt-10 pb-10 text-center">
                        <p
                          className="font-serif text-base leading-snug mb-3 group-hover:opacity-90 transition-opacity"
                          style={{ color: '#FBF8F1' }}
                        >
                          {text.title}
                        </p>
                        {author && (
                          <p
                            className="font-serif italic text-xs leading-snug"
                            style={{ color: 'rgba(251,248,241,0.85)' }}
                          >
                            {author.name}
                          </p>
                        )}
                      </div>

                      {/* Bottom bar: date · genre */}
                      <div
                        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2.5"
                        style={{ borderTop: '1px solid rgba(251,248,241,0.35)' }}
                      >
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: 'rgba(251,248,241,0.75)' }}
                        >
                          {authorDate ?? ''}
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: 'rgba(251,248,241,0.75)' }}
                        >
                          {genre?.name ?? ''}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Below-card metadata */}
                  <div className="px-0.5">
                    <Link
                      href={`/texts/${text.slug}`}
                      className="font-serif italic text-sm leading-snug hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {text.title}
                    </Link>
                    {author && (
                      <p className="text-xs mt-0.5 mb-2" style={{ color: '#6f6a60' }}>
                        {author.name}
                      </p>
                    )}
                    {themes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {themes.slice(0, 2).map(t => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 rounded-sm border"
                            style={{ color: '#6f6a60', borderColor: '#c8c3bb' }}
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
      <footer
        className="border-t px-8 py-8 text-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <p className="text-xs" style={{ color: '#6f6a60' }}>
          The Stromata — freely accessible texts from the Christian tradition
        </p>
      </footer>

    </div>
  )
}
