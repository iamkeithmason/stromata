import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type AuthorRow = {
  id: string; name: string; slug: string
  birth_year: number | null; death_year: number | null
  tradition: { name: string }[]
  era: { label: string }[]
}

export const metadata = {
  title: 'Authors — The Stromata',
}

export default async function AuthorsPage() {
  const supabase = createServerClient()

  const { data: authors } = await supabase
    .from('authors')
    .select('id, name, slug, birth_year, death_year, tradition:traditions(name), era:eras(label)')
    .not('slug', 'is', null)
    .order('name')

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-8 py-5">
        <Link href="/" className="text-stone-400 text-sm hover:text-stone-600">The Stromata</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-serif text-stone-800 mb-2">Authors</h1>
        <p className="text-stone-500 text-sm mb-10">{authors?.length ?? 0} authors</p>

        {authors && authors.length > 0 ? (
          <ul className="divide-y divide-stone-100">
            {authors.map((a: AuthorRow) => (
              <li key={a.id}>
                <Link
                  href={`/authors/${a.slug}`}
                  className="flex items-baseline justify-between py-4 group"
                >
                  <div>
                    <span className="text-stone-800 font-serif group-hover:text-stone-600 transition-colors">
                      {a.name}
                    </span>
                    <span className="text-stone-400 text-sm ml-3">
                      {a.birth_year && a.death_year
                        ? `${a.birth_year}–${a.death_year}`
                        : a.death_year
                          ? `d. ${a.death_year}`
                          : ''}
                    </span>
                  </div>
                  <span className="text-stone-400 text-xs ml-4 shrink-0">{a.tradition?.[0]?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-400">No authors published yet.</p>
        )}
      </main>
    </div>
  )
}
