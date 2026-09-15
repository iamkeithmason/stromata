'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FilterPill } from './FilterPill'
import { LancetArch } from './LancetArch'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

type Facet = { slug: string; label: string }

export type AuthorItem = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  imageUrl: string | null
  imageFocusX: number | null
  imageFocusY: number | null
  imageZoom: number | null
  tradition: { slug: string; name: string } | null
  era: { slug: string; label: string } | null
  textCount: number
}

type SortKey = 'name' | 'texts' | 'chronological'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'texts', label: 'Most texts' },
  { key: 'chronological', label: 'Chronological' },
]

type Filters = { tradition: string; era: string; sort: SortKey }

export function AuthorsBrowser({
  items,
  facets,
  initial,
  from,
}: {
  items: AuthorItem[]
  facets: { traditions: Facet[]; eras: Facet[] }
  initial: Filters
  from: string
}) {
  const [filters, setFilters] = useState<Filters>(initial)

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.tradition) params.set('tradition', filters.tradition)
    if (filters.era) params.set('era', filters.era)
    if (filters.sort !== 'name') params.set('sort', filters.sort)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [filters])

  // Toggle a facet; fire an analytics event only when a filter is applied (not cleared).
  const set = (key: 'tradition' | 'era', value: string) => {
    const next = filters[key] === value ? '' : value
    if (next) window.umami?.track('index-filter', { from, dimension: key, value: next })
    setFilters(f => ({ ...f, [key]: next }))
  }

  const changeSort = (sort: SortKey) => {
    if (filters.sort !== sort) window.umami?.track('index-sort', { from, sort })
    setFilters(f => ({ ...f, sort }))
  }

  const hasFilter = Boolean(filters.tradition || filters.era)

  const filtered = useMemo(() => {
    const list = items.filter(
      a =>
        (!filters.tradition || a.tradition?.slug === filters.tradition) &&
        (!filters.era || a.era?.slug === filters.era),
    )
    if (filters.sort === 'texts') {
      return [...list].sort((a, b) => b.textCount - a.textCount || a.name.localeCompare(b.name))
    }
    if (filters.sort === 'chronological') {
      const key = (a: AuthorItem) => a.death_year ?? a.birth_year ?? Infinity
      return [...list].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
    }
    return list // already name-ordered from the query
  }, [items, filters])

  return (
    <>
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>
            Authors
          </h1>
          <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
            {hasFilter ? `${filtered.length} of ${items.length}` : `${items.length} in the library`}
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
              onClick={() => setFilters(f => ({ tradition: '', era: '', sort: f.sort }))}
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
          {filtered.map(a => (
            <li key={a.id}>
              {/* Stretched-link pattern: author row is the base, tradition link sits above */}
              <div className="relative flex items-start justify-between py-4 group">
                <div className="flex items-center gap-3 min-w-0">
                  {a.imageUrl && (
                    <div className="shrink-0" style={{ width: 30, aspectRatio: '200 / 380' }}>
                      <LancetArch initial={a.name.charAt(0)} label={a.name} imageUrl={a.imageUrl} focusX={a.imageFocusX} focusY={a.imageFocusY} zoom={a.imageZoom} />
                    </div>
                  )}
                  <div>
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {a.name}
                    </span>
                    <span className="text-sm ml-3" style={{ color: '#6f6a60' }}>
                      {a.birth_year && a.death_year
                        ? `${a.birth_year}–${a.death_year}`
                        : a.death_year
                          ? `d. ${a.death_year}`
                          : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right ml-4 shrink-0">
                  {a.tradition?.slug ? (
                    <Link
                      href={`/traditions/${a.tradition.slug}`}
                      className="text-xs relative hover:opacity-70 transition-opacity"
                      style={{ color: '#6f6a60', zIndex: 2 }}
                    >
                      {a.tradition.name}
                    </Link>
                  ) : (
                    <span className="text-xs" style={{ color: '#6f6a60' }}>
                      {a.tradition?.name}
                    </span>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                    {a.textCount} text{a.textCount === 1 ? '' : 's'}
                  </div>
                </div>
                {/* Stretched link covers the row but sits below the tradition link */}
                <Link data-umami-event="author-open" data-umami-event-from="authors-index" data-umami-event-author={a.name}
                  href={`/authors/${a.slug}`}
                  className="absolute inset-0"
                  style={{ zIndex: 1 }}
                  aria-label={a.name}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: '#6f6a60' }}>
          No authors match these filters.
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
