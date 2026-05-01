import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type AuthorRow = {
  id: string; name: string; slug: string | null; bio: string | null
  tradition: { name: string }[]
  era: { label: string }[]
}

function Dot({ filled, emptyLabel }: { filled: boolean; emptyLabel: string }) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      <span className={filled ? 'text-green-500' : 'text-amber-400'} style={{ fontSize: '0.5rem', lineHeight: 1 }}>●</span>
      {!filled && (
        <span className="absolute bottom-full right-0 mb-1.5 px-2 py-1 text-xs bg-stone-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          {emptyLabel}
        </span>
      )}
    </span>
  )
}

type Props = { searchParams: Promise<{ success?: string }> }

export default async function AdminAuthorsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [
    { data: authors },
    { count: authorsWithLocation },
  ] = await Promise.all([
    supabase
      .from('authors')
      .select('id, name, slug, bio, tradition:traditions(name), era:eras(label)')
      .order('name'),
    supabase
      .from('authors')
      .select('id', { count: 'exact', head: true })
      .not('location_id', 'is', null),
  ])

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        {params.success === 'author' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Author saved successfully.
          </p>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-800">
                Authors <span className="text-stone-400 font-normal text-sm">({authors?.length ?? 0})</span>
              </h2>
              {authors && authors.length > 0 && authorsWithLocation !== null && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {authorsWithLocation} of {authors.length} have location data
                </p>
              )}
            </div>
            <Link href="/admin/authors/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add author
            </Link>
          </div>
          {authors && authors.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(authors as unknown as AuthorRow[]).map((a: AuthorRow) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{a.name}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {a.tradition?.[0]?.name}
                      {a.era?.[0]?.label ? ` · ${a.era[0].label}` : ''}
                      {!a.slug && <span className="ml-2 text-amber-500">⚠ no slug</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dot filled={!!a.bio} emptyLabel="No bio" />
                    <Link href={`/admin/authors/${a.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No authors yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}
