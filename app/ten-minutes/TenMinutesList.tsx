'use client'

import { useState } from 'react'
import Link from 'next/link'
import { readingMinutes } from '@/lib/reading-time'
import { MAX_RESULTS, selectForTheme, type ThemeChoice } from '@/lib/ten-minutes'

export type ListText = {
  id: string
  title: string
  slug: string
  word_count: number | null
  summary: string | null
  editorial_introduction: string | null
  text_themes: { theme: { name: string; slug: string } | null }[]
  authorName: string | null
  genreName: string | null
}

// The theme choice is client state, not a query string: reading `searchParams`
// in the page would make the route dynamic and defeat its weekly cache.
export function TenMinutesList({ texts, choices }: { texts: ListText[]; choices: ThemeChoice[] }) {
  const [theme, setTheme] = useState<string | null>(null)
  const shown = selectForTheme(texts, theme, choices).slice(0, MAX_RESULTS)

  return (
    <>
      {choices.length > 0 && (
        <div role="group" aria-label="Narrow by theme" className="mb-10 flex flex-wrap items-center gap-2">
          <span className="kicker mr-2">Any theme?</span>
          {[{ slug: null, name: 'All' }, ...choices].map(c => (
            <button
              key={c.slug ?? 'all'}
              type="button"
              aria-pressed={theme === c.slug}
              onClick={() => setTheme(c.slug)}
              className="inline-flex items-center hover:opacity-70 transition-opacity"
              style={chipStyle(theme === c.slug)}
              data-umami-event="ten-minutes-theme"
              data-umami-event-from="ten-minutes"
              data-umami-event-theme={c.slug ?? 'all'}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="divide-y" style={{ borderColor: 'var(--rule)' }}>
          {shown.map(t => (
            <li key={t.id}>
              <Link
                href={`/texts/${t.slug}`}
                className="block py-5 group"
                data-umami-event="text-open"
                data-umami-event-from="ten-minutes"
                data-umami-event-text={t.slug}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span
                    className="font-serif text-lg group-hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--ink)' }}
                  >
                    {t.title}
                  </span>
                  <span className="caption shrink-0">~ {readingMinutes(t.word_count)} min</span>
                </div>
                {t.authorName && (
                  <div className="text-sm mt-0.5" style={{ color: 'var(--ink-mute)' }}>
                    {t.authorName}
                    {t.genreName && ` · ${t.genreName}`}
                  </div>
                )}
                {t.summary && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-soft)', maxWidth: 'var(--reading-measure)' }}>
                    {t.summary}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>
          Nothing short enough is published yet.
        </p>
      )}
    </>
  )
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--serif-smallcaps)',
    fontFeatureSettings: '"smcp" 1',
    fontSize: 'var(--text-sm)',
    color: active ? 'var(--ink)' : 'var(--ink-mute)',
    border: `1px solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
    letterSpacing: '0.08em',
    padding: '2px 8px',
    background: 'transparent',
    cursor: 'pointer',
  }
}
