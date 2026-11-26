import Link from 'next/link'

export type EraRow = { slug: string; label: string; year_start: number | null; year_end: number | null }

/** "c. 325–600", "to c. 100", "1800–1900" from the eras table's years. */
export function eraSpan(e: EraRow): string | null {
  if (e.year_start == null && e.year_end != null) return `to c. ${e.year_end}`
  if (e.year_start != null && e.year_end != null) return `c. ${e.year_start}–${e.year_end}`
  return null
}

/**
 * The nine eras in a thin row, the author's marked. Each segment links to its
 * era page. Plain HTML and tokens: a segment is a 44px-tall link with a thin bar
 * inside, so it is a real tap target on a phone even though it looks like a
 * hairline. On a phone only the author's era is named, once, under the strip; from md
 * every segment carries its label.
 */
export function EraStrip({ eras, active, from }: { eras: EraRow[]; active: string | null; from: string }) {
  if (eras.length === 0) return null
  const activeEra = eras.find((e) => e.slug === active) ?? null
  return (
    <nav aria-label="Eras" className="era-strip">
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${eras.length}, minmax(0, 1fr))`, gap: 3 }}>
        {eras.map((e) => {
          const isActive = e.slug === active
          const span = eraSpan(e)
          return (
            <li key={e.slug} className="min-w-0">
              <Link
                href={`/eras/${e.slug}`}
                aria-label={`${e.label} era${span ? `, ${span}` : ''}${isActive ? ' (this author)' : ''}`}
                aria-current={isActive ? 'true' : undefined}
                className="era-strip-seg group flex flex-col justify-start"
                style={{ minHeight: 44, paddingTop: 8 }}
                data-umami-event="era-click"
                data-umami-event-from={from}
                data-umami-event-era={e.slug}
              >
                <span
                  aria-hidden="true"
                  className="block transition-opacity group-hover:opacity-70"
                  style={{
                    height: isActive ? 6 : 3,
                    marginTop: isActive ? 0 : 3,
                    background: isActive ? 'var(--gold)' : 'var(--rule)',
                  }}
                />
                <span
                  aria-hidden="true"
                  className="hidden md:block mt-1.5 text-xs leading-tight"
                  style={{ color: isActive ? 'var(--ink)' : 'var(--ink-faint)' }}
                >
                  {e.label}
                </span>
                {isActive && span && (
                  <span aria-hidden="true" className="hidden md:block text-xs leading-tight" style={{ color: 'var(--ink-faint)' }}>
                    {span}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
      {/* A phone's ninth of the width cannot hold a label, so the author's era is
          named once, under the strip. */}
      {activeEra && (
        <p aria-hidden="true" className="md:hidden mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
          <span style={{ color: 'var(--ink)' }}>{activeEra.label}</span>
          {eraSpan(activeEra) ? ` · ${eraSpan(activeEra)}` : ''}
        </p>
      )}
    </nav>
  )
}
