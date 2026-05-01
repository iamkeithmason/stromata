import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type LocationRow = {
  id: number; slug: string; name: string; alternative_names: string | null; description: string | null
}
type AuthorRow = {
  id: string; name: string; location_id: number | null
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

export default async function AdminLocationsPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = createServerClient()

  const [{ data: locations }, { data: authors }] = await Promise.all([
    supabase.from('locations').select('id, slug, name, alternative_names, description').order('name'),
    supabase.from('authors').select('id, name, location_id').order('name'),
  ])

  const allAuthors = (authors ?? []) as AuthorRow[]

  const authorsByLocation: Record<number, AuthorRow[]> = {}
  for (const a of allAuthors) {
    if (a.location_id !== null) {
      if (!authorsByLocation[a.location_id]) authorsByLocation[a.location_id] = []
      authorsByLocation[a.location_id].push(a)
    }
  }

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="space-y-8">
        {params.success === 'location' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Location saved successfully.
          </p>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Locations <span className="text-stone-400 font-normal text-sm">({locations?.length ?? 0})</span>
            </h2>
            <Link href="/admin/locations/new" className="text-sm text-stone-600 hover:text-stone-900">
              + Add location
            </Link>
          </div>

          {locations && locations.length > 0 ? (
            <div className="border border-stone-200 rounded divide-y divide-stone-100">
              {(locations as unknown as LocationRow[]).map(loc => {
                const assigned = authorsByLocation[loc.id] ?? []
                return (
                  <div key={loc.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-stone-800 text-sm font-medium">{loc.name}</span>
                        {loc.alternative_names && (
                          <span className="text-stone-400 text-xs ml-3">
                            {loc.alternative_names.length > 60 ? loc.alternative_names.slice(0, 60) + '…' : loc.alternative_names}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Dot filled={!!loc.alternative_names} emptyLabel="No alternative names" />
                        <Link href={`/admin/locations/${loc.id}/edit`} className="text-xs text-stone-500 hover:text-stone-900">
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
            <p className="text-sm text-stone-400">No locations yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}
