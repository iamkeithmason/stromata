import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { draftState } from '@/scripts/lib/paragraphs.mjs'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Paragraph breaks · Review queue' }

type ParagraphsDoc = { source: 'editorial'; breaks: { after: string }[]; held?: boolean; applied_at?: string }

type Row = {
  id: string
  title: string
  slug: string
  published: boolean
  paragraphs_draft: ParagraphsDoc
  author: { name: string } | null
}

/**
 * The paragraph-breaks queue: texts with a prose paragraph of 800+ words that
 * have proposed breaks waiting for Keith. Metadata and the small anchor
 * documents only — each body is read on its own page, never all of them here
 * (CLAUDE.md, "Supabase limits").
 */
export default async function ParagraphsQueuePage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, published, paragraphs_draft, author:authors(name)')
    .not('paragraphs_draft', 'is', null)
    .order('title')

  const rows = (data ?? []) as unknown as Row[]
  const pending = rows.filter(r => draftState(r.paragraphs_draft) === 'pending')
  const held = rows.filter(r => draftState(r.paragraphs_draft) === 'held')
  const applied = rows.filter(r => draftState(r.paragraphs_draft) === 'applied')

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin/review" className="text-xs text-stone-400 hover:text-stone-700">← Review queue</Link>
      </div>

      <h1 className="text-lg font-semibold text-stone-800">Paragraph breaks</h1>
      <p className="text-sm text-stone-500 mt-1">
        Proposed breaks for texts whose source prints a chapter as one paragraph. Approving inserts the
        breaks, changes no word, and records them in the text&apos;s provenance note as the editor&apos;s.
      </p>
      <p className="text-sm text-stone-500 mt-2">
        {pending.length} to review · {held.length} held · {applied.length} applied
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-stone-400 mt-8">
          No proposals yet. Run <code>npm run generate:review-drafts -- --paragraphs</code>.
        </p>
      ) : (
        <>
          <List rows={pending} label="To review" />
          <List rows={held} label="Held" muted />
          <List rows={applied} label="Applied" muted />
        </>
      )}
    </main>
  )
}

function List({ rows, label, muted = false }: { rows: Row[]; label: string; muted?: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="text-xs uppercase tracking-wide text-stone-400 mb-2">{label}</h2>
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id}>
            <Link
              href={`/admin/review/paragraphs/${r.slug}`}
              className={`block border rounded p-4 active:bg-stone-100 hover:border-stone-400 transition-colors ${
                muted ? 'border-stone-200 text-stone-500' : 'border-stone-300 text-stone-800'
              }`}
            >
              <span className="font-medium leading-snug">{r.title}</span>
              <p className="text-xs text-stone-400 mt-1">
                {r.author?.name ?? 'Unknown'} · {r.paragraphs_draft.breaks.length} breaks
                {!r.published && ' · draft text'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
