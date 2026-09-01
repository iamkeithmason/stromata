import Link from 'next/link'
import MarkdownBody from '@/app/components/MarkdownBody'
import { LancetArch } from '@/app/components/LancetArch'
import { traditionColor } from '@/lib/tradition-colors'

type Props = {
  name: string
  slug: string | null
  birthYear: number | null
  deathYear: number | null
  eraName: string | null
  tradition: { name: string; slug: string } | null
  bio: string | null
}

/**
 * The "About the author" block in the reading page's left margin: a lancet-arch
 * initial, the author's name / dates / tradition, their biography, and a link
 * through to the full author page.
 */
export function AuthorAside({ name, slug, birthYear, deathYear, eraName, tradition, bio }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  // Dates line: "354–430 · Nicene & Post-Nicene". Fall back gracefully when a
  // year is missing.
  const years = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : deathYear
      ? (deathYear < 600 ? `c. ${deathYear}` : `d. ${deathYear}`)
      : null
  const datesLine = [years, eraName].filter(Boolean).join(' · ')

  return (
    <section>
      <p className="kicker" style={{ marginBottom: '1.5rem' }}>About the Author</p>

      <div style={{ aspectRatio: '200 / 380', maxWidth: '208px', margin: '0 0 1.5rem' }}>
        <LancetArch initial={initial} label={`Initial ${initial} for ${name}`} />
      </div>

      <p
        className="font-serif"
        style={{ fontSize: '1.125rem', color: 'var(--ink)', lineHeight: 1.3 }}
      >
        {name}
      </p>
      {datesLine && (
        <p
          className="font-serif"
          style={{ fontSize: 'var(--text-label)', color: 'var(--ink-mute)', marginTop: '0.25rem' }}
        >
          {datesLine}
        </p>
      )}
      {tradition && (
        <p
          className="font-serif uppercase"
          style={{
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.14em',
            color: traditionColor(tradition.slug),
            marginTop: '0.35rem',
          }}
        >
          {tradition.name}
        </p>
      )}

      {bio && (
        <div style={{ color: 'var(--ink-soft)', marginTop: '1.25rem' }}>
          <MarkdownBody content={bio} numbered={false} size="small" />
        </div>
      )}

      {slug && (
        <Link
          href={`/authors/${slug}`}
          className="kicker inline-block hover:opacity-70 transition-opacity"
          style={{ marginTop: '1rem', textDecoration: 'none' }}
        >
          Read more by the author →
        </Link>
      )}
    </section>
  )
}
