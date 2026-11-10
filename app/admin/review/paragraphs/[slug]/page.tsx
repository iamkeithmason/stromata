import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { countWords, draftState, paragraphStats, resolvePicks, sentencesOf } from '@/scripts/lib/paragraphs.mjs'
import ParagraphsEditor, { type Wall } from './ParagraphsEditor'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

type ParagraphsDoc = {
  source: 'editorial'
  breaks: { after: string }[]
  held?: boolean
  applied_at?: string
  note?: string
}

export default async function ParagraphsReviewPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, published, body, paragraphs_draft, updated_at, author:authors(name)')
    .eq('slug', slug)
    .maybeSingle()
  const text = data as unknown as {
    id: string
    title: string
    slug: string
    published: boolean
    body: string | null
    paragraphs_draft: ParagraphsDoc | null
    updated_at: string | null
    author: { name: string } | null
  } | null
  if (!text?.paragraphs_draft) notFound()

  const body = text.body ?? ''
  const state = draftState(text.paragraphs_draft)
  const { blocks, walls } = paragraphStats(body)
  const { picks, missing, alreadyBroken } = resolvePicks(body, text.paragraphs_draft)

  // Only the long paragraphs travel to the browser, as sentences: that is all
  // a break can be placed between.
  const wallData: Wall[] = walls.map((index: number) => {
    const sentences = sentencesOf(blocks[index].text) as string[]
    return {
      index,
      sentences,
      words: sentences.map(s => countWords(s) as number),
      breaks: picks.filter((p: { paragraph: number }) => p.paragraph === index).map((p: { sentence: number }) => p.sentence),
    }
  })

  // The next text still waiting, so a session can run straight down the queue.
  const { data: queue } = await supabase
    .from('texts')
    .select('slug, paragraphs_draft')
    .not('paragraphs_draft', 'is', null)
    .order('title')
  const nextSlug =
    ((queue ?? []) as { slug: string; paragraphs_draft: ParagraphsDoc }[]).find(
      r => r.slug !== slug && draftState(r.paragraphs_draft) === 'pending'
    )?.slug ?? null

  return (
    <main>
      <div className="mb-4">
        <Link href="/admin/review/paragraphs" className="text-xs text-stone-400 hover:text-stone-700">← Paragraph breaks</Link>
      </div>
      <ParagraphsEditor
        id={text.id}
        title={text.title}
        slug={text.slug}
        author={text.author?.name ?? null}
        published={text.published}
        walls={wallData}
        missing={missing.length}
        alreadyBroken={state === 'applied' ? 0 : alreadyBroken}
        note={text.paragraphs_draft.note ?? null}
        loadedAt={text.updated_at ?? ''}
        state={state as 'pending' | 'held' | 'applied'}
        nextSlug={nextSlug}
      />
    </main>
  )
}
