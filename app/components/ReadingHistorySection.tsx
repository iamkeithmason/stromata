'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHistory, type ReadingHistoryEntry } from '@/lib/reading-history'
import { PROGRESS_NOT_STARTED, PROGRESS_FINISHED } from './ReadingProgressBar'
import { BookCover } from './BookCover'

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        {aside && (
          <span style={{
            color: 'var(--ink-faint)',
            fontSize: '0.8rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily: 'var(--serif)',
          }}>
            {aside}
          </span>
        )}
      </div>
      <hr style={{ borderColor: 'var(--gold-rule)', borderTopWidth: '1px' }} />
    </div>
  )
}

function progressLabel(entry: ReadingHistoryEntry): string | null {
  const p = entry.progress ?? 0
  if (p >= PROGRESS_FINISHED) return 'Finished'
  if (p < PROGRESS_NOT_STARTED || !entry.readingMinutes) return null
  const minutesLeft = Math.max(1, Math.round(entry.readingMinutes * (1 - p)))
  return `~ ${minutesLeft} min left`
}

export function ReadingHistorySection() {
  const [history, setHistory] = useState<ReadingHistoryEntry[]>([])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  if (history.length === 0) return null

  return (
    <section className="max-w-5xl mx-auto px-6 pb-20">
      <SectionHeader title="Reading history" aside="Recently read" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {history.map((entry, i) => {
          const p = entry.progress ?? 0
          const finished = p >= PROGRESS_FINISHED
          const inProgress = p >= PROGRESS_NOT_STARTED && !finished
          const label = progressLabel(entry)
          const umamiProps = inProgress
            ? { 'data-umami-event-state': 'in-progress', 'data-umami-event-from': 'reading-history' }
            : {}

          return (
            <div key={entry.slug} className="w-2/3 mx-auto sm:w-full">
              <Link
                href={`/texts/${entry.slug}`}
                className="group block"
                data-umami-event="text-open"
                data-umami-event-text={entry.slug}
                {...umamiProps}
              >
                <BookCover
                  title={entry.title}
                  authorName={entry.authorName}
                  deathYear={entry.deathYear}
                  accessionNumber={entry.accessionNumber}
                  traditionSlug={entry.traditionSlug}
                  index={i}
                />
              </Link>
              <div className="px-0.5 mt-3">
                {finished ? (
                  <p style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
                    <span style={{ color: 'var(--gold)' }}>✓</span> Finished
                  </p>
                ) : label ? (
                  <p style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
                    {label}
                  </p>
                ) : entry.readingMinutes ? (
                  <p style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
                    ~ {entry.readingMinutes} min
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
