import Link from 'next/link'

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <Link
      href="/"
      style={{
        fontFamily: 'var(--serif-display)',
        fontSize: size,
        letterSpacing: '0.32em',
        color: 'var(--ink)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      STROMATA
    </Link>
  )
}
