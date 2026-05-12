import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type TextRow = {
  id: string; title: string; slug: string; published: boolean; editorial_introduction: string | null
  author: { name: string }[]
  genre: { name: string }[]
  collection: { title: string } | null
}
type CollectionRow = {
  id: string; title: string; slug: string; published: boolean; description: string | null
  author: { name: string } | null
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

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [
    { data: texts },
    { data: collections },
    { count: authorCount },
    { count: locationCount },
    { count: eraCount },
  ] = await Promise.all([
    supabase
      .from('texts')
      .select('id, title, slug, published, editorial_introduction, author:authors(name), genre:genres(name), collection:collections(title)')
      .order('created_at', { ascending: false }),
    supabase
      .from('collections')
      .select('id, title, slug, published, description, author:authors(name)')
      .order('title'),
    supabase.from('authors').select('id', { count: 'exact', head: true }),
    supabase.from('author_locations').select('id', { count: 'exact', head: true }),
    supabase.from('eras').select('id', { count: 'exact', head: true }),
  ])

  return (
    <main>
      <div className="space-y-12">

        {params.success === 'text' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Text saved successfully.
          </p>
        )}
        {params.success === 'collection' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Collection saved successfully.
          </p>
        )}

        {/* Nav cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Authors', href: '/admin/authors', count: authorCount ?? 0 },
            { label: 'Locations', href: '/admin/locations', count: locationCount ?? 0 },
            { label: 'Eras', href: '/admin/eras', count: eraCount ?? 0 },
          ].map(({ label, href, count }) => (
            <Link
              key={href}
              href={href}
              className="border border-stone-200 rounded px-4 py-3 hover:border-stone-400 transition-colors"
            >
              <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-lg font-semibold text-stone-800">{count}</div>
            </Link>
          ))}
        </div>

        {/* Collections */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Collections <span className="text-stone-400 font-normal text-sm">({collections?.length ?? 0})</span>
            </h2>
            <Link href="/admin/collections/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add collection
            </Link>
          </div>
          {collections && collections.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(collections as unknown as CollectionRow[]).map((c: CollectionRow) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{c.title}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {(c.author as { name: string } | null)?.name}
                    </span>
                    <span className={`ml-3 text-xs ${c.published ? 'text-green-600' : 'text-stone-400'}`}>
                      {c.published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dot filled={!!c.description} emptyLabel="No description" />
                    <Link href={`/admin/collections/${c.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No collections yet.</p>
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
              {(texts as unknown as TextRow[]).map((t: TextRow) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-stone-800 text-sm font-medium">{t.title}</span>
                    <span className="text-stone-400 text-xs ml-3">
                      {(t.author as unknown as { name: string }[])?.[0]?.name} · {(t.genre as unknown as { name: string }[])?.[0]?.name}
                      {(t.collection as { title: string } | null)?.title && (
                        <> · <span className="italic">{(t.collection as { title: string }).title}</span></>
                      )}
                    </span>
                    <span className={`ml-3 text-xs ${t.published ? 'text-green-600' : 'text-stone-400'}`}>
                      {t.published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dot filled={!!t.editorial_introduction} emptyLabel="No editorial introduction" />
                    <Link href={`/admin/texts/new?from=${t.id}`} className="text-xs text-stone-400 hover:text-stone-700">
                      Duplicate
                    </Link>
                    <Link href={`/admin/texts/${t.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                      Edit
                    </Link>
                  </div>
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
