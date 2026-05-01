import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditLocationForm from './EditLocationForm'
import AssignAuthorToLocation from '../../AssignAuthorToLocation'

type Props = { params: Promise<{ id: string }> }

type AuthorRow = { id: string; name: string; location_id: number | null }

export default async function EditLocationPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const [{ data: location }, { data: authors }] = await Promise.all([
    supabase.from('locations').select('*').eq('id', id).single(),
    supabase.from('authors').select('id, name, location_id').order('name'),
  ])

  if (!location) notFound()

  const allAuthors = (authors ?? []) as AuthorRow[]
  const assignedAuthors = allAuthors.filter(a => a.location_id === location.id)
  const unassignedAuthors = allAuthors.filter(a => a.location_id === null)

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin/locations" className="text-sm text-stone-500 hover:text-stone-700">
            ← Locations
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit location</h1>
        <EditLocationForm
          id={location.id}
          initialName={location.name}
          initialSlug={location.slug}
          initialAlternativeNames={location.alternative_names ?? ''}
          initialDescription={location.description ?? ''}
          initialLat={location.lat ?? null}
          initialLng={location.lng ?? null}
        />

        <div className="mt-12 pt-8 border-t border-stone-200 max-w-2xl">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">
            Authors
            {assignedAuthors.length > 0 && (
              <span className="ml-2 font-normal text-stone-400">({assignedAuthors.length})</span>
            )}
          </h2>
          {assignedAuthors.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
              {assignedAuthors.map(a => (
                <Link key={a.id} href={`/admin/authors/${a.id}/edit`} className="text-sm text-stone-600 hover:text-stone-900">
                  {a.name}
                </Link>
              ))}
            </div>
          )}
          <AssignAuthorToLocation locationId={location.id} unassignedAuthors={unassignedAuthors} />
        </div>
      </div>
    </main>
  )
}
