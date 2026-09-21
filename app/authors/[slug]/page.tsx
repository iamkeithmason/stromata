import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { readingMinutes } from '@/lib/reading-time'
import MarkdownBody from '@/app/components/MarkdownBody'
import { LancetArch } from '@/app/components/LancetArch'
import { JsonLd } from '@/app/components/JsonLd'
import { OG_IMAGE } from '@/lib/metadata'

const SITE_URL = 'https://www.thestromata.com'

// Incremental Static Regeneration: cache the rendered page and revalidate
// hourly. Safe given the manual publish cadence — newly published texts for
// this author appear within the window rather than requiring a redeploy.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

type TextRow = {
  id: string
  title: string
  slug: string
  word_count: number | null
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
}

type RelatedAuthor = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDates(birth: number | null, death: number | null): string | null {
  if (birth && death) return `${birth}–${death}`
  if (death) return `d. ${death}`
  if (birth) return `b. ${birth}`
  return null
}

function stripEraDates(label: string): string {
  return label.replace(/\s*\(.*?\)/, '').trim()
}

/**
 * Author-specific meta description, ~150–160 chars.
 * Format: "Read the works of [Name] ([dates]), [tradition] — N texts freely
 * available, edited for legibility. [first sentence of bio if room]."
 */
function buildMetaDescription(
  name: string,
  dates: string | null,
  tradition: string | null,
  textCount: number,
  bio: string | null
): string {
  let desc = `Read the works of ${name}`
  if (dates) desc += ` (${dates})`
  if (tradition) desc += `, ${tradition}`
  desc += ' — '
  desc += textCount > 0
    ? `${textCount} text${textCount === 1 ? '' : 's'} freely available, edited for legibility.`
    : 'works freely available in this library.'

  // Append bio first sentence if there's room
  if (bio && desc.length < 120) {
    const m = bio.match(/^[^.!?]+[.!?]/)
    const first = m?.[0]?.trim() ?? null
    if (first && desc.length + 1 + first.length <= 160) {
      desc += ` ${first}`
    }
  }

  return desc.length > 160 ? desc.slice(0, 158) + '…' : desc
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: author } = await supabase
    .from('authors')
    .select('id, name, bio, birth_year, death_year, draft, tradition:traditions(name), era:eras(label)')
    .eq('slug', slug)
    .single()

  if (!author) return { title: 'Author — The Stromata' }

  // Count published texts for this author
  const { count: textCount } = await supabase
    .from('texts')
    // select('id') not select('*'): anon cannot read the review-queue columns
    // (026), and PostgREST rejects the whole request when select=* includes an
    // unreadable column. head:true returns no rows either way.
    .select('id', { count: 'exact', head: true })
    .eq('author_id', author.id)
    .eq('published', true)

  // Draft authors are hidden UNLESS they have published texts whose bylines
  // link here (see the page component for the full rationale).
  if (author.draft && (textCount ?? 0) === 0) return { title: 'Author — The Stromata' }

  const tradition = (author.tradition as unknown as { name: string } | null)?.name ?? null
  const eraLabel = (author.era as unknown as { label: string } | null)?.label ?? null
  const eraShort = eraLabel ? stripEraDates(eraLabel) : null
  const dates = formatDates(author.birth_year, author.death_year)

  // "Jeremy Taylor (1613–1667) — Anglican | The Stromata"
  const descriptor = tradition ?? eraShort
  const namePart = dates ? `${author.name} (${dates})` : author.name
  const title = descriptor
    ? `${namePart} — ${descriptor} | The Stromata`
    : `${namePart} | The Stromata`

  const description = buildMetaDescription(
    author.name, dates, tradition, textCount ?? 0,
    // Suppress the unreviewed bio of a draft author from meta as well.
    author.draft ? null : (author.bio as string | null)
  )
  const canonicalUrl = `${SITE_URL}/authors/${slug}`

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: canonicalUrl,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicClient()

  // Both reads guarded — see lib/supabase/query.ts. `.maybeSingle()` because
  // `.single()` reports zero rows as an error, and the texts query because the
  // draft check below 404s on an empty `rows`: a failed query there would hide
  // a real author behind "no such page".
  const author = orThrow(
    await supabase
      .from('authors')
      .select('*, tradition:traditions(name, slug), era:eras(label, slug), loc:locations(name, slug)')
      .eq('slug', slug)
      .maybeSingle(),
    'an author page',
  )

  if (!author) notFound()

  const texts = orThrow(
    await supabase
      .from('texts')
      .select('id, title, slug, word_count, genre:genres(name), text_themes(theme:themes(name))')
      .eq('author_id', author.id)
      .eq('published', true)
      .order('title'),
    "an author's texts",
  )

  const rows = (texts ?? []) as unknown as TextRow[]

  // A draft author is an unreviewed pipeline stub. Keep it hidden (404) unless
  // it has published texts — those texts link here from their byline, so the
  // page must resolve rather than 404. When it does render for a draft author,
  // the unreviewed bio stays suppressed (below) until the author is promoted.
  if (author.draft && rows.length === 0) notFound()

  // Related authors — same tradition, exclude self, limit 6
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traditionId = (author as any).tradition_id as string | null
  const { data: relatedRaw } = traditionId ? await supabase
    .from('authors')
    .select('id, name, slug, birth_year, death_year')
    .eq('tradition_id', traditionId)
    .neq('id', author.id)
    .not('slug', 'is', null)
    .eq('draft', false)
    .order('name')
    .limit(6) : { data: [] }

  const relatedAuthors = (relatedRaw ?? []) as unknown as RelatedAuthor[]

  // Derived display values
  const traditionObj = author.tradition as { name: string; slug: string } | null
  const tradition = traditionObj?.name ?? null
  const eraObj = author.era as { label: string; slug: string } | null
  const eraLabel = eraObj?.label ?? null
  const eraSlug = eraObj?.slug ?? null
  const locationObj = author.loc as { name: string; slug: string } | null
  const locationCity = author.location as string | null
  const dates = formatDates(author.birth_year, author.death_year)
  const imageUrl = author.image_url as string | null
  const initial = author.name.trim().charAt(0).toUpperCase() || '·'
  const canonicalUrl = `${SITE_URL}/authors/${slug}`

  // Top themes for JSON-LD
  const themeCounts: Record<string, number> = {}
  for (const text of rows) {
    for (const tt of text.text_themes) {
      if (tt.theme?.name) {
        themeCounts[tt.theme.name] = (themeCounts[tt.theme.name] ?? 0) + 1
      }
    }
  }
  const topThemes = Object.entries(themeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([name]) => name)

  // JSON-LD Person — populated from real fields only, no fabricated values
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    ...(!author.draft && author.bio ? { description: (author.bio as string).slice(0, 300) } : {}),
    ...(author.birth_year ? { birthDate: String(author.birth_year) } : {}),
    ...(author.death_year ? { deathDate: String(author.death_year) } : {}),
    ...((tradition || topThemes.length > 0)
      ? { knowsAbout: [tradition, ...topThemes].filter(Boolean) }
      : {}),
    // sameAs: omitted — bio_source is a prose note, not a URL.
    // Wire this field when a proper Wikipedia/VIAF URL field is added to authors.
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={<Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>} />

      {/* JSON-LD structured data */}
      <JsonLd data={jsonLd} />

      <main id="main-content" className="content-shell py-12">

        {/* ── Author header ─────────────────────────────────────────────── */}
        <div className="mb-10 flex items-start gap-6">
          {imageUrl && (
            <div
              className="shrink-0 order-last"
              style={{ width: 128, aspectRatio: '200 / 380' }}
            >
              <LancetArch
                initial={initial}
                label={author.name}
                imageUrl={imageUrl}
                focusX={author.image_focus_x as number | null}
                focusY={author.image_focus_y as number | null}
                zoom={author.image_zoom as number | null}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
          <h1 className="font-serif text-3xl mb-2" style={{ color: 'var(--ink)' }}>
            {author.name}
          </h1>

          {(dates || tradition || eraLabel || locationObj) && (
            <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>
              {dates}
              {dates && tradition ? ' · ' : ''}
              {tradition && traditionObj?.slug ? (
                <Link href={`/traditions/${traditionObj.slug}`} className="hover:opacity-70 transition-opacity">
                  {tradition}
                </Link>
              ) : tradition}
              {eraLabel && eraSlug && (
                <>
                  {(dates || tradition) ? ' · ' : ''}
                  <Link href={`/eras/${eraSlug}`} className="hover:opacity-70 transition-opacity">
                    {eraLabel}
                  </Link>
                </>
              )}
              {eraLabel && !eraSlug && (
                <>{(dates || tradition) ? ' · ' : ''}{eraLabel}</>
              )}
              {locationObj && (
                <>
                  {(dates || tradition || eraLabel) ? ' · ' : ''}
                  <Link
                    href={`/locations/${locationObj.slug}`}
                    className="hover:opacity-70 transition-opacity"
                    data-umami-event="location-country-click"
                    data-umami-event-country={locationObj.name}
                    data-umami-event-from="author-page"
                  >
                    {locationObj.name}
                  </Link>
                </>
              )}
            </p>
          )}
          {locationCity && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-mute)' }}>
              {locationCity}
            </p>
          )}
          </div>
        </div>

        {/* ── Bio ──────────────────────────────────────────────────────────── */}
        {/* Hidden for draft authors — the bio is an unreviewed pipeline stub
            until Keith promotes the author from the admin edit form. */}
        {!author.draft && author.bio && (
          <div className="mb-10">
            <MarkdownBody content={author.bio} numbered={false} />
          </div>
        )}

        {/* ── Kindred authors ──────────────────────────────────────────────── */}
        {relatedAuthors.length > 0 && (
          <div className="mb-10">
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: 'var(--ink)' }}>
                  Kindred authors
                </h2>
                {tradition && <span className="kicker">{tradition}</span>}
              </div>
              <hr className="rule-gold" />
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
              {relatedAuthors.map(a => {
                const aDates = formatDates(a.birth_year, a.death_year)
                return (
                  <li key={a.id}>
                    <Link
                      href={`/authors/${a.slug}`}
                      className="flex items-baseline justify-between py-3 group hover:opacity-70 transition-opacity"
                      style={{ textDecoration: 'none' }}
                      data-umami-event="author-open"
                      data-umami-event-from="related-figures"
                      data-umami-event-author={a.name}
                    >
                      <span className="font-serif" style={{ color: 'var(--ink)' }}>
                        {a.name}
                      </span>
                      {aDates && (
                        <span className="text-xs ml-4 shrink-0" style={{ color: 'var(--ink-mute)' }}>
                          {aDates}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ── Texts in the library ─────────────────────────────────────────── */}
        {rows.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: 'var(--ink)' }}>
                  Texts in the library
                </h2>
                <span className="kicker">{rows.length}</span>
              </div>
              <hr className="rule-gold" />
            </div>

            <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
              {rows.map(t => {
                const themes = t.text_themes.map(tt => tt.theme?.name).filter(Boolean)
                return (
                  <li key={t.id}>
                    <Link
                      href={`/texts/${t.slug}`}
                      className="flex items-start justify-between py-4 group"
                      data-umami-event="text-open"
                      data-umami-event-from="author-page"
                      data-umami-event-text={t.slug}
                      data-umami-event-author={author.name}
                    >
                      <div>
                        <div>
                          <span
                            className="font-serif group-hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--ink)' }}
                          >
                            {t.title}
                          </span>
                          {themes.length > 0 && (
                            <span className="text-xs ml-3" style={{ color: 'var(--ink-mute)' }}>
                              {(themes as string[]).join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          approx. {readingMinutes(t.word_count)} min read
                        </div>
                      </div>
                      <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: 'var(--ink-mute)' }}>
                        {t.genre?.name}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {rows.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>No texts published yet.</p>
        )}

      </main>

      <TrackPageEvent
        event="author-page-view"
        data={{ author: slug, tradition: tradition ?? null }}
      />
    </div>
  )
}
