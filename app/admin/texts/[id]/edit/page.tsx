import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditTextForm from './EditTextForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditTextPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select('*, genre:genres(slug), text_themes(theme:themes(slug))')
    .eq('id', id)
    .single()

  if (!text) notFound()

  const themeSlugs = (text.text_themes ?? [])
    .map((tt: { theme: { slug: string } | null }) => tt.theme?.slug)
    .filter(Boolean) as string[]

  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Edit text</h1>
        <EditTextForm
          id={id}
          initialTitle={text.title}
          initialSlug={text.slug}
          initialAuthorId={text.author_id}
          initialGenreSlug={text.genre?.slug ?? ''}
          initialThemeSlugs={themeSlugs}
          initialSourceAttribution={text.source_attribution ?? ''}
          initialProvenanceNotes={text.provenance_notes ?? ''}
          initialTranslationNotes={text.translation_notes ?? ''}
          initialOcrQuality={text.ocr_quality ?? ''}
          initialBody={text.body}
          initialPublished={text.published}
        />
      </div>
    </main>
  )
}
