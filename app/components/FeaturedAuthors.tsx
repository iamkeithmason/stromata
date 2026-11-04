/**
 * FeaturedAuthors — the "featured authors" band on the homepage.
 *
 * Curated list of author slugs resolved against real DB records.
 * The CURATED_SLUGS array is editorial control over which authors appear
 * and in what order. The order is chosen so same-initial authors
 * (John Calvin / Julian of Norwich, both J) are not adjacent.
 *
 * Display name, dates, era, and tradition all come from the DB record.
 * The arch initial is derived from the first letter of the display name.
 *
 * Analytics: author-open event on each frame, from="featured-band".
 */

import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { LancetArch } from './LancetArch'
import { SectionHeader } from './SectionHeader'

// ── Curated author slugs — edit here to change which authors appear ──────────
// Four authors = one clean row on desktop; two columns on mobile.
// Update as the library grows to include Aquinas, Luther, Calvin, Julian etc.
const CURATED_SLUGS = [
  'augustine-of-hippo',     // A
  'basil-the-great',        // B
  'john-chrysostom',        // J
  'anselm-of-canterbury',   // A  (A at positions 1,4 — non-adjacent)
]
// ────────────────────────────────────────────────────────────────────────────

type AuthorRow = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  image_url: string | null
  image_focus_x: number | null
  image_focus_y: number | null
  image_zoom: number | null
  tradition: { name: string } | null
  era: { label: string } | null
}

function formatDates(birth: number | null, death: number | null): string {
  if (birth && death) return `${birth}–${death}`
  if (death) return `d. ${death}`
  if (birth) return `b. ${birth}`
  return ''
}

/** Strip the year range from era labels like "High Medieval (1000–1350)" → "High Medieval" */
function formatEra(label: string): string {
  return label.replace(/\s*\(.*?\)/, '').trim()
}

export async function FeaturedAuthors() {
  const supabase = createPublicClient()

  const { data: raw } = await supabase
    .from('authors')
    .select('id, name, slug, birth_year, death_year, image_url, image_focus_x, image_focus_y, image_zoom, tradition:traditions(name), era:eras(label)')
    .in('slug', CURATED_SLUGS)
    .eq('draft', false)

  const authorsMap = new Map<string, AuthorRow>()
  for (const a of (raw ?? []) as unknown as AuthorRow[]) {
    if (a.slug) authorsMap.set(a.slug, a)
  }

  // Re-sort to curated order; skip any slug not found in DB
  const authors = CURATED_SLUGS
    .map(slug => authorsMap.get(slug))
    .filter(Boolean) as AuthorRow[]

  if (authors.length === 0) return null

  return (
    <section className="content-shell pb-20">
      <SectionHeader title="Featured authors" aside="All authors →" asideHref="/authors" />

      {/* Arch grid — 4 cols on sm+, 2 on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {authors.map(author => {
          const initial = author.name.charAt(0)
          const dates = formatDates(author.birth_year, author.death_year)
          const era = author.era ? formatEra(author.era.label) : ''
          const tradition = author.tradition?.name ?? ''

          return (
            <Link
              key={author.slug}
              href={`/authors/${author.slug}`}
              className="group block text-center"
              style={{ textDecoration: 'none' }}
              data-umami-event="author-open"
              data-umami-event-from="featured-band"
              data-umami-event-author={author.name}
            >
              {/* Arch frame — cell pinned to 200:380 portrait ratio */}
              <div
                className="mx-auto transition-opacity group-hover:opacity-80"
                style={{ maxWidth: 140, aspectRatio: '200 / 380' }}
              >
                <LancetArch initial={initial} label={author.name} imageUrl={author.image_url} focusX={author.image_focus_x} focusY={author.image_focus_y} zoom={author.image_zoom} />
              </div>

              {/* Caption */}
              <div className="mt-3 px-1">
                <p
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--ink)',
                    marginBottom: '0.2rem',
                    lineHeight: 1.25,
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
                    {[dates, era].filter(Boolean).join(' · ')}
                  </p>
                )}
                {tradition && (
                  <p
                    style={{
                      fontSize: 'var(--text-sm)',
                      letterSpacing: '0.08em',
                      color: 'var(--gold-ink)',
                      fontFamily: 'var(--serif-smallcaps)',
      fontFeatureSettings: '"smcp" 1',
                    }}
                  >
                    {tradition}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
