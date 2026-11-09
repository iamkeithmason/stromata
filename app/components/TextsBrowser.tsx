'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FilterPill } from './FilterPill'
import { useUrlFilters } from '@/lib/use-url-filters'
import { pickFacet } from '@/lib/facets'
import { SectionHeader } from './SectionHeader'

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

const DEFAULTS: Filters = { tradition: '', era: '', genre: '', sort: 'title' }

export function TextsBrowser({
  items,
  facets,
  from,
}: {
  items: TextItem[]
  facets: { traditions: Facet[]; eras: Facet[]; genres: Facet[] }
  from: string
}) {
  // Filters live in the URL so a filtered view is shareable, and are read from
  // it here rather than on the server — which is what lets /texts be statically
  // cached instead of re-querying the whole library per request. See
  // lib/use-url-filters.ts.
  const [filters, setFilters] = useUrlFilters<Filters>(
    DEFAULTS,
    params => ({
      // pickFacet keeps an unknown or stale slug from filtering everything out.
      tradition: pickFacet(params.get('tradition') ?? undefined, facets.traditions),
      era: pickFacet(params.get('era') ?? undefined, facets.eras),
      genre: pickFacet(params.get('genre') ?? undefined, facets.genres),
      sort: SORTS.some(s => s.key === params.get('sort'))
        ? (params.get('sort') as SortKey)
        : 'title',
    }),
    f => {
      const params = new URLSearchParams()
      if (f.tradition) params.set('tradition', f.tradition)
      if (f.era) params.set('era', f.era)
      if (f.genre) params.set('genre', f.genre)
      if (f.sort !== 'title') params.set('sort', f.sort)
      return params
    },
  )

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
  const activeCount = [filters.tradition, filters.era, filters.genre].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(hasFilter)
  // A filter applied from a shared link arrives after the first render.
  useEffect(() => {
    if (hasFilter) setFiltersOpen(true)
  }, [hasFilter])

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
      <SectionHeader
        level="page"
        title="Library"
        aside={hasFilter ? `${filtered.length} of ${items.length}` : `${items.length} text${items.length === 1 ? '' : 's'}`}
      />

      <div className="mb-8 space-y-3">
        {/* Thirty-odd facet pills used to fill the first screen before any
            title. They now sit behind one line, open whenever a filter is set
            so a shared filtered link still shows what it is filtering on. */}
        <details
          open={filtersOpen}
          onToggle={e => setFiltersOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary
            className="smallcaps cursor-pointer select-none"
            style={{ color: 'var(--ink-mute)', width: 'fit-content' }}
          >
            Filter by tradition, era or genre
            {activeCount > 0 && (
              <span style={{ color: 'var(--gold-ink)' }}> · {activeCount} active</span>
            )}
          </summary>
          <div className="space-y-3 pt-3">
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
          </div>
        </details>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="smallcaps" style={{ color: 'var(--ink-mute)' }}>
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
        <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
          {filtered.map(t => (
            <li key={t.id}>
              <Link data-umami-event="text-open" data-umami-event-from="texts-index" data-umami-event-text={t.slug} href={`/texts/${t.slug}`} className="flex items-start justify-between py-4 group">
                <div>
                  <div>
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--ink)' }}
                    >
                      {t.title}
                    </span>
                    {t.author && (
                      <span className="text-sm ml-3" style={{ fontFamily: 'var(--ui-face)', color: 'var(--ink-faint)' }}>
                        {t.author.name}
                      </span>
                    )}
                    {t.themes.length > 0 && (
                      <span className="text-xs ml-3" style={{ fontFamily: 'var(--ui-face)', color: 'var(--ink-faint)' }}>
                        {t.themes.join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ fontFamily: 'var(--ui-face)', color: 'var(--ink-mute)' }}>
                    approx. {t.minutes} min read
                  </div>
                </div>
                <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ fontFamily: 'var(--ui-face)', color: 'var(--ink-faint)' }}>
                  {t.genre?.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>
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
        className="smallcaps shrink-0"
        style={{ color: 'var(--ink-mute)', width: '5rem' }}
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
        fontFamily: 'var(--ui-face)',
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
