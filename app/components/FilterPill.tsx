'use client'

// Toggle pill used by the /texts and /authors index filter bars.
// An outlined toggle (unlike the filled ThemeChip): the outline turns gold and
// the text darkens to ink when active.
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
      className="inline-flex items-center hover:opacity-70 transition-opacity"
      style={{
        fontFamily: 'var(--ui-face)',
        fontSize: 'var(--text-sm)',
        color: active ? 'var(--ink)' : 'var(--ink-mute)',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--rule)'}`,
        letterSpacing: '0.02em',
        padding: '2px 8px',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
