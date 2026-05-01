import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditLocationForm from './EditLocationForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditLocationPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: location } = await supabase
    .from('locations')
    .select('*')
    .eq('id', id)
    .single()

  if (!location) notFound()

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
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
      </div>
    </main>
  )
}
