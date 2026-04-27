import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditCollectionForm from './EditCollectionForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditCollectionPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: col } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .single()

  if (!col) notFound()

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit collection</h1>
        <EditCollectionForm
          id={id}
          initialTitle={col.title}
          initialSlug={col.slug}
          initialAuthorId={col.author_id ?? ''}
          initialDescription={col.description ?? ''}
          initialPublished={col.published}
        />
      </div>
    </main>
  )
}
