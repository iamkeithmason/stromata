'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getHistory,
  resumePoint,
  RESUME_HASH,
  PROGRESS_NOT_STARTED,
  PROGRESS_FINISHED,
  type ReadingHistoryEntry,
} from '@/lib/reading-history'
import { BookCover } from './BookCover'
import { SectionHeader } from './SectionHeader'

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
    <section className="content-shell pb-20">
      <SectionHeader title="Reading history" aside="Recently read" />
      {/* Two per row on phones, matching "Recently added" (Keith, 26 Oct). */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 sm:gap-6">
        {history.map((entry, i) => {
          const p = entry.progress ?? 0
          const finished = p >= PROGRESS_FINISHED
          const inProgress = p >= PROGRESS_NOT_STARTED && !finished
          const label = progressLabel(entry)
          // A card for a text the reader is partway through returns them to
          // their place; the text page reads the hash and scrolls there.
          const resumable = resumePoint(entry) != null
          const href = `/texts/${entry.slug}${resumable ? RESUME_HASH : ''}`
          // `state` is conditional, but `from` must always be sent — otherwise
          // only in-progress reads were attributable to this surface.
          const umamiProps = inProgress
            ? { 'data-umami-event-state': 'in-progress' }
            : {}

          return (
            <div key={entry.slug} className="w-full">
              <Link
                href={href}
                aria-label={resumable ? `Resume ${entry.title}` : undefined}
                className="group block"
                data-umami-event="text-open"
                data-umami-event-from="reading-history"
                data-umami-event-text={entry.slug}
                {...umamiProps}
              >
                <BookCover
                  title={entry.title}
                  authorName={entry.authorName}
                  deathYear={entry.deathYear}
                  accessionNumber={entry.accessionNumber}
                  traditionSlug={entry.traditionSlug}
                  genre={entry.genreName ?? null}
                  index={i}
                />
              </Link>
              <div className="px-0.5 mt-3">
                {inProgress && (
                  <div
                    aria-hidden
                    className="mb-2"
                    style={{ height: 2, background: 'var(--rule)' }}
                  >
                    <div style={{ height: '100%', width: `${Math.round(p * 100)}%`, background: 'var(--gold)' }} />
                  </div>
                )}
                {finished ? (
                  <p className="caption"><span style={{ color: 'var(--gold)' }}>✓</span> Finished</p>
                ) : label ? (
                  <p className="caption">{resumable ? `Resume · ${label}` : label}</p>
                ) : entry.readingMinutes ? (
                  <p className="caption">~ {entry.readingMinutes} min</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
