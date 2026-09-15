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
import { resolveSeason } from '@/lib/liturgical/year'
import { readingTime } from '@/lib/reading-time'
import { ThemeChip } from './components/ThemeChip'

// Incremental Static Regeneration: cache the rendered home page and revalidate
// hourly. Safe given the manual publish cadence — newly published texts appear
// within the window rather than requiring a redeploy.
export const revalidate = 3600

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
  published: boolean
}

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

/** Truncate at the last whole word before `max` chars — never cuts mid-word. */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const truncated = text.slice(0, max)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd() + '…'
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


export const metadata = {
  title: 'The Stromata — A reading room for the works of the ages',
  alternates: { canonical: '/' },
}


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
            <Link href={asideHref} className="kicker transition-opacity hover:opacity-70" style={{ textDecoration: 'none' }}>
              {aside}
            </Link>
          ) : (
            <span className="kicker">{aside}</span>
          )
        )}
      </div>
      <hr className="rule-gold" />
    </div>
  )
}

export default async function Home() {
  const supabase = createServerClient()

  // The church year, resolved once and handed to both surfaces that show it,
  // so the panel and the church-year row can never disagree. Note the page is
  // ISR-cached (revalidate above), so a season turns over within that window
  // rather than at midnight exactly — acceptable for a season, and the reason
  // this is resolved per render rather than baked at build.
  const season = resolveSeason().season

  // ── Author chips — top 5 authors by published text count ─────────────
  const { data: chipTextsRaw } = await supabase
    .from('texts')
    .select('author_id, author:authors(name, slug)')
    .eq('published', true)
    .not('author_id', 'is', null)

  type ChipTextRow = { author_id: string; author: { name: string; slug: string } | null }
  const chipCountMap = new Map<string, { name: string; slug: string; count: number }>()
  for (const t of (chipTextsRaw ?? []) as unknown as ChipTextRow[]) {
    if (!t.author?.slug) continue
    const entry = chipCountMap.get(t.author.slug)
    if (entry) { entry.count++ } else { chipCountMap.set(t.author.slug, { name: t.author.name, slug: t.author.slug, count: 1 }) }
  }
  const authorChips = Array.from(chipCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ── Recently added — collection-collapsed ─────────────────────────────
  // Fetch a broad batch so collection grouping is accurate even for large
  // batch-ingested collections. Collections are represented by their most
  // recently added text (first occurrence in the desc-sorted list).
  const { data: recentRaw } = await supabase
    .from('texts')
    .select(`
      id, title, slug, body, summary, editorial_introduction,
      accession_number, created_at, collection_id,
      collection:collections(id, title, slug, description, published),
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
    // Only collapse into a collection card when the collection itself is
    // published — the collection page 404s unpublished slugs, so linking to
    // one produces a dead card. An unpublished collection's published texts
    // fall through and render as standalone text entries instead.
    if (text.collection_id && text.collection && text.collection.published) {
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

      <main id="main-content">
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

        {/* Subtitle — kicker style, above the search field */}
        <p className="kicker" style={{ marginBottom: '1.25rem' }}>
          A library of public-domain Christian texts, edited for legibility
        </p>

        <SearchBar />

        {/* Author chips — top authors by text count */}
        {authorChips.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-6">
            <span aria-hidden className="kicker" style={{ marginRight: '0.35rem' }}>
              Start with
            </span>
            <span aria-hidden style={{ color: 'var(--gold)', fontSize: 'var(--text-sm)', userSelect: 'none' }}>—</span>

            {authorChips.map((author, i) => (
              <span key={author.slug} className="flex items-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    style={{
                      color: 'var(--gold-rule)',
                      margin: '0 0.4rem',
                      fontSize: 'var(--text-sm)',
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
                    fontSize: 'var(--text-base)',
                    color: 'var(--ink-soft)',
                    textDecoration: 'none',
                  }}
                  data-umami-event="author-open"
                  data-umami-event-from="search-chip"
                  data-umami-event-author={author.name}
                >
                  {author.name}
                </Link>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Seasonal panel ───────────────────────────────────────────────── */}
      <SeasonalPanel season={season} />

      {/* ── Church-year row ──────────────────────────────────────────────── */}
      <div className="pt-8">
        <ChurchYearRow currentSeason={season} />
      </div>

      {/* ── Featured authors ─────────────────────────────────────────────── */}
      <div className="pt-6">
        <FeaturedAuthors />
      </div>

      {/* ── Reading history ──────────────────────────────────────────────── */}
      <ReadingHistorySection />

      {/* ── Recently added ───────────────────────────────────────────────── */}
      {feed.length > 0 && (
        <section className="content-shell pb-24">
          <SectionHeader
            title="Recently added"
            aside="All texts →"
            asideHref="/texts"
          />

          {/* ── Featured lead ── */}
          {leadEntry && <FeedLead entry={leadEntry} />}

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
      <section className="content-shell pb-20">
        <SectionHeader title="Browse by theme" aside="Five rooms of the library" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              <p
                className="font-serif mb-3"
                style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}
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
                      fontSize: 'var(--text-sm)',
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
      </main>

      {/* ── Dark footer ──────────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--dark)' }}>
        <div className="content-shell py-16">
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
            style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', lineHeight: 1.85 }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif)' }}>
                Stromata
              </div>
              {[{ label: 'About', href: '/about' }, { label: 'Authors', href: '/authors' }, { label: 'RSS feed', href: '/rss' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="transition-opacity hover:opacity-70" style={{ color: 'rgba(245,240,230,0.65)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif)' }}>
                Read
              </div>
              {[{ label: 'Library', href: '/texts' }, { label: 'Search', href: '/search' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="transition-opacity hover:opacity-70" style={{ color: 'rgba(245,240,230,0.65)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div style={{ fontStyle: 'italic', color: 'rgba(245,240,230,0.5)', maxWidth: '44ch', lineHeight: 1.65, fontSize: 'var(--text-label)' }}>
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

function FeedLead({ entry }: { entry: FeedEntry }) {
  if (entry.kind === 'collection') return <CollectionLead entry={entry} />
  return <TextLead text={entry.text} />
}

function TextLead({ text }: { text: TextRow }) {
  const author = text.author
  const themes = text.text_themes.map(tt => tt.theme).filter(Boolean) as { name: string; slug: string }[]
  const editorialPara = text.summary ?? text.editorial_introduction ?? bodyExcerpt(text.body)

  return (
    <div className="flex flex-col sm:flex-row gap-8 mb-14 pb-12" style={{ borderBottom: '1px solid var(--gold-rule)' }}>
      {/* Book cover — w-2/3 centered on mobile (matches grid cards), ~one grid column on desktop */}
      <div className="w-2/3 mx-auto sm:mx-0 sm:w-56 shrink-0">
        <Link href={`/texts/${text.slug}`} className="block" data-umami-event="text-open" data-umami-event-from="featured-lead" data-umami-event-text={text.slug}>
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
        <Link href={`/texts/${text.slug}`} className="hover:opacity-70 transition-opacity" style={{ textDecoration: 'none' }} data-umami-event="text-open" data-umami-event-from="featured-lead" data-umami-event-text={text.slug}>
          <LeadTitle>{text.title}</LeadTitle>
        </Link>
        <LeadByline author={author} hasContent />
        <LeadPara>
          {truncateAtWord(editorialPara, 280)}
        </LeadPara>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/texts/${text.slug}`} style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', color: 'var(--gold-ink)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }} className="hover:opacity-70 transition-opacity" data-umami-event="text-open" data-umami-event-from="featured-lead" data-umami-event-text={text.slug}>
            Begin reading →
          </Link>
          <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', fontFamily: 'var(--serif)' }}>
            ~ {readingTime(text.body)} min
          </span>
        </div>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {themes.map(t => (
              <ThemeChip key={t.slug} href={`/themes/${t.slug}`} name={t.name} source="featured-lead" />
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
  const editorialPara = collection.description ?? bodyExcerpt(representative.body)
  const accessionDisplay = accessionRange ? `№ ${accessionRange.min}–${accessionRange.max}` : null

  return (
    <div className="flex flex-col sm:flex-row gap-8 mb-14 pb-12" style={{ borderBottom: '1px solid var(--gold-rule)' }}>
      {/* Book cover — w-2/3 centered on mobile (matches grid cards), ~one grid column on desktop */}
      <div className="w-2/3 mx-auto sm:mx-0 sm:w-56 shrink-0">
        <Link href={`/collections/${collection.slug}`} className="block" data-umami-event="collection-open" data-umami-event-from="featured-lead" data-umami-event-collection={collection.slug}>
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
        <Link href={`/collections/${collection.slug}`} className="hover:opacity-70 transition-opacity" style={{ textDecoration: 'none' }} data-umami-event="collection-open" data-umami-event-from="featured-lead" data-umami-event-collection={collection.slug}>
          <LeadTitle>{collection.title}</LeadTitle>
        </Link>
        <LeadByline author={author} hasContent />
        <LeadPara>
          {truncateAtWord(editorialPara, 280)}
        </LeadPara>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/collections/${collection.slug}`} style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', color: 'var(--gold-ink)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }} className="hover:opacity-70 transition-opacity" data-umami-event="collection-open" data-umami-event-from="featured-lead" data-umami-event-collection={collection.slug}>
            Browse collection →
          </Link>
          <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', fontFamily: 'var(--serif)' }}>
            {bookCount} {bookCount === 1 ? 'book' : 'books'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Lead shared primitives ─────────────────────────────────────────────────

function LeadKicker({ children }: { children: React.ReactNode }) {
  return <p className="kicker-gold" style={{ marginBottom: '0.75rem' }}>{children}</p>
}

function LeadTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-cormorant italic" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)', marginBottom: '0.5rem' }}>
      {children}
    </h3>
  )
}

function LeadByline({ author, hasContent }: { author: AuthorRef | null; hasContent: boolean }) {
  if (!author) return null
  return (
    <p className="font-serif" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', marginBottom: hasContent ? '1rem' : '1.25rem' }}>
      {author.slug ? (
        <Link data-umami-event="author-open" data-umami-event-from="featured-lead" data-umami-event-author={author.name} href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
          {author.name}
        </Link>
      ) : author.name}
      {author.death_year && (
        <span style={{ color: 'var(--ink-mute)' }}>
          {' '}· {author.death_year < 600 ? `c. ${author.death_year}` : `d. ${author.death_year}`}
        </span>
      )}
    </p>
  )
}

function LeadPara({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif" style={{ fontSize: 'var(--text-base)', lineHeight: 1.65, color: 'var(--ink-soft)', maxWidth: '52ch', marginBottom: '1.25rem' }}>
      {children}
    </p>
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
          data-umami-event="collection-open"
          data-umami-event-from="homepage-grid"
          data-umami-event-collection={collection.slug}
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
          <p className="caption">{bookCount} {bookCount === 1 ? 'book' : 'books'}</p>
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
        data-umami-event-from="homepage-grid"
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
        <p className="caption mb-2">~ {readingTime(text.body)} min</p>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {themes.map(t => (
              <ThemeChip key={t.slug} href={`/themes/${t.slug}`} name={t.name} source="homepage" />
            ))}
          </div>
        )}
      </div>
    </div>
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
