import Link from 'next/link'
import MarkdownBody from '@/app/components/MarkdownBody'
import { LancetArch } from '@/app/components/LancetArch'
import { traditionColor } from '@/lib/tradition-colors'

type Props = {
  name: string
  slug: string | null
  birthYear: number | null
  deathYear: number | null
  locationName: string | null
  eraName: string | null
  tradition: { name: string; slug: string } | null
  bio: string | null
  imageUrl?: string | null
}

/**
 * The "The Author" block at the top of the reading page's left margin rail: a
 * lancet-arch initial, the author's name / dates / place / era / tradition, a
 * short biography clamped to a few lines, and a link through to the full author
 * page.
 */
export function AuthorAside({ name, slug, birthYear, deathYear, locationName, eraName, tradition, bio, imageUrl }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  // Dates line: "354–430", falling back gracefully when a year is missing.
  const years = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : deathYear
      ? (deathYear < 600 ? `c. ${deathYear}` : `d. ${deathYear}`)
      : null

  return (
    <section>
      <p className="kicker" style={{ marginBottom: '1rem' }}>The Author</p>

      <div style={{ aspectRatio: '200 / 380', maxWidth: '200px', margin: '0 0 1.25rem' }}>
        <LancetArch initial={initial} label={`Initial ${initial} for ${name}`} imageUrl={imageUrl} />
      </div>

      <p
        className="font-serif"
        style={{ fontSize: '1.125rem', color: 'var(--ink)', lineHeight: 1.25 }}
      >
        {name}
      </p>

      {(years || locationName || eraName) && (
        <div
          className="font-serif"
          style={{ fontSize: 'var(--text-label)', color: 'var(--ink-mute)', lineHeight: 1.5, marginTop: '0.4rem' }}
        >
          {years && <p>{years}</p>}
          {locationName && <p>{locationName}</p>}
          {eraName && <p>{eraName}</p>}
        </div>
      )}

      {tradition && (
        <p
          className="font-serif uppercase"
          style={{
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.14em',
            color: traditionColor(tradition.slug),
            marginTop: '0.5rem',
          }}
        >
          {tradition.name}
        </p>
      )}

      {bio && (
        <div className="author-bio-clamp" style={{ color: 'var(--ink-soft)', marginTop: '1.1rem' }}>
          <MarkdownBody content={bio} numbered={false} size="small" />
        </div>
      )}

      {slug && (
        <Link
          href={`/authors/${slug}`}
          className="kicker inline-block hover:opacity-70 transition-opacity"
          style={{ marginTop: '0.85rem', textDecoration: 'none' }}
        >
          Read More →
        </Link>
      )}
    </section>
  )
}
