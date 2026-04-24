import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type Props = { searchParams: Promise<{ q?: string }> }

type TextResult = {
  id: string
  title: string
  slug: string
  author: { name: string; slug: string | null }[]
  genre: { name: string }[]
}

type AuthorResult = {
  id: string
  name: string
  slug: string | null
  tradition: { name: string }[]
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

    texts = (textData ?? []) as TextResult[]
    authors = (authorData ?? []) as AuthorResult[]
  }

  const total = texts.length + authors.length

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b px-8 py-5 flex gap-4 text-sm"
        style={{ borderColor: '#e5e0d8', color: '#6f6a60', background: 'white' }}
      >
        <Link href="/" className="hover:text-stone-700">The Stromata</Link>
        <span>/</span>
        <span>Search</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Search form */}
        <form method="GET" action="/search" className="mb-10">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm"
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
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: '#6f6a60' }}
            >
              Authors
            </h2>
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
                      {a.tradition?.[0]?.name}
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
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: '#6f6a60' }}
            >
              Texts
            </h2>
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
                      <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                        {t.author?.[0]?.name}
                      </span>
                    </div>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {t.genre?.[0]?.name}
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
