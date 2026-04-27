import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type Props = { searchParams: Promise<{ q?: string }> }

// author, genre, tradition are many-to-one → plain objects
type TextResult = {
  id: string
  title: string
  slug: string
  author: { name: string; slug: string | null } | null
  genre: { name: string } | null
}

type AuthorResult = {
  id: string
  name: string
  slug: string | null
  tradition: { name: string } | null
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

  if (query) {
    const pattern = `%${query}%`

    const [{ data: textData }, { data: authorData }] = await Promise.all([
      supabase
        .from('texts')
        .select('id, title, slug, author:authors(name, slug), genre:genres(name)')
        .eq('published', true)
        .ilike('title', pattern)
        .order('title')
        .limit(20),
      supabase
        .from('authors')
        .select('id, name, slug, tradition:traditions(name)')
        .ilike('name', pattern)
        .not('slug', 'is', null)
        .order('name')
        .limit(10),
    ])

    texts = (textData ?? []) as unknown as TextResult[]
    authors = (authorData ?? []) as unknown as AuthorResult[]
  }

  const total = texts.length + authors.length

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b bg-white px-8 py-5 flex justify-between items-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <div className="flex gap-4 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/" className="hover:opacity-70 transition-opacity">The Stromata</Link>
          <span>/</span>
          <span>Search</span>
        </div>
        <div className="hidden sm:flex gap-6 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/authors" className="hover:text-stone-900 transition-colors">Authors</Link>
          <Link href="/texts" className="hover:text-stone-900 transition-colors">Library</Link>
          <Link href="/about" className="hover:text-stone-900 transition-colors">About</Link>
        </div>
      </header>

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
              {texts.map(t => (
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
            Enter a title, author name, or theme above to search the library.
          </p>
        )}
      </main>
    </div>
  )
}
