import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type EraRow = {
  id: number; slug: string; label: string; description: string | null
}
type AuthorRow = {
  id: string; name: string; era_id: number | null
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

export default async function AdminErasPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [{ data: eras }, { data: authors }] = await Promise.all([
    supabase.from('eras').select('id, slug, label, description').order('year_start', { nullsFirst: true }),
    supabase.from('authors').select('id, name, era_id').order('name'),
  ])

  const allAuthors = (authors ?? []) as AuthorRow[]

  const authorsByEra: Record<number, AuthorRow[]> = {}
  for (const a of allAuthors) {
    if (a.era_id !== null) {
      if (!authorsByEra[a.era_id]) authorsByEra[a.era_id] = []
      authorsByEra[a.era_id].push(a)
    }
  }

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        {params.success === 'era' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Era saved successfully.
          </p>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Eras <span className="text-stone-400 font-normal text-sm">({eras?.length ?? 0})</span>
            </h2>
          </div>

          {eras && eras.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(eras as unknown as EraRow[]).map(era => {
                const assigned = authorsByEra[era.id] ?? []
                return (
                  <div key={era.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-stone-800 text-sm font-medium">{era.label}</span>
                        {era.description && (
                          <span className="text-stone-400 text-xs ml-3">
                            {era.description.length > 80 ? era.description.slice(0, 80) + '…' : era.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Dot filled={!!era.description} emptyLabel="No description" />
                        <Link href={`/admin/eras/${era.slug}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
                          Edit
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
            <p className="text-sm text-stone-400">No eras found.</p>
          )}
        </section>
      </div>
    </main>
  )
}
