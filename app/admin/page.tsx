import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type AuthorRow = {
  id: string; name: string; slug: string | null
  tradition: { name: string }[]
  era: { label: string }[]
}
type TextRow = {
  id: string; title: string; slug: string; published: boolean
  author: { name: string }[]
  genre: { name: string }[]
}
type Props = { searchParams: Promise<{ success?: string }> }

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [{ data: authors }, { data: texts }] = await Promise.all([
    supabase
      .from('authors')
      .select('id, name, slug, tradition:traditions(name), era:eras(label)')
      .order('name'),
    supabase
      .from('texts')
      .select('id, title, slug, published, author:authors(name), genre:genres(name)')
      .order('title'),
  ])

  return (
    <main className="p-8">
      <div className="max-w-3xl space-y-12">

        {params.success === 'author' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Author saved successfully.
          </p>
        )}
        {params.success === 'text' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Text saved successfully.
          </p>
        )}

        {/* Authors */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Authors <span className="text-stone-400 font-normal text-sm">({authors?.length ?? 0})</span>
            </h2>
            <Link href="/admin/authors/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add author
            </Link>
          </div>
          {authors && authors.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {authors.map((a: AuthorRow) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{a.name}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {a.tradition?.[0]?.name}
                      {a.era?.[0]?.label ? ` · ${a.era[0].label}` : ''}
                      {!a.slug && <span className="ml-2 text-amber-500">⚠ no slug</span>}
                    </span>
                  </div>
                  <Link
                    href={`/admin/authors/${a.id}/edit`}
                    className="text-xs text-stone-500 hover:text-stone-900"
                  >
                    Edit
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No authors yet.</p>
          )}
        </section>

        {/* Texts */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Texts <span className="text-stone-400 font-normal text-sm">({texts?.length ?? 0})</span>
            </h2>
            <Link href="/admin/texts/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add text
            </Link>
          </div>
          {texts && texts.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {texts.map((t: TextRow) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{t.title}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {t.author?.[0]?.name} · {t.genre?.[0]?.name}
                    </span>
                    <span className={`ml-3 text-xs ${t.published ? 'text-green-600' : 'text-stone-400'}`}>
                      {t.published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  <Link
                    href={`/admin/texts/${t.id}/edit`}
                    className="text-xs text-stone-500 hover:text-stone-900"
                  >
                    Edit
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No texts yet.</p>
          )}
        </section>

      </div>
    </main>
  )
}
