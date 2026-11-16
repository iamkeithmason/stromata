'use client'

// Toggle tag used by the /texts and /authors index filter bars.
// The same cut-corner catalogue tag as the homepage's ThemeChip (.chip-tag),
// so a tag reads as a tag wherever it appears. At rest it is the ThemeChip
// exactly; selected, the fill turns to ink and the label to paper, so the
// chosen filter is plain at a glance without an outline (clip-path would cut
// an outline's corners off).
export function FilterPill({
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
      // The button is the 44px tap target (mobile-first checklist); the tag is
      // drawn on the inner span, as in ThemeChip, because .chip-tag's clip-path
      // would also clip any hit area added to the element that carries it.
      className="inline-flex items-center hover:opacity-70 transition-opacity"
      style={{ minHeight: 44, background: 'transparent', cursor: 'pointer' }}
    >
      <span
        className="chip-tag inline-flex items-center"
        style={{
          fontFamily: 'var(--ui-face)',
          fontSize: 'var(--text-sm)',
          color: active ? 'var(--paper)' : 'var(--ink-soft)',
          background: active ? 'var(--ink-soft)' : 'var(--paper-deep)',
          letterSpacing: '0.02em',
          padding: '3px 9px',
        }}
      >
        {label}
      </span>
    </button>
  )
}
