'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FilterPill } from './FilterPill'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

// Facet reference (slug identifies, label displays).
type Facet = { slug: string; label: string }

// A pre-processed text row — bodies are turned into a reading-time integer server-side
// so the (large) body strings never ship to the client.
export type TextItem = {
  id: string
  title: string
  slug: string
  minutes: number
  author: { name: string; slug: string | null } | null
  tradition: { slug: string; name: string } | null
  era: { slug: string; label: string } | null
  genre: { slug: string; name: string } | null
  themes: string[]
}

type SortKey = 'title' | 'author' | 'length'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'length', label: 'Length' },
]

type Filters = { tradition: string; era: string; genre: string; sort: SortKey }

export function TextsBrowser({
  items,
  facets,
  initial,
  from,
}: {
  items: TextItem[]
  facets: { traditions: Facet[]; eras: Facet[]; genres: Facet[] }
  initial: Filters
  from: string
}) {
  const [filters, setFilters] = useState<Filters>(initial)

  // Keep the URL in sync so a filtered view is shareable/bookmarkable, without a
  // server round-trip (history.replaceState, not the router).
  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.tradition) params.set('tradition', filters.tradition)
    if (filters.era) params.set('era', filters.era)
    if (filters.genre) params.set('genre', filters.genre)
    if (filters.sort !== 'title') params.set('sort', filters.sort)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [filters])

  // Toggle a facet; fire an analytics event only when a filter is applied (not cleared).
  const set = (key: 'tradition' | 'era' | 'genre', value: string) => {
    const next = filters[key] === value ? '' : value
    if (next) window.umami?.track('index-filter', { from, dimension: key, value: next })
    setFilters(f => ({ ...f, [key]: next }))
  }

  const changeSort = (sort: SortKey) => {
    if (filters.sort !== sort) window.umami?.track('index-sort', { from, sort })
    setFilters(f => ({ ...f, sort }))
  }

  const hasFilter = Boolean(filters.tradition || filters.era || filters.genre)

  const filtered = useMemo(() => {
    const list = items.filter(
      t =>
        (!filters.tradition || t.tradition?.slug === filters.tradition) &&
        (!filters.era || t.era?.slug === filters.era) &&
        (!filters.genre || t.genre?.slug === filters.genre),
    )
    if (filters.sort === 'author') {
      return [...list].sort((a, b) => (a.author?.name ?? '').localeCompare(b.author?.name ?? ''))
    }
    if (filters.sort === 'length') {
      return [...list].sort((a, b) => b.minutes - a.minutes)
    }
    return list // already title-ordered from the query
  }, [items, filters])

  return (
    <>
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>
            Library
          </h1>
          <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
            {hasFilter
              ? `${filtered.length} of ${items.length}`
              : `${items.length} text${items.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
      </div>

      <div className="mb-8 space-y-3">
        <FilterRow
          label="Tradition"
          options={facets.traditions}
          selected={filters.tradition}
          onToggle={slug => set('tradition', slug)}
        />
        <FilterRow
          label="Era"
          options={facets.eras}
          selected={filters.era}
          onToggle={slug => set('era', slug)}
        />
        <FilterRow
          label="Genre"
          options={facets.genres}
          selected={filters.genre}
          onToggle={slug => set('genre', slug)}
        />
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#9c9589' }}>
            Sort
          </span>
          {SORTS.map(s => (
            <SortButton
              key={s.key}
              label={s.label}
              active={filters.sort === s.key}
              onClick={() => changeSort(s.key)}
            />
          ))}
          {hasFilter && (
            <button
              type="button"
              onClick={() => setFilters(f => ({ tradition: '', era: '', genre: '', sort: f.sort }))}
              className="text-xs hover:opacity-70 transition-opacity ml-auto"
              style={{ color: 'var(--gold-ink)', background: 'transparent', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
          {filtered.map(t => (
            <li key={t.id}>
              <Link href={`/texts/${t.slug}`} className="flex items-start justify-between py-4 group">
                <div>
                  <div>
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {t.title}
                    </span>
                    {t.author && (
                      <span className="text-sm ml-3" style={{ color: '#6f6a60' }}>
                        {t.author.name}
                      </span>
                    )}
                    {t.themes.length > 0 && (
                      <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                        {t.themes.join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                    approx. {t.minutes} min read
                  </div>
                </div>
                <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: '#6f6a60' }}>
                  {t.genre?.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: '#6f6a60' }}>
          No texts match these filters.
        </p>
      )}
    </>
  )
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Facet[]
  selected: string
  onToggle: (slug: string) => void
}) {
  // Nothing to narrow if the library holds only one value for this dimension.
  if (options.length < 2) return null
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span
        className="text-xs tracking-[0.18em] uppercase shrink-0"
        style={{ color: '#9c9589', width: '5rem' }}
      >
        {label}
      </span>
      <div className="flex gap-2 flex-wrap">
        {options.map(o => (
          <FilterPill
            key={o.slug}
            label={o.label}
            active={selected === o.slug}
            onClick={() => onToggle(o.slug)}
          />
        ))}
      </div>
    </div>
  )
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-xs hover:opacity-70 transition-opacity"
      style={{
        color: active ? 'var(--ink)' : 'var(--ink-mute)',
        borderBottom: `1px solid ${active ? 'var(--gold)' : 'transparent'}`,
        paddingBottom: '1px',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
