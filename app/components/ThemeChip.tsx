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
      // A cut-corner catalogue tag (Keith's choice, option C on /design/sans,
      // 27 Oct 2026): filled, no outline, corners clipped by .chip-tag.
      className="chip-tag inline-flex items-center hover:opacity-70 transition-opacity"
      style={{
        fontFamily: 'var(--ui-face)',
        fontSize: 'var(--text-sm)',
        color: dark ? 'var(--on-dark-soft)' : 'var(--ink-soft)',
        background: dark ? 'var(--on-dark-rule)' : 'var(--paper-deep)',
        letterSpacing: '0.02em',
        padding: '3px 9px',
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
