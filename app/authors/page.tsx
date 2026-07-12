import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'

// tradition is many-to-one from authors → plain object not array
type AuthorRow = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  tradition: { name: string; slug: string } | null
}

export const metadata = {
  title: 'Authors — The Stromata',
}

export default async function AuthorsPage() {
  const supabase = createServerClient()

  const [{ data: authors }, { data: textAuthorRows }] = await Promise.all([
    supabase
      .from('authors')
      .select('id, name, slug, birth_year, death_year, tradition:traditions(name, slug)')
      .not('slug', 'is', null)
      .eq('draft', false)
      .order('name'),
    supabase.from('texts').select('author_id').eq('published', true),
  ])

  const rows = (authors ?? []) as unknown as AuthorRow[]

  const textCounts = (textAuthorRows ?? []).reduce((acc: Record<string, number>, t: { author_id: string | null }) => {
    if (t.author_id) acc[t.author_id] = (acc[t.author_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>Authors</h1>
            <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
              {rows.length} in the library
            </span>
          </div>
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>

        {rows.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
            {rows.map(a => (
              <li key={a.id}>
                {/* Stretched-link pattern: author row is the base, tradition link sits above */}
                <div className="relative flex items-start justify-between py-4 group">
                  <div>
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {a.name}
                    </span>
                    <span className="text-sm ml-3" style={{ color: '#6f6a60' }}>
                      {a.birth_year && a.death_year
                        ? `${a.birth_year}–${a.death_year}`
                        : a.death_year
                          ? `d. ${a.death_year}`
                          : ''}
                    </span>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    {a.tradition?.slug ? (
                      <Link
                        href={`/traditions/${a.tradition.slug}`}
                        className="text-xs relative hover:opacity-70 transition-opacity"
                        style={{ color: '#6f6a60', zIndex: 2 }}
                      >
                        {a.tradition.name}
                      </Link>
                    ) : (
                      <span className="text-xs" style={{ color: '#6f6a60' }}>
                        {a.tradition?.name}
                      </span>
                    )}
                    <div className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                      {textCounts[a.id] ?? 0} text{(textCounts[a.id] ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                  {/* Stretched link covers the row but sits below the tradition link */}
                  <Link href={`/authors/${a.slug}`} className="absolute inset-0" style={{ zIndex: 1 }} aria-label={a.name} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No authors published yet.</p>
        )}
      </main>
      <TrackPageEvent event="authors-page-view" />
    </div>
  )
}
