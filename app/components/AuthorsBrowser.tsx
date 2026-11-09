'use client'

import { useMemo, useState } from 'react'
import { FilterPill } from './FilterPill'
import { FilterToggle } from './FilterToggle'
import { useUrlFilters } from '@/lib/use-url-filters'
import { pickFacet } from '@/lib/facets'
import { AuthorCard } from './AuthorCard'
import { SectionHeader } from './SectionHeader'

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

const DEFAULTS: Filters = { tradition: '', era: '', sort: 'name' }

export function AuthorsBrowser({
  items,
  facets,
  from,
}: {
  items: AuthorItem[]
  facets: { traditions: Facet[]; eras: Facet[] }
  from: string
}) {
  // Read from the URL on the client so /authors stays statically cacheable —
  // see lib/use-url-filters.ts, and TextsBrowser for the same shape.
  const [filters, setFilters] = useUrlFilters<Filters>(
    DEFAULTS,
    params => ({
      tradition: pickFacet(params.get('tradition') ?? undefined, facets.traditions),
      era: pickFacet(params.get('era') ?? undefined, facets.eras),
      sort: SORTS.some(s => s.key === params.get('sort'))
        ? (params.get('sort') as SortKey)
        : 'name',
    }),
    f => {
      const params = new URLSearchParams()
      if (f.tradition) params.set('tradition', f.tradition)
      if (f.era) params.set('era', f.era)
      if (f.sort !== 'name') params.set('sort', f.sort)
      return params
    },
  )

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
  const activeCount = (filters.tradition ? 1 : 0) + (filters.era ? 1 : 0)

  // Phones only: the tradition and era tags fill most of the first screen
  // (nine rows of tags at 390px), so they wait behind a Filter button and the
  // authors come first. From sm up there is room, and they are always shown.
  const [filtersOpen, setFiltersOpen] = useState(false)

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
      <SectionHeader
        level="page"
        title="Authors"
        aside={hasFilter ? `${filtered.length} of ${items.length}` : `${items.length} in the library`}
      />

      <div className="mb-8 space-y-3">
        <div className="sm:hidden">
          <FilterToggle
            open={filtersOpen}
            onToggle={() => setFiltersOpen(o => !o)}
            activeCount={activeCount}
            controls="author-filters"
          />
        </div>
        <div
          id="author-filters"
          className={`${filtersOpen ? 'block' : 'hidden'} sm:block space-y-3`}
        >
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
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="smallcaps" style={{ color: 'var(--ink-faint)' }}>
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
        // The same arch card as the homepage's featured band; one column more at
        // each width than the band, because this grid is the whole page.
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-6">
          {filtered.map((a, i) => (
            <li key={a.id}>
              <AuthorCard
                from={from}
                textCount={a.textCount}
                // The first row is on screen at load; everything after waits
                // for the reader to scroll to it (portraits are Storage egress).
                lazy={i >= 4}
                author={{
                  name: a.name,
                  slug: a.slug,
                  birth_year: a.birth_year,
                  death_year: a.death_year,
                  imageUrl: a.imageUrl,
                  imageFocusX: a.imageFocusX,
                  imageFocusY: a.imageFocusY,
                  imageZoom: a.imageZoom,
                  traditionName: a.tradition?.name ?? null,
                  eraLabel: a.era?.label ?? null,
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>
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
        className="smallcaps shrink-0"
        style={{ color: 'var(--ink-faint)', width: '5rem' }}
      >
        {label}
      </span>
      <div className="flex gap-x-2 flex-wrap">
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
