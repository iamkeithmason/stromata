'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { LANES, groupByLane, type LaneId, type LaneInput } from '@/lib/pipeline/lanes'

type Row = LaneInput & { id: string; title?: string; author?: string; collection_slug?: string; _liveHref?: string | null }

// Lanes with long, finished tails start closed so the page opens on the work.
const OPEN_BY_DEFAULT = new Set<LaneId>(['copyright', 'ocr', 'fetch', 'review', 'import'])

const OWNER_TONE: Record<string, string> = {
  Claude: 'bg-blue-50 text-blue-700 border-blue-200',
  Keith: 'bg-amber-50 text-amber-800 border-amber-200',
  'Keith + Claude': 'bg-violet-50 text-violet-700 border-violet-200',
}

// The whole chain, prospect to published, grouped by what each item is waiting
// for. Phone-first: one column, counts on top, every row says why it is where
// it is. Lane placement is lib/pipeline/lanes.ts.
export default function LaneView<T extends Row>({ prospects, onEdit }: { prospects: T[]; onEdit: (p: T) => void }) {
  const groups = useMemo(() => groupByLane(prospects), [prospects])

  return (
    <div className="space-y-4">
      <nav aria-label="Lanes" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LANES.map(l => (
          <a
            key={l.id}
            href={`#lane-${l.id}`}
            className="min-h-11 rounded border border-stone-200 px-3 py-2 hover:border-stone-400"
          >
            <span className="block text-lg font-semibold text-stone-800 leading-tight">{groups.get(l.id)!.length}</span>
            <span className="block text-xs text-stone-500 leading-snug">{l.label}</span>
          </a>
        ))}
      </nav>

      {LANES.map(l => {
        const rows = groups.get(l.id)!
        return (
          <details key={l.id} id={`lane-${l.id}`} open={OPEN_BY_DEFAULT.has(l.id) && rows.length > 0} className="border border-stone-200 rounded">
            <summary className="min-h-11 px-4 py-3 cursor-pointer flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-stone-800">{l.label}</span>
              <span className="text-xs text-stone-400">{rows.length}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${OWNER_TONE[l.owner] ?? 'bg-stone-50 text-stone-500 border-stone-200'}`}>{l.owner}</span>
              <span className="basis-full text-xs text-stone-500">Next: {l.next}</span>
            </summary>
            {l.id === 'drafts' && rows.length > 0 && (
              <p className="px-4 pb-2 text-xs">
                <Link href="/admin/review" className="underline text-stone-600 hover:text-stone-900">Open the review queue →</Link>
              </p>
            )}
            {rows.length === 0 ? (
              <p className="px-4 pb-3 text-xs text-stone-400">Nothing here.</p>
            ) : (
              <ul className="divide-y divide-stone-100 border-t border-stone-100">
                {rows.map(p => (
                  <li key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-stone-800 break-words">{p.title || p.id}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{p.author || 'Unknown author'}</p>
                      <p className="text-xs text-stone-600 mt-1 break-words">{p.reason}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1 text-xs">
                      {p._liveHref && (
                        <a href={p._liveHref} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center text-stone-500 hover:text-stone-900">View ↗</a>
                      )}
                      <button onClick={() => onEdit(prospects.find(x => x.id === p.id)!)} className="min-h-11 px-1 text-stone-500 hover:text-stone-900">Edit</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )
      })}
    </div>
  )
}
