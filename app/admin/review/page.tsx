import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { STANDALONE_SLUG, progressOf, type ReviewState } from '@/lib/review/queue'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Review queue' }

type DraftRow = {
  id: string
  review_state: ReviewState | null
  collection: { id: string; slug: string; title: string; provenance_verified_at: string | null } | null
  author: { name: string } | null
}

export default async function ReviewQueuePage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select(
      'id, review_state, author:authors(name), collection:collections(id, slug, title, provenance_verified_at)'
    )
    .eq('published', false)

  const rows = (data ?? []) as unknown as DraftRow[]

  // Group by collection, with everything collection-less in one bucket.
  const groups = new Map<
    string,
    { slug: string; title: string; author: string | null; verified: boolean; states: (ReviewState | null)[] }
  >()

  for (const row of rows) {
    const key = row.collection?.slug ?? STANDALONE_SLUG
    if (!groups.has(key)) {
      groups.set(key, {
        slug: key,
        title: row.collection?.title ?? 'Standalone texts',
        author: row.collection ? (row.author?.name ?? null) : null,
        verified: !!row.collection?.provenance_verified_at,
        states: [],
      })
    }
    groups.get(key)!.states.push(row.review_state)
  }

  // Largest first, with the standalone bucket pinned last however big it is —
  // it is a miscellany, not a work, and it is not where a session should start.
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.slug === STANDALONE_SLUG) return 1
    if (b.slug === STANDALONE_SLUG) return -1
    return b.states.length - a.states.length
  })

  const overall = progressOf(rows.map(r => r.review_state))
  const collectionCount = ordered.filter(g => g.slug !== STANDALONE_SLUG).length

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <h1 className="text-lg font-semibold text-stone-800">Review queue</h1>
      <p className="text-sm text-stone-500 mt-1">
        {overall.total} draft{overall.total === 1 ? '' : 's'} · {overall.approved} approved
        {overall.held > 0 && <> · {overall.held} held</>} · {collectionCount} collection
        {collectionCount === 1 ? '' : 's'}
      </p>

      {overall.total === 0 ? (
        <p className="text-sm text-stone-400 mt-8">Nothing to review — everything is published.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {ordered.map(group => {
            const progress = progressOf(group.states)
            const pct = progress.total > 0 ? Math.round((progress.approved / progress.total) * 100) : 0
            return (
              <li key={group.slug}>
                <Link
                  href={`/admin/review/${group.slug}`}
                  className="block border border-stone-200 rounded p-4 active:bg-stone-100 hover:border-stone-400 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-stone-800 font-medium leading-snug">{group.title}</span>
                    <span className="text-xs text-stone-400 shrink-0 tabular-nums">
                      {progress.approved}/{progress.total}
                    </span>
                  </div>

                  <p className="text-xs text-stone-400 mt-1">
                    {group.author ?? 'Various authors'}
                    {group.slug !== STANDALONE_SLUG && !group.verified && (
                      <span className="text-amber-600"> · provenance not verified</span>
                    )}
                    {progress.held > 0 && <span> · {progress.held} held</span>}
                  </p>

                  {/* Progress bar — approved over total. */}
                  <div className="mt-3 h-1.5 rounded bg-stone-200 overflow-hidden">
                    <div
                      className="h-full bg-green-600 transition-all"
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={progress.approved}
                      aria-valuemin={0}
                      aria-valuemax={progress.total}
                      aria-label={`${progress.approved} of ${progress.total} approved`}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
