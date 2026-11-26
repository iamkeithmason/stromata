import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { candidatesFor, samePick } from '@/scripts/lib/begin-with.mjs'
import BeginWithCard, { type Candidate, type Pick } from './BeginWithCard'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Begin with · Review queue' }

type AuthorRow = {
  id: string
  name: string
  slug: string | null
  begin_with: Pick | null
  begin_with_draft: (Pick & { skipped?: boolean }) | null
}

/**
 * The Begin with queue: one card per author with a drafted pick, phone first.
 * Each card shows the drafted work and line, lets Keith choose another work or
 * rewrite the line, and Approve (goes live on the author page) or Skip (no pick
 * for this author). Metadata only: titles, lengths, summaries, never a body.
 */
export default async function BeginWithQueuePage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('authors')
    .select('id, name, slug, begin_with, begin_with_draft')
    .not('begin_with_draft', 'is', null)
    .order('name')
  const authors = (data ?? []) as AuthorRow[]

  const ids = authors.map(a => a.id)
  const { data: texts } = ids.length
    ? await supabase
        .from('texts')
        .select('author_id, slug, title, word_count, summary, collection_id, genre:genres(name)')
        .eq('published', true)
        .in('author_id', ids)
    : { data: [] }
  const textRows = ((texts ?? []) as unknown as { author_id: string; slug: string; title: string; word_count: number | null; summary: string | null; collection_id: string | null; genre: { name: string } | null }[])
    .map(t => ({ ...t, genre: t.genre?.name ?? null }))
  const collectionIds = [...new Set(textRows.map(t => t.collection_id).filter(Boolean))] as string[]
  const { data: collections } = collectionIds.length
    ? await supabase.from('collections').select('id, slug, title, description, published').in('id', collectionIds)
    : { data: [] }

  const candidatesOf = (authorId: string): Candidate[] =>
    candidatesFor(textRows.filter(t => t.author_id === authorId), collections ?? []) as Candidate[]

  const isSkipped = (a: AuthorRow) => a.begin_with_draft?.skipped === true
  const pending = authors.filter(a => !isSkipped(a) && !samePick(a.begin_with_draft, a.begin_with))
  const approved = authors.filter(a => !isSkipped(a) && samePick(a.begin_with_draft, a.begin_with))
  const skipped = authors.filter(isSkipped)

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin/review" className="text-xs text-stone-400 hover:text-stone-700">← Review queue</Link>
      </div>

      <h1 className="text-lg font-semibold text-stone-800">Begin with</h1>
      <p className="text-sm text-stone-500 mt-1">
        One work per author for a first-time reader, with a line on why. It shows as &ldquo;Begin with&rdquo;
        at the top of the author&apos;s works. Choose another work or rewrite the line, then Approve.
      </p>
      <p className="text-sm text-stone-500 mt-2">
        {pending.length} to review · {approved.length} approved · {skipped.length} skipped
      </p>

      {authors.length === 0 ? (
        <p className="text-sm text-stone-400 mt-8">
          No drafts yet. Run <code>npm run generate:review-drafts -- --begin-with</code>.
        </p>
      ) : (
        <>
          <Group label="To review" rows={pending} candidatesOf={candidatesOf} />
          <Group label="Approved" rows={approved} candidatesOf={candidatesOf} />
          <Group label="Skipped" rows={skipped} candidatesOf={candidatesOf} />
        </>
      )}
    </main>
  )
}

function Group({ label, rows, candidatesOf }: { label: string; rows: AuthorRow[]; candidatesOf: (id: string) => Candidate[] }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wide text-stone-400 mb-2">{label}</h2>
      <ul className="space-y-3">
        {rows.map(a => (
          <li key={a.id}>
            <BeginWithCard
              id={a.id}
              name={a.name}
              slug={a.slug}
              candidates={candidatesOf(a.id)}
              draft={a.begin_with_draft?.skipped ? null : a.begin_with_draft}
              live={a.begin_with}
              skipped={a.begin_with_draft?.skipped === true}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
