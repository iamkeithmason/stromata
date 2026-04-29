import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditEraForm from './EditEraForm'

type Props = { params: Promise<{ slug: string }> }

export default async function EditEraPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: era } = await supabase
    .from('eras')
    .select('slug, label, description')
    .eq('slug', slug)
    .single()

  if (!era) notFound()

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit era</h1>
        <EditEraForm
          slug={era.slug}
          label={era.label}
          initialDescription={era.description ?? ''}
        />
      </div>
    </main>
  )
}
