import Link from 'next/link'
import type { ReadNextPick } from '@/lib/read-next'

/**
 * End-of-text "Continue exploring": up to three next reads, each captioned with
 * the rule that chose it. Stacked on phones; from tablet width (md) the picks sit
 * side by side in one row, one column per pick (Keith, 26 Oct 2026). Still plain
 * type, not cards: three titles are too few to read as a recommendation feed.
 * Clicks fire `text-open` from `read-next` so second-text conversion can be
 * attributed to it.
 */
// Literal class names so Tailwind generates them; one column per pick so one or
// two picks don't leave an empty third column.
const ROW_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
}

export function ContinueExploring({ picks }: { picks: ReadNextPick[] }) {
  if (picks.length === 0) return null
  const columns = ROW_COLUMNS[Math.min(picks.length, 3)]
  return (
    <nav aria-label="Continue exploring" className="mb-12 pt-6 border-t" style={{ borderColor: 'var(--rule)' }}>
      <p className="kicker" style={{ marginBottom: '1rem' }}>Continue exploring</p>
      <ul className={`flex flex-col gap-5 md:grid md:gap-8 md:items-start ${columns}`}>
        {picks.map(p => (
          <li key={p.slug}>
            <Link
              href={`/texts/${p.slug}`}
              className="group flex flex-col"
              data-umami-event="text-open"
              data-umami-event-from="read-next"
              data-umami-event-text={p.slug}
            >
              <span className="smallcaps mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                {p.reason}
              </span>
              <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                {p.title}
              </span>
              {p.authorName && p.kind !== 'author' && (
                <span className="text-xs mt-0.5 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                  {p.authorName}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
