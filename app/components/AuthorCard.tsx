/**
 * AuthorCard — an author in a lancet-arch frame with a centred caption.
 *
 * One component for every author grid, so the homepage's featured band and
 * the /authors index look the same and stay the same: name, dates, era on its
 * own line, tradition in gold small caps, and (on the index) a text count.
 *
 * The whole card is one link, which gives a phone reader a tap target the
 * size of the portrait rather than the size of a line of type.
 *
 * Plain component with no hooks, so it renders inside both the server-side
 * FeaturedAuthors and the client-side AuthorsBrowser.
 */

import Link from 'next/link'
import { LancetArch } from './LancetArch'

export type AuthorCardData = {
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  imageUrl: string | null
  imageFocusX: number | null
  imageFocusY: number | null
  imageZoom: number | null
  traditionName: string | null
  eraLabel: string | null
}

export function formatAuthorDates(birth: number | null, death: number | null): string {
  if (birth && death) return `${birth}–${death}`
  if (death) return `d. ${death}`
  if (birth) return `b. ${birth}`
  return ''
}

/** Strip the year range from era labels like "High Medieval (1000–1350)" → "High Medieval" */
export function formatEra(label: string): string {
  return label.replace(/\s*\(.*?\)/, '').trim()
}

export function AuthorCard({
  author,
  from,
  textCount,
  lazy,
  section,
}: {
  author: AuthorCardData
  /** The `from` surface for the author-open event (see CLAUDE.md vocabulary). */
  from: string
  /** Shown under the tradition when given (the index); omitted on the homepage. */
  textCount?: number
  lazy?: boolean
  /** The `section` qualifier for the author-open event, where the surface has sections (the author page's kindred row). */
  section?: string
}) {
  const dates = formatAuthorDates(author.birth_year, author.death_year)
  const era = author.eraLabel ? formatEra(author.eraLabel) : ''

  return (
    <Link
      href={`/authors/${author.slug}`}
      className="group block text-center"
      style={{ textDecoration: 'none' }}
      data-umami-event="author-open"
      data-umami-event-from={from}
      data-umami-event-section={section}
      data-umami-event-author={author.name}
    >
      {/* Arch frame — cell pinned to 200:380 portrait ratio */}
      <div
        className="mx-auto transition-opacity group-hover:opacity-80"
        style={{ maxWidth: 140, aspectRatio: '200 / 380' }}
      >
        <LancetArch
          initial={author.name.charAt(0)}
          label={author.name}
          imageUrl={author.imageUrl}
          focusX={author.imageFocusX}
          focusY={author.imageFocusY}
          zoom={author.imageZoom}
          lazy={lazy}
        />
      </div>

      <div className="mt-3 px-1">
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'var(--text-base)',
            color: 'var(--ink)',
            marginBottom: '0.2rem',
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
          }}
        >
          {author.name}
        </p>
        {(dates || era) && (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'var(--text-base)',
              color: 'var(--ink-mute)',
              marginBottom: '0.25rem',
              letterSpacing: '0.04em',
            }}
          >
            {dates}
            {/* The era on its own line, unbroken: run together with the
                dates, "Nicene & Post-Nicene" broke at its hyphen and the
                separator dot was left hanging at the end of a line. */}
            {era && <span className="block" style={{ whiteSpace: 'nowrap' }}>{era}</span>}
          </p>
        )}
        {author.traditionName && (
          <p
            style={{
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.08em',
              color: 'var(--gold-ink)',
              fontFamily: 'var(--serif-smallcaps)',
              fontFeatureSettings: '"smcp" 1',
            }}
          >
            {author.traditionName}
          </p>
        )}
        {textCount !== undefined && (
          <p
            className="mt-1"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}
          >
            {textCount} text{textCount === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </Link>
  )
}
