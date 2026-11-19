import Link from 'next/link'
import type { ReadNextPick } from '@/lib/read-next'
import { BookCover } from '@/app/components/BookCover'
import { readingMinutes } from '@/lib/reading-time'

/**
 * End-of-text "Read next": one confident next read, then up to two quieter
 * alternatives (Keith chose this layout, option B, on 27 Oct 2026). The lead
 * carries its book cover, its length and a sentence saying why: the editor's
 * own sentence when texts.read_next_note is set, otherwise the rule that chose
 * it. The finishing moment is where second-text conversion is won, so the lead
 * gets enough presence to be seen after a long read, but it stays one object,
 * not a recommendation grid.
 *
 * Every click fires `text-open` from `read-next`, as before, so the series
 * continues across the redesign, and carries `pick` (editorial / author /
 * theme / genre) so the editor's picks can be compared with the rules'.
 */
export function ContinueExploring({ picks }: { picks: ReadNextPick[] }) {
  if (picks.length === 0) return null
  const [lead, ...rest] = picks
  const minutes = readingMinutes(lead.wordCount)
  return (
    <nav aria-label="Read next" className="mb-12 pt-6 border-t print:hidden" style={{ borderColor: 'var(--rule)' }}>
      <p className="kicker-gold" style={{ marginBottom: '1rem' }}>Read next</p>
      <Link
        href={`/texts/${lead.slug}`}
        className="group flex gap-5 items-start"
        data-umami-event="text-open"
        data-umami-event-from="read-next"
        data-umami-event-text={lead.slug}
        data-umami-event-pick={lead.kind}
      >
        <div className="shrink-0 w-[92px] md:w-[110px] group-hover:opacity-90 transition-opacity">
          <BookCover
            title={lead.title}
            authorName={lead.authorName}
            deathYear={lead.deathYear}
            accessionNumber={lead.accessionNumber}
            traditionSlug={lead.traditionSlug}
            genre={lead.genreName}
            index={0}
          />
        </div>
        <div className="min-w-0">
          <span
            className="block font-serif italic group-hover:opacity-70 transition-opacity"
            style={{ fontSize: 'var(--text-xl)', lineHeight: 1.2, color: 'var(--ink)' }}
          >
            {lead.title}
          </span>
          <span className="block font-serif mt-1" style={{ color: 'var(--ink-mute)' }}>
            {[lead.authorName, minutes > 0 ? `${minutes} min read` : null].filter(Boolean).join(' · ')}
          </span>
          <span className="block font-serif mt-3" style={{ color: 'var(--ink-soft)', lineHeight: 1.55 }}>
            {lead.reason}
          </span>
        </div>
      </Link>

      {rest.length > 0 && (
        <div className="mt-7">
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Or</p>
          <ul className="flex flex-col gap-3">
            {rest.map(p => (
              <li key={p.slug}>
                <Link
                  href={`/texts/${p.slug}`}
                  className="group font-serif"
                  data-umami-event="text-open"
                  data-umami-event-from="read-next"
                  data-umami-event-text={p.slug}
                  data-umami-event-pick={p.kind}
                >
                  <span className="group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>{p.title}</span>
                  {p.authorName && (
                    <span style={{ color: 'var(--ink-mute)' }}> · {p.authorName}</span>
                  )}
                  <span className="block smallcaps" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)' }}>
                    {p.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}
