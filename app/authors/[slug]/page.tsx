import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import MarkdownBody from '@/app/components/MarkdownBody'
import { LancetArch } from '@/app/components/LancetArch'
import { JsonLd } from '@/app/components/JsonLd'
import { OG_IMAGE } from '@/lib/metadata'
import { EraStrip, type EraRow } from '@/app/components/EraStrip'
import { TrackedDetails } from '@/app/components/TrackedDetails'
import { ornamentUrl } from '@/lib/genres/ornaments'
import {
  buildWorks,
  corpusLine,
  formatDuration,
  formHeading,
  groupByForm,
  shortReads,
  totals,
  COMPACT_PARTS_OVER,
  type CollectionMeta,
  type Work,
  type WorkText,
} from '@/lib/works'

const SITE_URL = 'https://www.thestromata.com'

// Incremental Static Regeneration: cache the rendered page and revalidate
// weekly (hourly until 2026-09-29, daily until 2026-10-04 — Vercel Hobby CPU). Safe given the manual
// publish cadence, and publish-text.ts revalidates the path on publish — newly published texts for
// this author appear within the window rather than requiring a redeploy.
export const revalidate = 604800

// Cache each page on its first visit. Without generateStaticParams, Next 15
// classes a [param] route as dynamic and renders it on EVERY request, and the
// `revalidate` above does nothing for the page: in the 12 hours to 4 Nov 2026
// /texts/[slug] rendered 1,100 times for ~4 min of CPU, most of the Hobby
// allowance. An empty list prebuilds nothing at deploy (builds stay cheap) but
// makes the route ISR: `next build` shows it as ● with a cache window, not ƒ.
// lib/cache/public-pages-are-cached.test.ts keeps it that way.
export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

