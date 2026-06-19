import Link from 'next/link'

export function ThemeChip({ href, name, source }: { href: string; name: string; source: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center hover:opacity-70 transition-opacity"
      style={{
        fontFamily: 'var(--serif)',
        fontSize: 'var(--text-sm)',
        color: 'var(--ink-mute)',
        border: '1px solid var(--rule)',
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
