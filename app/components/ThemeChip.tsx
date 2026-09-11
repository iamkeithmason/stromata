import Link from 'next/link'

export function ThemeChip({
  href,
  name,
  source,
  tone = 'light',
}: {
  href: string
  name: string
  source: string
  /**
   * 'light' (default) — muted ink on the parchment ground.
   * 'dark'  — light vellum on a dark ground (used in the frontispiece hero).
   */
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <Link
      href={href}
      className="inline-flex items-center hover:opacity-70 transition-opacity"
      style={{
        fontFamily: 'var(--serif)',
        fontSize: 'var(--text-sm)',
        color: dark ? 'var(--on-dark-soft)' : 'var(--ink-mute)',
        border: `1px solid ${dark ? 'var(--on-dark-border)' : 'var(--rule)'}`,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        textDecoration: 'none',
      }}
      data-umami-event="theme-click"
      data-umami-event-theme={name}
      data-umami-event-source={source}
    >
      {name}
    </Link>
  )
}
