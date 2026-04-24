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
  author: { name: string; slug: string | null }[]
  genre: { name: string }[]
}

export const metadata = {
  title: 'The Stromata — A reading room for the works of the ages',
}

export default async function Home() {
  const supabase = createServerClient()

  const { data: recentTexts } = await supabase
    .from('texts')
    .select('id, title, slug, author:authors(name, slug), genre:genres(name)')
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

      {/* Theme clusters */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2
          className="text-xs font-semibold uppercase tracking-widest mb-8 text-center"
          style={{ color: '#6f6a60' }}
        >
          Browse by theme
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: '#1b1b1b' }}
              >
                {cluster.cluster}
              </p>
              <div className="flex flex-col gap-1.5">
                {cluster.themes.map(theme => (
                  <Link
                    key={theme.slug}
                    href={`/search?q=${encodeURIComponent(theme.name)}`}
                    className="text-xs px-2 py-1 rounded border transition-colors hover:bg-stone-200 hover:border-stone-300"
                    style={{ color: '#6f6a60', borderColor: '#e5e0d8' }}
                  >
                    {theme.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently added */}
      {texts.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-8"
            style={{ color: '#6f6a60' }}
          >
            Recently added
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {texts.map((text, i) => {
              const color = COVER_COLORS[i % COVER_COLORS.length]
              const author = text.author?.[0]
              const genre = text.genre?.[0]
              return (
                <Link key={text.id} href={`/texts/${text.slug}`} className="group">
                  {/* Book cover */}
                  <div
                    className="relative w-full mb-3 rounded overflow-hidden"
                    style={{ background: color, aspectRatio: '2/3' }}
                  >
                    {/* Linen texture */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: `repeating-linear-gradient(
                          0deg,
                          transparent,
                          transparent 3px,
                          rgba(0,0,0,0.04) 3px,
                          rgba(0,0,0,0.04) 4px
                        )`,
                      }}
                    />
                    {/* Top band */}
                    <div
                      className="absolute top-0 left-0 right-0 h-8"
                      style={{ background: 'rgba(0,0,0,0.22)' }}
                    />
                    {/* Bottom band */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-8"
                      style={{ background: 'rgba(0,0,0,0.22)' }}
                    />
                    {/* Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                      {author && (
                        <p
                          className="text-xs uppercase tracking-widest mb-3"
                          style={{ color: 'rgba(251,248,241,0.75)' }}
                        >
                          {author.name}
                        </p>
                      )}
                      <p
                        className="font-serif text-sm leading-snug group-hover:opacity-90 transition-opacity"
                        style={{ color: '#FBF8F1' }}
                      >
                        {text.title}
                      </p>
                      {genre && (
                        <p
                          className="text-xs mt-3 uppercase tracking-wider"
                          style={{ color: 'rgba(251,248,241,0.55)' }}
                        >
                          {genre.name}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
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