type TextRow = {
  id: string
  title: string
  slug: string
  word_count: number | null
  collection_id: string | null
  collection_order: number | null
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
      .select('id, title, slug, word_count, collection_id, collection_order, genre:genres(name), text_themes(theme:themes(name))')
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

  // Collections the texts belong to, eras for the strip, and kindred authors —
  // independent reads, so in parallel. Metadata columns only: no bodies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traditionId = (author as any).tradition_id as string | null
  const collectionIds = [...new Set(rows.map(t => t.collection_id).filter(Boolean))] as string[]
  const [{ data: collectionsRaw }, { data: erasRaw }, { data: relatedRaw }] = await Promise.all([
    collectionIds.length > 0
      ? supabase.from('collections').select('id, title, slug, published').in('id', collectionIds)
      : Promise.resolve({ data: [] }),
    supabase.from('eras').select('slug, label, year_start, year_end').order('id'),
    // Same tradition, not self, not a draft, and with at least one published
    // text: `!inner` drops authors with none, so the list never sends a reader
    // to an empty page. The embedded ids are only there to make the join; one
    // per author is enough.
    traditionId
      ? supabase
          .from('authors')
          .select('id, name, slug, birth_year, death_year, texts!inner(id)')
          .eq('tradition_id', traditionId)
          .eq('texts.published', true)
          .neq('id', author.id)
          .not('slug', 'is', null)
          .eq('draft', false)
          .order('name')
          .limit(1, { referencedTable: 'texts' })
          .limit(6)
      : Promise.resolve({ data: [] }),
  ])

  const relatedAuthors = (relatedRaw ?? []) as unknown as RelatedAuthor[]
  const eras = (erasRaw ?? []) as EraRow[]

  const workTexts: WorkText[] = rows.map(t => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    word_count: t.word_count,
    collection_id: t.collection_id,
    collection_order: t.collection_order,
    genre: t.genre?.name ?? null,
    themes: t.text_themes.map(tt => tt.theme?.name).filter((n): n is string => Boolean(n)),
  }))
  const works = buildWorks(workTexts, (collectionsRaw ?? []) as CollectionMeta[])
  const groups = groupByForm(works)
  // An author who wrote in one form gets no form headings: "Sermons · 1 work"
  // above a single sermon says nothing the row does not.
  const showFormHeadings = groups.length > 1
  const corpus = totals(works)
  const shorts = shortReads(works)

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
  const bio = !author.draft && author.bio ? (author.bio as string) : null
  // Clamp on a phone only when the bio is long enough to push the works down;
  // a short one would gain a "Continue reading" that reveals nothing.
  const clampBio = bio != null && bio.length > BIO_CLAMP_OVER_CHARS

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

  // The metadata line, in small caps: dates · tradition · era · location.
  const metaBits: React.ReactNode[] = []
  if (dates) metaBits.push(<span key="dates">{dates}</span>)
  if (tradition) {
    metaBits.push(
      traditionObj?.slug ? (
        <Link key="tradition" href={`/traditions/${traditionObj.slug}`} className="hover:opacity-70 transition-opacity">
          {tradition}
        </Link>
      ) : <span key="tradition">{tradition}</span>
    )
  }
  if (eraLabel) {
    metaBits.push(
      eraSlug ? (
        <Link key="era" href={`/eras/${eraSlug}`} className="hover:opacity-70 transition-opacity">
          {eraLabel}
        </Link>
      ) : <span key="era">{eraLabel}</span>
    )
  }
  if (locationCity || locationObj) {
    metaBits.push(
      <span key="place">
        {locationCity && <>{locationCity}{locationObj ? ', ' : ''}</>}
        {locationObj && (
          <Link
            href={`/locations/${locationObj.slug}`}
            className="hover:opacity-70 transition-opacity"
            data-umami-event="location-country-click"
            data-umami-event-country={locationObj.name}
            data-umami-event-from="author-page"
          >
            {locationObj.name}
          </Link>
        )}
      </span>
    )
  }

  const textOpen = (textSlug: string, section: 'short-reads' | 'work' | 'part') => ({
    'data-umami-event': 'text-open',
    'data-umami-event-from': 'author-page',
    'data-umami-event-section': section,
    'data-umami-event-text': textSlug,
    'data-umami-event-author': author.name,
  })

  const renderWork = (w: Work) => {
    if (w.kind === 'text') {
      return (
        <li key={w.id} className="py-4">
          <Link
            href={`/texts/${w.slug}`}
            className="font-serif hover:opacity-70 transition-opacity"
            style={{ color: 'var(--ink)' }}
            {...textOpen(w.slug, 'work')}
          >
            {w.title}
          </Link>
          <WorkMeta minutes={w.minutes} themes={w.themes} />
        </li>
      )
    }
    const compact = w.parts.length > COMPACT_PARTS_OVER
    return (
      <li key={w.id} className="py-4">
        <Link
          href={`/collections/${w.slug}`}
          className="font-serif hover:opacity-70 transition-opacity"
          style={{ color: 'var(--ink)' }}
          data-umami-event="collection-open"
          data-umami-event-from="author-page"
          data-umami-event-section="work"
          data-umami-event-collection={w.slug}
        >
          {w.title}
        </Link>
        <WorkMeta
          lead={`${w.parts.length} ${w.parts.length === 1 ? 'part' : 'parts'}`}
          minutes={w.minutes}
          themes={w.themes}
        />
        <TrackedDetails
          className="work-parts mt-1"
          summaryClassName="work-parts-summary text-sm"
          summary={`Show all ${w.parts.length} parts`}
          event="collection-expand"
          data={{ from: 'author-page', collection: w.slug }}
        >
          <ol
            className={`mt-2 mb-1 text-sm ${compact ? 'md:columns-2 lg:columns-3' : ''}`}
            style={{ columnGap: '2rem' }}
          >
            {w.parts.map(p => (
              <li key={p.id} className="break-inside-avoid">
                <Link
                  href={`/texts/${p.slug}`}
                  className="flex items-baseline justify-between gap-3 py-2 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--ink)' }}
                  {...textOpen(p.slug, 'part')}
                >
                  <span>{p.title}</span>
                  {p.minutes > 0 && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--ink-faint)' }}>
                      {p.minutes} min
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </TrackedDetails>
      </li>
    )
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={<Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>} />

      {/* JSON-LD structured data */}
      <JsonLd data={jsonLd} />

      <main id="main-content" className="content-shell py-10 md:py-12">

        {/* ── Header, set like a title page ─────────────────────────────── */}
        {/* Phone: the portrait sits centred above the name, smaller. From md it
            stands beside the name, as before. */}
        <header className="mb-8 flex flex-col items-center text-center md:flex-row md:items-start md:text-left md:gap-8">
          {imageUrl && (
            <div className="author-portrait shrink-0 mb-5 md:mb-0 md:order-last">
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
          <div className="flex-1 min-w-0 w-full">
            <h1 className="font-serif text-3xl mb-2" style={{ color: 'var(--ink)' }}>
              {author.name}
            </h1>

            {metaBits.length > 0 && (
              <p className="smallcaps" style={{ color: 'var(--ink-mute)' }}>
                {metaBits.map((bit, i) => (
                  <span key={i}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    {bit}
                  </span>
                ))}
              </p>
            )}

            {works.length > 0 && (
              <p className="mt-2 text-sm">
                <a href="#works" className="inline-block py-1 hover:opacity-70 transition-opacity" style={{ color: 'var(--gold-ink)' }}>
                  {corpusLine(corpus)}
                </a>
              </p>
            )}

            <div className="mt-4 text-left">
              <EraStrip eras={eras} active={eraSlug} from="author-page" />
            </div>
          </div>
        </header>

        {/* ── Bio ──────────────────────────────────────────────────────────── */}
        {/* Hidden for draft authors — the bio is an unreviewed pipeline stub
            until Keith promotes the author from the admin edit form. On a phone a
            long bio is clamped to about four lines, with a CSS-only toggle so it
            works without JavaScript; from md it is shown whole, at the reading
            measure. */}
        {bio && (
          <div className={`author-bio mb-10 ${clampBio ? 'author-bio--clamp' : ''}`}>
            {clampBio && (
              <input type="checkbox" id="author-bio-more" className="author-bio-toggle sr-only" />
            )}
            <div className="author-bio-body">
              <MarkdownBody content={bio} numbered={false} />
            </div>
            {clampBio && (
              <label htmlFor="author-bio-more" className="author-bio-label md:hidden inline-block py-2 text-sm" style={{ color: 'var(--gold-ink)' }}>
                <span className="author-bio-more">Continue reading</span>
                <span className="author-bio-less">Show less</span>
              </label>
            )}
          </div>
        )}

        {/* ── Short reads ──────────────────────────────────────────────────── */}
        {/* A length fact, not an editor's choice, so never "Start here". */}
        {shorts.length > 0 && (
          <section className="mb-10" aria-labelledby="short-reads">
            <SectionTitle id="short-reads">Short reads</SectionTitle>
            <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
              {shorts.map(s => (
                <li key={s.id}>
                  <Link
                    href={`/texts/${s.slug}`}
                    className="flex items-baseline justify-between gap-4 py-3 group"
                    {...textOpen(s.slug, 'short-reads')}
                  >
                    <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                      {s.title}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--ink-faint)' }}>
                      {s.minutes} min
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Works ────────────────────────────────────────────────────────── */}
        {works.length > 0 && (
          <section id="works" className="mb-10" aria-labelledby="works-title">
            <SectionTitle id="works-title" aside={String(corpus.works)}>Works</SectionTitle>
            {groups.map(g => {
              const ornament = ornamentUrl(g.form)
              return (
                <div key={g.form ?? 'other'} className={showFormHeadings ? 'mb-6' : ''}>
                  {showFormHeadings && (
                    <h3 className="smallcaps flex items-center gap-2 mt-6 mb-1" style={{ color: 'var(--ink)' }}>
                      {ornament && (
                        <span
                          aria-hidden="true"
                          className="form-ornament shrink-0"
                          style={{
                            backgroundColor: 'var(--gold-ink)',
                            WebkitMaskImage: `url(${ornament})`,
                            maskImage: `url(${ornament})`,
                          }}
                        />
                      )}
                      {formHeading(g.form, g.works.length)}
                    </h3>
                  )}
                  <ul className="divide-y" style={{ borderColor: 'var(--rule-soft)' }}>
                    {g.works.map(renderWork)}
                  </ul>
                </div>
              )
            })}
          </section>
        )}

        {works.length === 0 && (
          <p className="text-sm mb-10" style={{ color: 'var(--ink-mute)' }}>No texts published yet.</p>
        )}

        {/* ── Kindred authors ──────────────────────────────────────────────── */}
        {/* After the works: a reader who came for this author meets their texts
            first, and the onward list is there when they are done. */}
        {relatedAuthors.length > 0 && (
          <section className="mb-10" aria-labelledby="kindred">
            <SectionTitle id="kindred" aside={tradition ?? undefined}>Kindred authors</SectionTitle>
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
                      data-umami-event-section="kindred"
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
          </section>
        )}

      </main>

      <TrackPageEvent
        event="author-page-view"
        data={{ author: slug, tradition: tradition ?? null }}
      />
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** A bio longer than this (about six lines at 390px) is clamped to four on a phone, so the clamp always hides something. */
const BIO_CLAMP_OVER_CHARS = 240

function SectionTitle({ id, aside, children }: { id: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id={id} className="font-serif italic text-base" style={{ color: 'var(--ink)' }}>
          {children}
        </h2>
        {aside && <span className="kicker">{aside}</span>}
      </div>
      <hr className="rule-gold" />
    </div>
  )
}

function WorkMeta({ lead, minutes, themes }: { lead?: string; minutes: number; themes: string[] }) {
  const bits = [lead, minutes > 0 ? formatDuration(minutes) : null].filter(Boolean)
  return (
    <div className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
      {bits.join(' · ')}
      {themes.length > 0 && (
        <span style={{ color: 'var(--ink-mute)' }}>
          {bits.length > 0 ? ' · ' : ''}
          {themes.join(' · ')}
        </span>
      )}
    </div>
  )
}
