'use client'

// Toggle pill used by the /texts and /authors index filter bars.
// Resting state mirrors ThemeChip; active state swaps the rule for gold + ink text.
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
