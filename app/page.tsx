import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { THEME_CLUSTERS } from '@/lib/constants'
import SearchBar from './SearchBar'
import { BookCover } from './components/BookCover'
import { StackedCover } from './components/StackedCover'
import { SiteHeader } from './components/SiteHeader'
import { NocturneField } from './components/NocturneField'
import { ReadingHistorySection } from './components/ReadingHistorySection'
import { FeaturedAuthors } from './components/FeaturedAuthors'
import { SeasonalPanel } from './components/SeasonalPanel'
import { ChurchYearRow } from './components/ChurchYearRow'
import { resolveSeason } from '@/lib/liturgical/year'
import { readingMinutes } from '@/lib/reading-time'
import { ThemeChip } from './components/ThemeChip'
import { SectionHeader } from './components/SectionHeader'
import { MIN_WORDS, TEN_MINUTES, rankTenMinuteTexts, variedRow, type TenMinuteText } from '@/lib/ten-minutes'
import { feastKey, pickEditorial } from '@/lib/featured'
import { EditorNote } from './components/EditorNote'

// Incremental Static Regeneration: cache the rendered home page and revalidate
// hourly. Safe given the manual publish cadence — newly published texts appear
// within the window rather than requiring a redeploy.
/** How many short reads the homepage row holds: a full row at the widest grid. */
const SHORT_READS_ROW = 4

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

