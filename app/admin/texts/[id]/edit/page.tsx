import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import EditTextForm from './EditTextForm'
import ProvenancePanel from './ProvenancePanel'

type Props = { params: Promise<{ id: string }> }

export default async function EditTextPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select('*, note_draft, summary, genre:genres(slug), text_themes(theme:themes(slug)), collection:collections(id, slug)')
    .eq('id', id)
    .single()

  const { data: author } = text?.author_id
    ? await supabase.from('authors').select('name, death_year, draft').eq('id', text.author_id).single()
    : { data: null }

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
        <ProvenancePanel
          sourceUrl={text.source_url}
          sourceAttribution={text.source_attribution}
          provenanceNotes={text.provenance_notes}
          translationNotes={text.translation_notes}
          ocrQuality={text.ocr_quality}
          license={text.license}
          published={text.published}
          authorName={author?.name}
          authorDeathYear={author?.death_year}
          authorIsDraft={author?.draft}
        />
        <EditTextForm
          id={id}
          initialTitle={text.title}
          initialSlug={text.slug}
          initialAuthorId={text.author_id}
          initialGenreSlug={text.genre?.slug ?? ''}
          initialThemeSlugs={themeSlugs}
          initialCollectionId={text.collection_id ?? ''}
          initialCollectionOrder={text.collection_order ?? null}
          initialSourceUrl={text.source_url ?? ''}
          initialSourceAttribution={text.source_attribution ?? ''}
          initialProvenanceNotes={text.provenance_notes ?? ''}
          initialTranslationNotes={text.translation_notes ?? ''}
          initialOcrQuality={text.ocr_quality ?? ''}
          initialNoteDraft={text.note_draft ?? ''}
          initialSummary={text.summary ?? ''}
          initialEditorialIntroduction={text.editorial_introduction ?? ''}
          initialBody={text.body}
          initialPublished={text.published}
          initialFeatured={text.featured ?? false}
          initialFeaturedFrom={text.featured_from ?? ''}
          initialFeaturedNote={text.featured_note ?? ''}
        />
      </div>
    </main>
  )
}
