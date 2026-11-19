import Link from 'next/link'

/**
 * The italic heading over a rule that opens a page or a section.
 *
 * - level 'section' (default): an h2 over a gold rule, with an optional kicker
 *   aside that can link onward ("All authors →"). Homepage sections, reading
 *   history, featured authors.
 * - level 'page': the page's h1 over an ink rule, with a small-caps aside for a
 *   count ("566 texts"). The browse pages (/texts, /authors).
 *
 * Before this was shared, each page carried its own copy, and the copies had
 * started to drift (one of them was still in the retired near-black palette).
 */
export function SectionHeader({
  title,
  aside,
  asideHref,
  level = 'section',
}: {
  title: string
  aside?: string
  asideHref?: string
  level?: 'section' | 'page'
}) {
  const page = level === 'page'
  const Heading = page ? 'h1' : 'h2'
  const asideClass = page ? 'smallcaps' : 'kicker'
  const asideStyle = page ? { color: 'var(--ink-faint)' } : undefined

  return (
    <div className={page ? 'mb-6' : 'mb-8'}>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <Heading className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>
          {title}
        </Heading>
        {aside &&
          (asideHref ? (
            <Link
              href={asideHref}
              className={`${asideClass} transition-opacity hover:opacity-70`}
              style={{ ...asideStyle, textDecoration: 'none' }}
            >
              {aside}
            </Link>
          ) : (
            <span className={asideClass} style={asideStyle}>
              {aside}
            </span>
          ))}
      </div>
      {page ? (
        <hr style={{ borderColor: 'var(--ink)', borderTopWidth: '1px' }} />
      ) : (
        <hr className="rule-gold" />
      )}
    </div>
  )
}