// The homepage lead paragraph, in order of preference.
//
// This used to fall back to an excerpt of the text's `body`, which meant the
// homepage selected all fifty recent bodies (~2.7 MB) on the off-chance that
// one of them had neither a summary nor an editorial introduction. Every
// published text has one or the other, so the body was never actually read —
// but 28 of 40 published collections have no `description`, so the fallback
// itself is live and could not simply be deleted. It now falls through to the
// representative text's own summary: editorial prose written for the purpose,
// and already in the query. See migration 028 for the wider change.
function leadParagraph(...candidates: (string | null | undefined)[]): string {
  return candidates.find(c => c && c.trim().length > 0)?.trim() ?? ''
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
  word_count: number | null
  summary: string | null
  editorial_introduction: string | null
  accession_number: number | null
  created_at: string
  collection_id: string | null
  collection: CollectionRef | null
  author: AuthorRef | null
  genre: { name: string } | null
  text_themes: { theme: { name: string; slug: string } | null }[]
  featured_from?: string | null
  featured_note?: string | null
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
export default async function Home() {
  const supabase = createPublicClient()

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
  // Guarded: the homepage's whole feed comes from this one query, so a failure
  // renders a library with nothing in it. See lib/supabase/query.ts.
  const recentRaw = orThrow(
    await supabase
      .from('texts')
      .select(`
      id, title, slug, word_count, summary, editorial_introduction,
      accession_number, created_at, collection_id,
      collection:collections(id, title, slug, description, published),
      author:authors(name, slug, death_year, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name, slug))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(50),
    'the homepage feed',
  )

  const allTexts = (recentRaw ?? []) as unknown as TextRow[]

  // ── Editorial pick — feast day, else the latest featured text ─────────
  // Optional furniture: unlike the feed above, a failure here must not take
  // the page down, so an error simply means no pick this render.
  const today = new Date()
  const pickSelect = `
      id, title, slug, word_count, summary, editorial_introduction,
      accession_number, created_at, collection_id, featured_from, featured_note,
      author:authors!inner(name, slug, death_year, feast_day_note, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name, slug))
    `
  const [featuredRes, feastRes] = await Promise.all([
    supabase.from('texts').select(pickSelect).eq('published', true).eq('featured', true)
      .order('featured_from', { ascending: false, nullsFirst: false }).limit(10),
    supabase.from('texts').select(pickSelect).eq('published', true)
      .eq('author.feast_day', feastKey(today)).order('created_at', { ascending: false }).limit(10),
  ])
  const editorialPick = featuredRes.error || feastRes.error
    ? null
    : pickEditorial({
        feastTexts: (feastRes.data ?? []) as unknown as (TextRow & { featured_from: string | null })[],
        featured: (featuredRes.data ?? []) as unknown as (TextRow & { featured_from: string | null })[],
        today,
      })

  // ── Short reads — the homepage row for /ten-minutes ───────────────────
  // Same rule as the page (lib/ten-minutes.ts), first row only. Optional
  // furniture: a failure here hides the row rather than taking the page down.
  const { data: shortRaw, error: shortError } = await supabase
    .from('texts')
    .select(`
      id, title, slug, word_count, summary, editorial_introduction, accession_number,
      author:authors(name, slug, death_year, tradition:traditions(slug)),
      genre:genres(name),
      text_themes(theme:themes(name, slug))
    `)
    .eq('published', true)
    .gte('word_count', MIN_WORDS)
    .lte('word_count', TEN_MINUTES * 200)
  const shortReads = shortError
    ? []
    : variedRow(
        rankTenMinuteTexts((shortRaw ?? []) as unknown as (TextRow & TenMinuteText)[]),
        SHORT_READS_ROW,
        t => t.author?.slug ?? t.author?.name,
      )

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
      <section className="celestial-hero celestial-hero--nocturne">
        <NocturneField />

        <div className="celestial-hero-content">
          <h1>The Stromata</h1>
          <p className="celestial-byline">A reading room for the works of the ages.</p>
          <p className="celestial-description">
            Public-domain Christian texts, edited for legibility
          </p>

          <SearchBar tone="celestial" />


          {authorChips.length > 0 && (
            <nav className="celestial-authors" aria-label="Recommended authors">
              <span className="celestial-authors-label">Start with</span>
              <span className="celestial-authors-rule" aria-hidden="true" />
              <span className="celestial-authors-links">
                {authorChips.map((author, index) => (
                  <span key={author.slug}>
                    <Link
                      href={`/authors/${author.slug}`}
                      data-umami-event="author-open"
                      data-umami-event-from="search-chip"
                      data-umami-event-author={author.name}
                    >
                      {author.name}
                    </Link>
                    {/* After the name, not before: a wrapped line then ends on a dot
                        rather than starting with one. */}
                    {index < authorChips.length - 1 && <span className="celestial-author-dot" aria-hidden="true">·</span>}
                  </span>
                ))}
              </span>
            </nav>
          )}
        </div>
      </section>

      {/* ── Seasonal panel ───────────────────────────────────────────────── */}
      <div className="pt-8">
        <SeasonalPanel season={season} />
      </div>

      {/* ── Church-year row ──────────────────────────────────────────────── */}
      <div className="pt-8">
        <ChurchYearRow currentSeason={season} />
      </div>

      {/* ── Reading history ──────────────────────────────────────────────── */}
      <ReadingHistorySection />

      {/* ── Editor's pick ────────────────────────────────────────────────── */}
      {/* Absent when nothing is featured and no feast falls today; the
          recency lead in "Recently added" then carries the top of the page. */}
      {editorialPick && (
        <section className="content-shell pt-10">
          <SectionHeader title={editorialPick.kind === 'feast' ? 'Kept today' : 'Editor\u2019s pick'} />
          <TextLead
            text={editorialPick.text}
            from="editorial-pick"
            kicker={editorialPick.kind === 'feast' ? 'On the author\u2019s feast' : 'Editor\u2019s pick'}
            note={editorialPick.text.featured_note}
          />
        </section>
      )}

      {/* ── Short reads ──────────────────────────────────────────────────── */}
      {/* One row of the texts /ten-minutes offers: two covers on phones, three,
          then four, matching the grid below. The full list is one click on. */}
      {shortReads.length > 0 && (
        <section className="content-shell pb-20">
          <SectionHeader
            title="Short reads"
            aside="Under 10 min · All →"
            asideHref="/ten-minutes"
            asideEvent={{ 'data-umami-event': 'ten-minutes-open', 'data-umami-event-from': 'short-reads' }}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 sm:gap-6">
            {shortReads.map((text, i) => (
              <div key={text.id} className={i === 2 ? 'hidden md:block' : i === 3 ? 'hidden lg:block' : undefined}>
                <ShortReadCard text={text} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recently added ───────────────────────────────────────────────── */}
      {feed.length > 0 && (
        <section className="content-shell pb-20">
          <SectionHeader
            title="Recently added"
            aside="All texts →"
            asideHref="/texts"
          />

          {/* ── Featured lead ── */}
          {leadEntry && <FeedLead entry={leadEntry} />}

          {/* ── Grid ── */}
          {gridEntries.length > 0 && (
            // Two per row on phones too: one full-width cover per row made this section
            // about a screen per book (26 Oct critique).
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 sm:gap-6">
              {gridEntries.map((entry, i) => (
                <FeedGridCard key={entry.kind === 'text' ? entry.text.id : entry.collection.id} entry={entry} index={i + 1} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Featured authors ─────────────────────────────────────────────── */}
      {/* After the texts, not before (4 Nov critique): the homepage's job is the
          next text, and authors are a way to browse, not the first thing to find. */}
      <FeaturedAuthors />

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
              <div className="flex flex-col items-start">
                {cluster.themes.map(theme => (
                  <ThemeChip key={theme.slug} href={`/themes/${theme.slug}`} name={theme.name} source="homepage" />
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
            <span style={{ flex: 1, height: 1, background: 'var(--gold-border)' }} />
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
            <span style={{ flex: 1, height: 1, background: 'var(--gold-border)' }} />
          </div>

          <div
            className="flex flex-col sm:flex-row justify-between gap-10 sm:gap-12"
            style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', lineHeight: 1.85 }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.08em', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif-smallcaps)', fontFeatureSettings: '"smcp" 1' }}>
                Stromata
              </div>
              {[{ label: 'About', href: '/about' }, { label: 'Colophon', href: '/colophon' }, { label: 'Authors', href: '/authors' }, { label: 'RSS feed', href: '/rss' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="inline-flex items-center min-h-[44px] transition-opacity hover:opacity-70" style={{ color: 'var(--on-dark-soft)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.08em', color: 'var(--gold)', opacity: 0.8, marginBottom: 8, fontFamily: 'var(--serif-smallcaps)', fontFeatureSettings: '"smcp" 1' }}>
                Read
              </div>
              {[{ label: 'Library', href: '/texts' }, { label: 'Search', href: '/search' }].map(({ label, href }) => (
                <div key={label}>
                  <Link href={href} className="inline-flex items-center min-h-[44px] transition-opacity hover:opacity-70" style={{ color: 'var(--on-dark-soft)', textDecoration: 'none' }}>{label}</Link>
                </div>
              ))}
            </div>
            <div style={{ fontStyle: 'italic', color: 'var(--on-dark-mute)', maxWidth: '44ch', lineHeight: 1.65, fontSize: 'var(--text-label)' }}>
              Public-domain texts, edited for legibility. Stromata has no investors and no advertising. If the texts here have been useful to you,{' '}
              <a href="https://ko-fi.com/stromata" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={{ color: 'var(--gold)', textDecoration: 'none' }} data-umami-event="ko-fi-click" data-umami-event-source="homepage">
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

function TextLead({
  text,
  from = 'recency-lead',
  kicker = 'New addition',
  note,
}: {
  text: TextRow
  /** The analytics `from` surface: 'recency-lead' (the newest text) or 'editorial-pick'. */
  from?: 'recency-lead' | 'editorial-pick'
  kicker?: string
  /** The editor's line, shown above the summary. */
  note?: string | null
}) {
  const author = text.author
  const themes = text.text_themes.map(tt => tt.theme).filter(Boolean) as { name: string; slug: string }[]
  const editorialPara = leadParagraph(text.summary, text.editorial_introduction)

  return (
    <div className="flex flex-col sm:flex-row gap-8 mb-14 pb-12" style={{ borderBottom: '1px solid var(--gold-rule)' }}>
      {/* Book cover — w-2/3 centered on mobile (matches grid cards), ~one grid column on desktop */}
      <div className="w-2/3 mx-auto sm:mx-0 sm:w-56 shrink-0">
        <Link href={`/texts/${text.slug}`} className="block" data-umami-event="text-open" data-umami-event-from={from} data-umami-event-text={text.slug}>
          <BookCover
            title={text.title}
            authorName={author?.name ?? null}
            deathYear={author?.death_year ?? null}
            accessionNumber={text.accession_number}
            traditionSlug={author?.tradition?.slug ?? null}
            genre={text.genre?.name ?? null}
            index={0}
          />
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <LeadKicker>{kicker}</LeadKicker>
        <Link href={`/texts/${text.slug}`} className="hover:opacity-70 transition-opacity" style={{ textDecoration: 'none' }} data-umami-event="text-open" data-umami-event-from={from} data-umami-event-text={text.slug}>
          <LeadTitle>{text.title}</LeadTitle>
        </Link>
        <LeadByline author={author} hasContent from={from} />
        {note && note.trim() && <EditorsLine note={note} />}
        <LeadPara>
          {truncateAtWord(editorialPara, 280)}
        </LeadPara>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/texts/${text.slug}`} style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', color: 'var(--gold-ink)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }} className="hover:opacity-70 transition-opacity" data-umami-event="text-open" data-umami-event-from={from} data-umami-event-text={text.slug}>
            Begin reading →
          </Link>
          <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', fontFamily: 'var(--serif)' }}>
            ~ {readingMinutes(text.word_count)} min
          </span>
        </div>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-x-1.5 mt-4">
            {themes.map(t => (
              <ThemeChip key={t.slug} href={`/themes/${t.slug}`} name={t.name} source={from} />
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
  const editorialPara = leadParagraph(collection.description, representative.summary, representative.editorial_introduction)
  const accessionDisplay = accessionRange ? `№ ${accessionRange.min}–${accessionRange.max}` : null

  return (
    <div className="flex flex-col sm:flex-row gap-8 mb-14 pb-12" style={{ borderBottom: '1px solid var(--gold-rule)' }}>
      {/* Book cover — w-2/3 centered on mobile (matches grid cards), ~one grid column on desktop */}
      <div className="w-2/3 mx-auto sm:mx-0 sm:w-56 shrink-0">
        <Link href={`/collections/${collection.slug}`} className="block" data-umami-event="collection-open" data-umami-event-from="recency-lead" data-umami-event-collection={collection.slug}>
          <StackedCover>
            <BookCover
              title={collection.title}
              authorName={author?.name ?? null}
              deathYear={author?.death_year ?? null}
              accessionNumber={null}
              accessionDisplay={accessionDisplay}
              traditionSlug={author?.tradition?.slug ?? null}
              genre={representative.genre?.name ?? null}
              index={0}
            />
          </StackedCover>
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <LeadKicker>New collection</LeadKicker>
        <Link href={`/collections/${collection.slug}`} className="hover:opacity-70 transition-opacity" style={{ textDecoration: 'none' }} data-umami-event="collection-open" data-umami-event-from="recency-lead" data-umami-event-collection={collection.slug}>
          <LeadTitle>{collection.title}</LeadTitle>
        </Link>
        <LeadByline author={author} hasContent />
        <LeadPara>
          {truncateAtWord(editorialPara, 280)}
        </LeadPara>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/collections/${collection.slug}`} style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', color: 'var(--gold-ink)', textDecoration: 'none', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }} className="hover:opacity-70 transition-opacity" data-umami-event="collection-open" data-umami-event-from="recency-lead" data-umami-event-collection={collection.slug}>
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
    <h3 className="font-serif italic" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)', marginBottom: '0.5rem' }}>
      {children}
    </h3>
  )
}

function LeadByline({ author, hasContent, from = 'recency-lead' }: { author: AuthorRef | null; hasContent: boolean; from?: string }) {
  if (!author) return null
  return (
    <p className="font-serif" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', marginBottom: hasContent ? '1rem' : '1.25rem' }}>
      {author.slug ? (
        <Link data-umami-event="author-open" data-umami-event-from={from} data-umami-event-author={author.name} href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
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

/** The editor's line: set apart and attributed, so it reads as a note to the reader and not as the summary. */
function EditorsLine({ note }: { note: string }) {
  return (
    <blockquote
      className="font-serif"
      style={{ margin: '0 0 1rem', paddingLeft: '1rem', borderLeft: '2px solid var(--gold-rule)' }}
    >
      <EditorNote note={note} style={{ fontSize: 'var(--text-prose)', lineHeight: 1.6, color: 'var(--ink)' }} />
      <footer style={{ fontSize: 'var(--text-label)', fontStyle: 'italic', color: 'var(--ink-mute)', marginTop: '0.5rem' }}>— the editor</footer>
    </blockquote>
  )
}

function LeadPara({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif" style={{ fontSize: 'var(--text-base)', lineHeight: 1.65, color: 'var(--ink-soft)', maxWidth: '52ch', marginBottom: '1.25rem' }}>
      {children}
    </p>
  )
}

/** A short read: the cover and its reading time, as in the grid below, without the chips. */
function ShortReadCard({ text, index }: { text: TextRow; index: number }) {
  const author = text.author
  return (
    <div className="w-full">
      <Link
        href={`/texts/${text.slug}`}
        className="group block"
        data-umami-event="text-open"
        data-umami-event-from="short-reads"
        data-umami-event-text={text.slug}
      >
        <BookCover
          title={text.title}
          authorName={author?.name ?? null}
          deathYear={author?.death_year ?? null}
          accessionNumber={text.accession_number}
          traditionSlug={author?.tradition?.slug ?? null}
          genre={text.genre?.name ?? null}
          index={index}
        />
      </Link>
      <div className="px-0.5 mt-3">
        <p className="caption">~ {readingMinutes(text.word_count)} min</p>
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
      <div className="w-full">
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
              genre={representative.genre?.name ?? null}
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
    <div className="w-full">
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
          genre={text.genre?.name ?? null}
          index={index}
        />
      </Link>
      <div className="px-0.5 mt-3">
        <p className="caption mb-2">~ {readingMinutes(text.word_count)} min</p>
        {/* Chips are hidden in the two-up phone grid: at half width they stacked one per line. */}
        {themes.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-x-1">
            {themes.map(t => (
              <ThemeChip key={t.slug} href={`/themes/${t.slug}`} name={t.name} source="homepage" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
