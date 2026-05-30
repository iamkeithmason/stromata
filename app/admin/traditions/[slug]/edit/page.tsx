import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditTraditionForm from './EditTraditionForm'

type Props = { params: Promise<{ slug: string }> }

export default async function EditTraditionPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: tradition } = await supabase
    .from('traditions')
    .select('id, slug, name, description')
    .eq('slug', slug)
    .single()

  if (!tradition) notFound()

  const { data: authors } = await supabase
    .from('authors')
    .select('id, name, slug')
    .eq('tradition_id', tradition.id)
    .order('name')

  return (
    <main>
      <div className="mb-8">
        <Link href="/admin/traditions" className="text-sm text-stone-500 hover:text-stone-700">
          ← Traditions
        </Link>
      </div>

      <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit tradition</h1>

      <EditTraditionForm
        slug={tradition.slug}
        name={tradition.name}
        initialDescription={tradition.description ?? ''}
      />

      {authors && authors.length > 0 && (
        <div className="mt-12 pt-8 border-t border-stone-200 max-w-2xl">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">
            Authors in this tradition{' '}
            <span className="font-normal text-stone-400">({authors.length})</span>
          </h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(authors as { id: string; name: string; slug: string | null }[]).map(a => (
              a.slug ? (
                <Link
                  key={a.id}
                  href={`/admin/authors/${a.id}/edit`}
                  className="text-sm text-stone-600 hover:text-stone-900"
                >
                  {a.name}
                </Link>
              ) : (
                <span key={a.id} className="text-sm text-stone-500">{a.name}</span>
              )
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
