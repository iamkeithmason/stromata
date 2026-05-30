import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { TRADITIONS } from '@/lib/constants'

type TraditionRow = {
  id: number
  slug: string
  name: string
  description: string | null
}

type AuthorRow = {
  id: string
  name: string
  tradition_id: number | null
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

export default async function AdminTraditionsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [{ data: traditions }, { data: authors }] = await Promise.all([
    supabase.from('traditions').select('id, slug, name, description'),
    supabase.from('authors').select('id, name, tradition_id').order('name'),
  ])

  // Sort traditions by the canonical order in constants
  const ordered = TRADITIONS
    .map(t => (traditions as unknown as TraditionRow[])?.find(r => r.slug === t.slug))
    .filter(Boolean) as TraditionRow[]

  const allAuthors = (authors ?? []) as AuthorRow[]
  const authorsByTradition: Record<number, AuthorRow[]> = {}
  for (const a of allAuthors) {
    if (a.tradition_id !== null) {
      if (!authorsByTradition[a.tradition_id]) authorsByTradition[a.tradition_id] = []
      authorsByTradition[a.tradition_id].push(a)
    }
  }

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        {params.success === 'tradition' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Tradition saved successfully.
          </p>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Traditions <span className="text-stone-400 font-normal text-sm">({ordered.length})</span>
            </h2>
          </div>

          {ordered.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {ordered.map(tradition => {
                const assigned = authorsByTradition[tradition.id] ?? []
                return (
                  <div key={tradition.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-stone-800 text-sm font-medium">{tradition.name}</span>
                        {tradition.description && (
                          <span className="text-stone-400 text-xs ml-3">
                            {tradition.description.length > 80
                              ? tradition.description.slice(0, 80) + '…'
                              : tradition.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <Dot filled={!!tradition.description} emptyLabel="No description" />
                        <Link
                          href={`/admin/traditions/${tradition.slug}/edit`}
                          className="text-xs text-stone-500 hover:text-stone-900"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/traditions/${tradition.slug}`}
                          target="_blank"
                          className="text-xs text-stone-400 hover:text-stone-700"
                        >
                          View →
                        </Link>
                      </div>
                    </div>

                    {assigned.length > 0 && (
                      <div className="mt-1.5 pl-4 flex flex-wrap gap-x-3 gap-y-0.5">
                        {assigned.map(a => (
                          <span key={a.id} className="text-xs text-stone-500">{a.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No traditions found.</p>
          )}
        </section>
      </div>
    </main>
  )
}
