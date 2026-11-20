import Link from 'next/link'
import MarkdownBody from '@/app/components/MarkdownBody'
import { LancetArch, LANCET_TIGHT_RATIO } from '@/app/components/LancetArch'
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
  imageFocusX?: number | null
  imageFocusY?: number | null
  imageZoom?: number | null
}

/**
 * The author block at the top of the reading page's left margin rail: the
 * lancet-arch portrait (or initial), the author's name as the block's heading,
 * dates · place · era on one line, the tradition, a short biography clamped to
 * a few lines, and a link through to the full author page.
 */
export function AuthorAside({ name, slug, birthYear, deathYear, locationName, eraName, tradition, bio, imageUrl, imageFocusX, imageFocusY, imageZoom }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  // Dates line: "354–430", falling back gracefully when a year is missing.
  const years = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : deathYear
      ? (deathYear < 600 ? `c. ${deathYear}` : `d. ${deathYear}`)
      : null

  // One muted meta line: "d. 1546 · Germany · Reformation". It wraps at the
  // middots' word boundaries when long.
  const meta = [years, locationName, eraName].filter(Boolean) as string[]

  return (
    <section>
      {/* The portrait leads the block: the name below is its heading, so the
          "The Author" eyebrow it used to carry said the same thing twice.
          `tight` crops the arch's box to the arch, so nothing blank sits over
          it; it fills the rail column (capped when the rail stacks). */}
      <div className="author-rail-arch" style={{ aspectRatio: LANCET_TIGHT_RATIO, marginBottom: '1.25rem' }}>
        <LancetArch fit="tight" initial={initial} label={`Initial ${initial} for ${name}`} imageUrl={imageUrl} focusX={imageFocusX} focusY={imageFocusY} zoom={imageZoom} />
      </div>

      <h2
        style={{ fontFamily: 'var(--serif-display)', fontSize: 'var(--text-xl)', color: 'var(--ink)', lineHeight: 1.2 }}
      >
        {name}
      </h2>

      {meta.length > 0 && (
        <p
          className="font-serif"
          style={{ fontSize: 'var(--text-label)', color: 'var(--ink-mute)', lineHeight: 1.5, marginTop: '0.4rem' }}
        >
          {meta.map((part, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden style={{ color: 'var(--ink-faint)' }}> · </span>}
              {part}
            </span>
          ))}
        </p>
      )}

      {/* The rail's one label style: the same .kicker as "About this edition"
          and "Download", in the tradition's own colour. */}
      {tradition && (
        <p
          className="kicker tradition-label"
          style={{
            // A custom property, not `color`: .tradition-label decides how the
            // hue is used, so the reader dark theme can lighten it.
            ['--tradition' as string]: traditionColor(tradition.slug),
            marginTop: '0.75rem',
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
        <Link data-umami-event="author-open" data-umami-event-from="text-reader" data-umami-event-author={name}
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
