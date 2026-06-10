import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { THEME_CLUSTERS } from '@/lib/constants'
import SearchBar from './SearchBar'
import { BookCover } from './components/BookCover'
import { SiteHeader } from './components/SiteHeader'
import { ReadingHistorySection } from './components/ReadingHistorySection'
import { FeaturedAuthors } from './components/FeaturedAuthors'
import { SeasonalPanel } from './components/SeasonalPanel'
import { ChurchYearRow } from './components/ChurchYearRow'
import { readingTime } from '@/lib/reading-time'

// ── Types ──────────────────────────────────────────────────────────────────

type AuthorRef = {
  name: string
  slug: string | null
  death_year: number | null
  tradition: { slug: string } | null
}

type CollectionRef = {
  id: string
  title: string
  slug: string
  description: string | null
}

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  summary: string | null
  editorial_introduction: string | null
  accession_number: number | null
  created_at: string
  collection_id: string | null
  collection: CollectionRef | null
  author: AuthorRef | null
  genre: { name: string } | null
  text_themes: { theme: { name: string; slug: string } | null }[]
}

// A collapsed feed entry: either an individual text or the representative
// entry for an entire collection (showing only the newest text's metadata).
type AccessionRange = { min: number; max: number }

type FeedEntry =
  | { kind: 'text'; text: TextRow; created_at: string }
  | { kind: 'collection'; collection: CollectionRef; representative: TextRow; bookCount: number; accessionRange: AccessionRange | null; created_at: string }

// ── Markdown stripping for body excerpt fallback ───────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*>+\s?/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

function bodyExcerpt(body: string, wordCount = 40): string {
  const stripped = stripMarkdown(body)
  const parts = stripped.split(/\s+/).filter(Boolean)
  if (parts.length <= wordCount) return stripped
  return parts.slice(0, wordCount).join(' ') + '…'
}

export const metadata = {
  title: 'The Stromata — A reading room for the works of the ages',
}

// ── Curated author chips (validated against DB at render time) ─────────────
// Keep this list honest: if a slug doesn't resolve to a published author,
// it is silently omitted. Update when new canonical authors are added.
const CURATED_CHIPS: { display: string; slug: string }[] = [
  { display: 'Augustine',    slug: 'augustine-of-hippo' },
  { display: 'Basil',        slug: 'basil-the-great' },
  { display: 'Chrysostom',   slug: 'john-chrysostom' },
  { display: 'Jeremy Taylor', slug: 'jeremy-taylor' },
  { display: 'Anselm',       slug: 'anselm-of-canterbury' },
]

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({
  title,
  aside,
  asideHref,
}: {
  title: string
  aside?: string
  asideHref?: string
}) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        {aside && (
          asideHref ? (
            <Link
              href={asideHref}
              className="transition-opacity hover:opacity-70"
              style={{
                color: 'var(--ink-faint)',
                fontSize: '0.65rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontFamily: 'var(--serif)',
                textDecoration: 'none',
              }}
            >
              {aside}
            </Link>
          ) : (
            <span
              style={{
                color: 'var(--ink-faint)',
                fontSize: '0.65rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontFamily: 'var(--serif)',
              }}
            >
              {aside}
            </span>
          )
        )}
      </div>
      <hr style={{ borderColor: 'var(--gold-rule)', borderTopWidth: '1px' }} />
    </div>
  )
}

