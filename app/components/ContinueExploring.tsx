import Link from 'next/link'
import type { ReadNextPick } from '@/lib/read-next'

/**
 * End-of-text "Continue exploring": up to three next reads, each captioned with
 * the rule that chose it. Deliberately plain — a short list, not a grid.
 * Clicks fire `text-open` from `read-next` so second-text conversion can be
 * attributed to it.
 */
export function ContinueExploring({ picks }: { picks: ReadNextPick[] }) {
  if (picks.length === 0) return null
  return (
    <nav aria-label="Continue exploring" className="mb-12 pt-6 border-t" style={{ borderColor: 'var(--rule)' }}>
      <p className="kicker" style={{ marginBottom: '1rem' }}>Continue exploring</p>
      <ul className="flex flex-col gap-5">
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
