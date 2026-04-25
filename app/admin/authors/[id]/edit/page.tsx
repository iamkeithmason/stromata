import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditAuthorForm from './EditAuthorForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditAuthorPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: author } = await supabase
    .from('authors')
    .select('*, tradition:traditions(slug), era:eras(slug)')
    .eq('id', id)
    .single()

  if (!author) notFound()

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit author</h1>
        <EditAuthorForm
          id={id}
          initialName={author.name}
          initialSlug={author.slug ?? ''}
          initialTraditionSlug={author.tradition?.slug ?? ''}
          initialEraSlug={author.era?.slug ?? ''}
          initialBirthYear={author.birth_year}
          initialDeathYear={author.death_year}
          initialBio={author.bio ?? ''}
          initialBioSource={author.bio_source ?? ''}
        />
      </div>
    </main>
  )
}
