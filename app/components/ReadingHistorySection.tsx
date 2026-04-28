'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHistory, type ReadingHistoryEntry } from '@/lib/reading-history'
import { BookCover } from './BookCover'

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        {aside && (
          <span className="text-xs tracking-[0.18em] uppercase" style={{ color: 'var(--ink-mute)' }}>
            {aside}
          </span>
        )}
      </div>
      <hr style={{ borderColor: 'var(--ink)', borderTopWidth: '1px' }} />
    </div>
  )
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {history.map((entry, i) => (
          <div key={entry.slug}>
            <Link href={`/texts/${entry.slug}`} className="group block">
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
              <Link
                href={`/texts/${entry.slug}`}
                className="font-serif italic text-sm leading-snug hover:opacity-70 transition-opacity"
                style={{ color: 'var(--ink)' }}
              >
                {entry.title}
              </Link>
              {entry.authorName && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-mute)' }}>
                  {entry.authorName}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
