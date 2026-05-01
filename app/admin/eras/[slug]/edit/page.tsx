import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditEraForm from './EditEraForm'
import AssignAuthorToEra from '../../AssignAuthorToEra'

type Props = { params: Promise<{ slug: string }> }

type AuthorRow = { id: string; name: string; era_id: number | null }

export default async function EditEraPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const [{ data: era }, { data: authors }] = await Promise.all([
    supabase.from('eras').select('id, slug, label, description').eq('slug', slug).single(),
    supabase.from('authors').select('id, name, era_id').order('name'),
  ])

  if (!era) notFound()

  const allAuthors = (authors ?? []) as AuthorRow[]
  const assignedAuthors = allAuthors.filter(a => a.era_id === era.id)
  const unassignedAuthors = allAuthors.filter(a => a.era_id === null)

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin/eras" className="text-sm text-stone-500 hover:text-stone-700">
            ← Eras
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit era</h1>
        <EditEraForm
          slug={era.slug}
          label={era.label}
          initialDescription={era.description ?? ''}
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
          <AssignAuthorToEra eraSlug={era.slug} unassignedAuthors={unassignedAuthors} />
        </div>
      </div>
    </main>
  )
}