export default async function Home() {
  const supabase = createServerClient()

  // ── Author chips — DB-validated ────────────────────────────────────────
  const chipSlugs = CURATED_CHIPS.map(c => c.slug)
  const { data: chipAuthorsRaw } = await supabase
    .from('authors')
    .select('name, slug')
    .in('slug', chipSlugs)
    .not('slug', 'is', null)

  const existingSlugs = new Set((chipAuthorsRaw ?? []).map((a: { slug: string }) => a.slug))
  const authorChips = CURATED_CHIPS.filter(c => existingSlugs.has(c.slug))

  // ── Recently added — collection-collapsed ─────────────────────────────
  // Fetch a broad batch so collection grouping is accurate even for large
  // batch-ingested collections. Collections are represented by their most
  // recently added text (first occurrence in the desc-sorted list).
  const { data: recentRaw } = await supabase
    .from('texts')
    .select(`
      id, title, slug, body, summary, editorial_introduction,
      accession_number, created_at, collection_id,
      collection:collections(id, title, slug, description),
      author:authors(name, slug, death_year, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name, slug))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(50)

  const allTexts = (recentRaw ?? []) as unknown as TextRow[]

  // Tally per-collection: text count + accession number range (from batch)
  const collectionStats: Record<string, { count: number; minAcc: number | null; maxAcc: number | null }> = {}
  for (const t of allTexts) {
    if (t.collection_id) {
      const cur = collectionStats[t.collection_id]
      if (!cur) {
        collectionStats[t.collection_id] = { count: 1, minAcc: t.accession_number, maxAcc: t.accession_number }
      } else {
        cur.count++
        if (t.accession_number != null) {
          cur.minAcc = cur.minAcc == null ? t.accession_number : Math.min(cur.minAcc, t.accession_number)
          cur.maxAcc = cur.maxAcc == null ? t.accession_number : Math.max(cur.maxAcc, t.accession_number)
        }
      }
    }
  }

  // Build collapsed feed: one entry per collection (using the newest text as
  // representative), individual entry for standalone texts.
  const feed: FeedEntry[] = []
  const seenCollections = new Set<string>()

  for (const text of allTexts) {
    if (text.collection_id && text.collection) {
      if (!seenCollections.has(text.collection_id)) {
        seenCollections.add(text.collection_id)
        const stats = collectionStats[text.collection_id]
        const accessionRange: AccessionRange | null =
          stats?.minAcc != null && stats?.maxAcc != null && stats.minAcc !== stats.maxAcc
            ? { min: stats.minAcc, max: stats.maxAcc }
            : null
        feed.push({
          kind: 'collection',
          collection: text.collection,
          representative: text,
          bookCount: stats?.count ?? 1,
          accessionRange,
          created_at: text.created_at,
        })
      }
    } else {
      feed.push({ kind: 'text', text, created_at: text.created_at })
    }
    if (feed.length >= 9) break
  }

  const leadEntry = feed[0] ?? null
  const gridEntries = feed.slice(1, 9)

  return (
    <div className="page-vellum min-h-screen" style={{ paddingTop: '4rem' }}>

      <SiteHeader />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="text-center px-6 pt-16 pb-14">
        <h1
          className="mb-4"
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 400,
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
            color: 'var(--ink)',
          }}
        >
          The Stromata
        </h1>
        <p
          className="font-serif italic mb-10"
          style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)', color: 'var(--ink-soft)' }}
        >
          A reading room for the works of the ages.
        </p>

        {/* Subtitle in spaced small caps — above the search field */}
        <p
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            fontFamily: 'var(--serif)',
            marginBottom: '1.25rem',
          }}
        >
          A library of public-domain Christian texts, edited for legibility
        </p>

        <SearchBar />

        {/* Author chips — DB-validated, italic Cormorant with "Start with" label */}
        {authorChips.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 mt-6">
            {/* "Start with" label */}
            <span
              aria-hidden
              style={{
                fontSize: '0.58rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                fontFamily: 'var(--serif)',
                marginRight: '0.35rem',
              }}
            >
              Start with
            </span>

            {authorChips.map((author, i) => (
              <span key={author.slug} className="flex items-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    style={{
                      color: 'var(--gold-rule)',
                      margin: '0 0.4rem',
                      fontSize: '0.8rem',
                      userSelect: 'none',
                    }}
                  >
                    ·
                  </span>
                )}
                <Link
                  href={`/authors/${author.slug}`}
                  className="transition-opacity hover:opacity-70"
                  style={{
                    fontFamily: 'var(--serif-cormorant)',
                    fontStyle: 'italic',
                    fontSize: '1.05rem',
                    color: 'var(--ink-soft)',
                    textDecoration: 'none',
                  }}
                  data-umami-event="author-open"
                  data-umami-event-from="search-chip"
                  data-umami-event-author={author.display}
                >
                  {author.display}
                </Link>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Seasonal panel ───────────────────────────────────────────────── */}
      <SeasonalPanel />

      {/* ── Church-year row ──────────────────────────────────────────────── */}
      <div className="pt-8">
        <ChurchYearRow currentSeason="trinitytide" />
      </div>

      {/* ── Featured authors ─────────────────────────────────────────────── */}
      <div className="pt-6">
        <FeaturedAuthors />
      </div>

      {/* ── Reading history ──────────────────────────────────────────────── */}
      <ReadingHistorySection />

      {/* ── Recently added ───────────────────────────────────────────────── */}
      {feed.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <SectionHeader
            title="Recently added"
            aside="All texts →"
            asideHref="/texts"
          />

          {/* ── Featured lead ── */}
          {leadEntry && (
            <FeedLead entry={leadEntry} />
          )}

          {/* ── Grid ── */}
          {gridEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {gridEntries.map((entry, i) => (
                <FeedGridCard key={entry.kind === 'text' ? entry.text.id : entry.collection.id} entry={entry} index={i + 1} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Browse by theme ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <SectionHeader title="Browse by theme" aside="Five rooms of the library" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              <p
                className="font-serif mb-3"
                style={{ color: 'var(--ink)', fontSize: '0.9rem' }}
              >
                {cluster.cluster}
              </p>
              <div className="flex flex-col gap-1.5 items-start">
                {cluster.themes.map(theme => (
                  <Link
                    key={theme.slug}
                    href={`/themes/${theme.slug}`}
                    className="inline-flex items-center transition-opacity hover:opacity-70"
                    style={{
                      color: 'var(--ink-mute)',
                      border: '1px solid var(--rule)',
                      background: 'transparent',
                      fontFamily: 'var(--serif)',
                      fontSize: '0.72rem',
                      letterSpacing: '0.1rem',
                      textTransform: 'uppercase',
                      padding: '3px 10px',
                      textDecoration: 'none',
                    }}
                    data-umami-event="theme-click"
                    data-umami-event-theme={theme.name}
                    data-umami-event-source="homepage"
                  >
                    {theme.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Dark footer ──────────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--dark)' }}>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: '3rem',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'rgba(201,148,58,0.3)' }} />
            <span
              style={{
                fontFamily: 'var(--serif-display)',
                fontSize: '1.375rem',
                color: 'var(--gold)',
                opacity: 0.7,
                lineHeight: 1,
              }}
            >
              §
            </span>
            <span style={{ flex: 1, height: 1, background: 'rgba(201,148,58,0.3)' }} />
          </div>

          <div
            className="flex flex-col sm:flex-row justify-between gap-10 sm:gap-12"
            style={{ fontFamily: 'var(--serif)', fontSize: '0.875rem', lineHeight: 1.85 }}
          >
            <div>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif)' }}>
                Stromata
              </div>
              {[{ label: 'About', href: '/about' }, { label: 'Authors', href: '/authors' }, { label: 'RSS feed', href: '/rss' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="transition-opacity hover:opacity-70" style={{ color: 'rgba(245,240,230,0.65)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif)' }}>
                Read
              </div>
              {[{ label: 'Library', href: '/texts' }, { label: 'Search', href: '/search' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="transition-opacity hover:opacity-70" style={{ color: 'rgba(245,240,230,0.65)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div style={{ fontStyle: 'italic', color: 'rgba(245,240,230,0.5)', maxWidth: '44ch', lineHeight: 1.65, fontSize: '0.875rem' }}>
              Public-domain texts, edited for legibility. Stromata has no investors and no advertising. If the texts here have been useful to you,{' '}
              <a href="https://ko-fi.com/stromata" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={{ color: 'rgba(201,148,58,0.85)', textDecoration: 'none' }} data-umami-event="ko-fi-click" data-umami-event-source="homepage">
                a small contribution helps keep the lights on →
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}

// ── Feed sub-components ────────────────────────────────────────────────────
// Extracted to keep the Home function readable. These are plain functions
// (not async, no hooks) so they inline cleanly into the server component.

function FeedLead({ entry }: { entry: FeedEntry }) {
  if (entry.kind === 'collection') {
    return <CollectionLead entry={entry} />
  }
  return <TextLead text={entry.text} />
}

function TextLead({ text }: { text: TextRow }) {
  const author = text.author
  const themes = text.text_themes.map(tt => tt.theme).filter(Boolean) as { name: string; slug: string }[]
  // Always show a paragraph: summary → editorial intro → body excerpt fallback
  const editorialPara = text.summary ?? text.editorial_introduction ?? bodyExcerpt(text.body)

  return (
    <div
      className="flex flex-col sm:flex-row gap-8 mb-14 pb-12"
      style={{ borderBottom: '1px solid var(--gold-rule)' }}
    >
      <div className="shrink-0" style={{ width: 'clamp(120px, 25vw, 200px)' }}>
        <Link
          href={`/texts/${text.slug}`}
          className="block"
          data-umami-event="text-open"
          data-umami-event-from="featured-lead"
          data-umami-event-text={text.title}
        >
          <BookCover
            title={text.title}
            authorName={author?.name ?? null}
            deathYear={author?.death_year ?? null}
            accessionNumber={text.accession_number}
            traditionSlug={author?.tradition?.slug ?? null}
            index={0}
          />
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <LeadKicker>New addition</LeadKicker>

        <Link
          href={`/texts/${text.slug}`}
          className="hover:opacity-70 transition-opacity"
          style={{ textDecoration: 'none' }}
          data-umami-event="text-open"
          data-umami-event-from="featured-lead"
          data-umami-event-text={text.title}
        >
          <LeadTitle>{text.title}</LeadTitle>
        </Link>

        <LeadByline author={author} hasContent />

        <LeadPara>
          {editorialPara.length > 280 ? editorialPara.slice(0, 280).trimEnd() + '…' : editorialPara}
        </LeadPara>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/texts/${text.slug}`}
            style={{ fontFamily: 'var(--serif)', fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }}
            className="hover:opacity-70 transition-opacity"
            data-umami-event="text-open"
            data-umami-event-from="featured-lead"
            data-umami-event-text={text.title}
          >
            Begin reading →
          </Link>
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.7rem', fontFamily: 'var(--serif)' }}>
            ~ {readingTime(text.body)} min
          </span>
        </div>

        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {themes.map(t => (
              <Link key={t.slug} href={`/themes/${t.slug}`} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px', textDecoration: 'none' }} data-umami-event="theme-click" data-umami-event-theme={t.name} data-umami-event-source="featured-lead">
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CollectionLead({ entry }: { entry: Extract<FeedEntry, { kind: 'collection' }> }) {
  const { collection, representative, bookCount, accessionRange } = entry
  const author = representative.author
  // Always show a paragraph: collection description → representative text excerpt
  const editorialPara = collection.description
    ?? bodyExcerpt(representative.body)
  const accessionDisplay = accessionRange
    ? `№ ${accessionRange.min}–${accessionRange.max}`
    : null

  return (
    <div
      className="flex flex-col sm:flex-row gap-8 mb-14 pb-12"
      style={{ borderBottom: '1px solid var(--gold-rule)' }}
    >
      {/* Cover with stacked spine affordance */}
      <div className="shrink-0" style={{ width: 'clamp(120px, 25vw, 200px)' }}>
        <Link
          href={`/collections/${collection.slug}`}
          className="block"
          data-umami-event="text-open"
          data-umami-event-from="featured-lead"
          data-umami-event-text={collection.title}
        >
          <StackedCover>
            <BookCover
              title={collection.title}
              authorName={author?.name ?? null}
              deathYear={author?.death_year ?? null}
              accessionNumber={null}
              accessionDisplay={accessionDisplay}
              traditionSlug={author?.tradition?.slug ?? null}
              index={0}
            />
          </StackedCover>
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <LeadKicker>New collection</LeadKicker>

        <Link
          href={`/collections/${collection.slug}`}
          className="hover:opacity-70 transition-opacity"
          style={{ textDecoration: 'none' }}
          data-umami-event="text-open"
          data-umami-event-from="featured-lead"
          data-umami-event-text={collection.title}
        >
          <LeadTitle>{collection.title}</LeadTitle>
        </Link>

        <LeadByline author={author} hasContent />

        <LeadPara>
          {editorialPara.length > 280 ? editorialPara.slice(0, 280).trimEnd() + '…' : editorialPara}
        </LeadPara>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/collections/${collection.slug}`}
            style={{ fontFamily: 'var(--serif)', fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }}
            className="hover:opacity-70 transition-opacity"
            data-umami-event="text-open"
            data-umami-event-from="featured-lead"
            data-umami-event-text={collection.title}
          >
            Browse collection →
          </Link>
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.7rem', fontFamily: 'var(--serif)' }}>
            {bookCount} {bookCount === 1 ? 'book' : 'books'}
          </span>
        </div>
      </div>
    </div>
  )
}

function FeedGridCard({ entry, index }: { entry: FeedEntry; index: number }) {
  if (entry.kind === 'collection') {
    const { collection, representative, bookCount, accessionRange } = entry
    const author = representative.author
    const accessionDisplay = accessionRange
      ? `№ ${accessionRange.min}–${accessionRange.max}`
      : null
    return (
      <div className="w-2/3 mx-auto sm:w-full">
        <Link
          href={`/collections/${collection.slug}`}
          className="group block"
          data-umami-event="text-open"
          data-umami-event-text={collection.slug}
        >
          <StackedCover>
            <BookCover
              title={collection.title}
              authorName={author?.name ?? null}
              deathYear={author?.death_year ?? null}
              accessionNumber={null}
              accessionDisplay={accessionDisplay}
              traditionSlug={author?.tradition?.slug ?? null}
              index={index}
            />
          </StackedCover>
        </Link>
        <div className="px-0.5 mt-3">
          <p style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
            {bookCount} {bookCount === 1 ? 'book' : 'books'}
          </p>
        </div>
      </div>
    )
  }

  const { text } = entry
  const author = text.author
  const themes = text.text_themes.map(tt => tt.theme).filter(Boolean) as { name: string; slug: string }[]

  return (
    <div className="w-2/3 mx-auto sm:w-full">
      <Link
        href={`/texts/${text.slug}`}
        className="group block"
        data-umami-event="text-open"
        data-umami-event-text={text.slug}
      >
        <BookCover
          title={text.title}
          authorName={author?.name ?? null}
          deathYear={author?.death_year ?? null}
          accessionNumber={text.accession_number}
          traditionSlug={author?.tradition?.slug ?? null}
          index={index}
        />
      </Link>
      <div className="px-0.5 mt-3">
        <p className="mb-2" style={{ color: 'var(--ink-mute)', fontFamily: 'var(--serif)', fontSize: '0.8rem', letterSpacing: '0.12em' }}>
          ~ {readingTime(text.body)} min
        </p>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {themes.map(t => (
              <Link key={t.slug} href={`/themes/${t.slug}`} className="px-2 py-0.5 hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)', border: '1px solid var(--rule)', fontFamily: 'var(--serif)', fontSize: '0.625rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }} data-umami-event="theme-click" data-umami-event-theme={t.name} data-umami-event-source="homepage">
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lead shared primitives ─────────────────────────────────────────────────

function LeadKicker({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--serif)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.75rem' }}>
      {children}
    </p>
  )
}

function LeadTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: 'var(--serif-cormorant)', fontStyle: 'italic', fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)', marginBottom: '0.5rem' }}>
      {children}
    </h3>
  )
}

function LeadByline({ author, hasContent }: { author: AuthorRef | null; hasContent: boolean }) {
  if (!author) return null
  return (
    <p style={{ fontFamily: 'var(--serif)', fontSize: '0.9rem', color: 'var(--ink-mute)', marginBottom: hasContent ? '1rem' : '1.25rem', fontStyle: 'italic' }}>
      {author.slug ? (
        <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)', textDecoration: 'none' }}>
          {author.name}
        </Link>
      ) : author.name}
      {author.death_year && (
        <span style={{ color: 'var(--ink-faint)' }}>
          {' '}· {author.death_year < 600 ? `c. ${author.death_year}` : `d. ${author.death_year}`}
        </span>
      )}
    </p>
  )
}

function LeadPara({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--serif)', fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--ink-soft)', maxWidth: '52ch', marginBottom: '1.25rem' }}>
      {children}
    </p>
  )
}

// ── StackedCover — multi-volume depth affordance ───────────────────────────
// Adds 2 subtle offset layers behind a BookCover to signal "collection".
//
// Paint-order note: `position:absolute` elements with z-index:auto are painted
// in step 5 of the stacking algorithm — AFTER in-flow block content (step 3).
// So without explicit z-index the spine layers would appear ON TOP of the cover.
// Fix: the cover is wrapped in position:relative + z-index:1, which enters the
// positioned-elements paint step with a higher z-index than the auto spine divs.
//
// The container reserves space for the offsets via marginRight/Bottom so the
// stacking doesn't clip the cover or disturb grid alignment.
function StackedCover({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', marginRight: 8, marginBottom: 5 }}>
      {/* Spine layer 2 — furthest back (z-index:auto = 0) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 5,
          left: 8,
          background: 'rgba(10, 8, 5, 0.50)',
        }}
      />
      {/* Spine layer 1 — middle (z-index:auto = 0) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 2.5,
          left: 4,
          background: 'rgba(10, 8, 5, 0.28)',
        }}
      />
      {/* Cover — z-index:1 lifts it above the auto spine layers */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
