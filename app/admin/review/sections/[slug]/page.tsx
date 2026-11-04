import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { blockKey, bodyBlocks, resolvePicks, sameSections } from '@/scripts/lib/sections.mjs'
import SectionsEditor from './SectionsEditor'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

type SectionsDoc = { source: 'editorial'; sections: { label: string; starts_with: string }[] }

/** Words of each paragraph's opening shown to the reviewer: enough to recognise the turn. */
const OPENING_WORDS = 40

export default async function SectionsReviewPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, published, body, sections_draft, sections, author:authors(name)')
    .eq('slug', slug)
    .maybeSingle()
  const text = data as unknown as {
    id: string
    title: string
    slug: string
    published: boolean
    body: string | null
    sections_draft: SectionsDoc | null
    sections: SectionsDoc | null
    author: { name: string } | null
  } | null
  if (!text?.sections_draft) notFound()

  const blocks = bodyBlocks(text.body ?? '')
  const { picks, missing } = resolvePicks(blocks, text.sections_draft)
  const openings = blocks.map(b => {
    const words = blockKey(b).split(' ')
    return words.length > OPENING_WORDS ? `${words.slice(0, OPENING_WORDS).join(' ')} …` : words.join(' ')
  })

  // The next text still waiting, so a session can run straight down the queue.
  const { data: queue } = await supabase
    .from('texts')
    .select('slug, sections_draft, sections')
    .not('sections_draft', 'is', null)
    .order('title')
  const waiting = ((queue ?? []) as { slug: string; sections_draft: SectionsDoc; sections: SectionsDoc | null }[])
    .filter(r => r.slug !== slug && !sameSections(r.sections_draft, r.sections))
  const nextSlug = waiting[0]?.slug ?? null

  return (
    <main>
      <div className="mb-4">
        <Link href="/admin/review/sections" className="text-xs text-stone-400 hover:text-stone-700">← Sections</Link>
      </div>
      <SectionsEditor
        id={text.id}
        title={text.title}
        slug={text.slug}
        author={text.author?.name ?? null}
        published={text.published}
        openings={openings}
        initialPicks={picks}
        missing={missing}
        approved={sameSections(text.sections_draft, text.sections)}
        nextSlug={nextSlug}
      />
    </main>
  )
}
