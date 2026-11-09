'use client'

// The "Filter ▾" button that shows and hides an index page's filter tags
// (/authors and /texts). One component so the two pages' buttons stay alike:
// small caps, a gold count when filters are on (so a filtered list never looks
// unfiltered with the panel shut), and a 44px tap target.
// The caller owns the open state and decides at which widths the button shows.
export function FilterToggle({
  open,
  onToggle,
  activeCount,
  controls,
}: {
  open: boolean
  onToggle: () => void
  activeCount: number
  /** id of the panel this button shows and hides */
  controls: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="inline-flex items-center gap-2 hover:opacity-70 transition-opacity"
      style={{ minHeight: 44, background: 'transparent', cursor: 'pointer' }}
    >
      <span className="smallcaps" style={{ color: 'var(--ink-soft)' }}>
        Filter
      </span>
      {activeCount > 0 && (
        <span className="text-xs" style={{ color: 'var(--gold-ink)' }}>
          {activeCount} on
        </span>
      )}
      <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)' }}>
        {open ? '▴' : '▾'}
      </span>
    </button>
  )
}
