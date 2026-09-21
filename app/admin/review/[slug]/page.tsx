import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import {
  REVIEW_PAGE_SIZE,
  clampPage,
  firstPendingIndex,
  pageForIndex,
  progressOf,
  spotCheck,
  summariseProvenance,
  taxonomyWarnings,
  STANDALONE_SLUG,
  type ReviewState,
} from '@/lib/review/queue'
import ReviewClient, { type ReviewCard, type CollectionHeader } from './ReviewClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

type Row = {
  id: string
  title: string
  slug: string
  body: string | null
  note_draft: string | null
  editorial_introduction: string | null
  summary: string | null
  summary_draft: string | null
  review_state: ReviewState | null
  review_note: string | null
  ocr_quality: string | null
  collection_order: number | null
  source_attribution: string | null
  provenance_notes: string | null
  translation_notes: string | null
  source_url: string | null
  author: {
    name: string
    draft: boolean
    death_year: number | null
    tradition: { slug: string; name: string } | null
  } | null
  collection: {
    id: string
    slug: string
    title: string
    published: boolean
    description: string | null
    description_draft: string | null
    provenance_verified_at: string | null
  } | null
  text_themes: { theme: { name: string } | null }[]
}

export default async function ReviewCollectionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select(
      'id, title, slug, body, note_draft, editorial_introduction, summary, summary_draft, ' +
      'review_state, review_note, ocr_quality, collection_order, ' +
      'source_attribution, provenance_notes, translation_notes, source_url, ' +
      'author:authors(name, draft, death_year, tradition:traditions(slug, name)), ' +
      'collection:collections(id, slug, title, published, description, description_draft, provenance_verified_at), ' +
      'text_themes(theme:themes(name))'
    )
    .eq('published', false)

  const all = (data ?? []) as unknown as Row[]

  const isStandalone = slug === STANDALONE_SLUG
  const rows = all
    .filter(r => (isStandalone ? !r.collection : r.collection?.slug === slug))
    .sort(byCollectionOrder)

  if (rows.length === 0) notFound()

  const collection = isStandalone ? null : rows[0].collection
  const provenance = summariseProvenance(rows)

  // Resume: the page holding the first undecided card. A hand-typed ?page=
  // overrides it, clamped to a page that exists.
  const states = rows.map(r => r.review_state)
  const resumeIndex = firstPendingIndex(states)
  const defaultPage = pageForIndex(resumeIndex)
  const page = pageParam ? clampPage(pageParam, rows.length) : defaultPage
  const pageCount = Math.max(1, Math.ceil(rows.length / REVIEW_PAGE_SIZE))
  const start = (page - 1) * REVIEW_PAGE_SIZE
  const pageRows = rows.slice(start, start + REVIEW_PAGE_SIZE)

  const cards: ReviewCard[] = pageRows.map((r, i) => {
    const themes = r.text_themes.map(tt => tt.theme?.name).filter(Boolean) as string[]
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      position: start + i + 1,
      total: rows.length,
      // The introduction the operator edits: their own edit if there is one,
      // else the generated draft. note_draft itself is never overwritten.
      introduction: r.editorial_introduction ?? r.note_draft ?? '',
      hadNoDraft: !r.note_draft && !r.editorial_introduction,
      summary: r.summary ?? r.summary_draft ?? '',
      reviewState: r.review_state ?? 'pending',
      reviewNote: r.review_note,
      ocrQuality: r.ocr_quality,
      wordCount: countWords(r.body),
      themes,
      spot: spotCheck(r.body),
      warnings: taxonomyWarnings({
        authorName: r.author?.name,
        traditionSlug: r.author?.tradition?.slug ?? null,
        traditionName: r.author?.tradition?.name ?? null,
        deathYear: r.author?.death_year ?? null,
        authorIsDraft: r.author?.draft,
        themeCount: themes.length,
      }),
    }
  })

  const header: CollectionHeader = {
    id: collection?.id ?? null,
    slug,
    title: collection?.title ?? 'Standalone texts',
    author: rows[0].author?.name ?? null,
    published: collection?.published ?? false,
    descriptionDraft: collection?.description_draft ?? null,
    descriptionApproved: !!collection?.description,
    description: collection?.description ?? null,
    provenanceVerifiedAt: collection?.provenance_verified_at ?? null,
    // A standalone group is not one work from one source, so there is no single
    // provenance to verify and no gate to open — each text carries its own.
    requiresProvenanceGate: !isStandalone,
    provenance,
  }

  const progress = progressOf(states)

  return (
    <main>
      <div className="mb-4">
        <Link href="/admin/review" className="text-xs text-stone-400 hover:text-stone-700">← Review queue</Link>
      </div>

      <ReviewClient
        header={header}
        cards={cards}
        progress={progress}
        page={page}
        pageCount={pageCount}
        resumeId={resumeIndex >= 0 ? rows[resumeIndex].id : null}
      />
    </main>
  )
}

/** Collection order, with anything unordered pushed to the end by title. */
function byCollectionOrder(a: Row, b: Row): number {
  const ao = a.collection_order
  const bo = b.collection_order
  if (ao != null && bo != null) return ao - bo
  if (ao != null) return -1
  if (bo != null) return 1
  return a.title.localeCompare(b.title)
}

function countWords(body: string | null): number {
  if (!body) return 0
  return body.trim().split(/\s+/).filter(Boolean).length
}
