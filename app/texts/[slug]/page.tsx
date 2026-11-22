import Link from 'next/link'
import { EditorNote } from '@/app/components/EditorNote'
import { notFound } from 'next/navigation'
import { textPageFallbackDescription, textPageTitle } from '@/lib/text-title'
import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import MarkdownBody from '@/app/components/MarkdownBody'
import { SiteHeader } from '@/app/components/SiteHeader'
import { RecordVisit } from '@/app/components/RecordVisit'
import { ReadingProgressBar } from '@/app/components/ReadingProgressBar'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { TrackTextSessionDepth } from '@/app/components/TrackTextSessionDepth'
import TableOfContents from '@/app/components/TableOfContents'
import { readingTime } from '@/lib/reading-time'
import { extractHeadings } from '@/lib/headings'
import { OG_IMAGE, SITE_URL } from '@/lib/metadata'
import { JsonLd } from '@/app/components/JsonLd'
import { ThemeChip } from '@/app/components/ThemeChip'
import { BookCover } from '@/app/components/BookCover'
import { AuthorAside } from '@/app/components/AuthorAside'
import { DownloadLinks } from '@/app/components/DownloadLinks'
import { COLOPHON } from '@/lib/downloads'
import { ReaderSettings } from '@/app/components/ReaderSettings'
import { CitationButton } from '@/app/components/CitationButton'
import { resolveLicense } from '@/lib/licenses'
import { PROVENANCE_INLINE_MAX, hostLabel, isBareUrl } from '@/lib/edition'
import { ContinueExploring } from '@/app/components/ContinueExploring'
import { pickReadNext, type ReadNextCandidate } from '@/lib/read-next'
import { ReaderNav, ReaderNavTrigger } from '@/app/components/ReaderNav'
import { buildOutline, readSections, showsRunningHead, type SectionsDoc } from '@/lib/reader/outline'
import { locateSections } from '@/lib/markdown/section-anchors'

// Incremental Static Regeneration: cache the rendered page and revalidate
// weekly (hourly until 2026-09-29, daily until 2026-10-04 — Vercel Hobby CPU). Safe given the manual
// publish cadence: publishing and every admin save revalidate the affected paths
// straight away (publish-text.ts), so the window is only the safety net for an
// edit made outside the admin app.
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

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('texts')
    .select('title, summary, author:authors(name)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!data) return { title: 'Text — The Stromata' }

  const author = (data.author as unknown as { name: string } | null)?.name
  // "Author — Title | The Stromata", or "Title | The Stromata" when the author is
  // a placeholder ("Unknown (Early Church)"): lib/text-title.ts.
  const title = textPageTitle(data.title, author)

  // Description is unconditional: prefer the editorial summary, else a sensible
  // fallback so every text page carries a description and per-page OG/Twitter cards.
  // `||` (not `??`) so an empty-string summary also falls back to the template.
  const description = (data.summary as string | null) || textPageFallbackDescription(data.title, author)
  const canonical = `/texts/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

export default async function TextPage({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicClient()

  // `.maybeSingle()` + orThrow. `.single()` reports zero rows as an error,
  // which a guard would turn into a 500 for a slug that simply does not
  // exist; and an unguarded read turns a Supabase outage into a 404 on
  // every text on the site. See lib/supabase/query.ts.
  const text = orThrow(
    await supabase
      .from('texts')
      // The anon-granted columns spelled out, not `*`. Anon holds a column-level
      // grant on `texts`
      // (026), and PostgREST refuses the WHOLE request when select=* expands to
      // include an unreadable column — so `*` here returned no row and this page
      // answered 404 for every text on the site.
      //
      // Spelled out rather than interpolated from PUBLIC_TEXT_COLUMNS because
      // supabase-js parses the select string at the TYPE level and needs a
      // literal; a template substitution makes it a ParserError and every field
      // on the row becomes untyped. lib/supabase/public-columns.ts holds the
      // canonical list and the reasoning, and its test reads this file back to
      // check the two have not drifted.
      .select(`
        accession_number, author_id, body, collection_id, collection_order,
        created_at, editorial_introduction, featured, featured_from, featured_note,
        genre_id, id, license, ocr_quality, provenance_notes, published, published_at,
        read_next_note, read_next_text_id, sections, slug, source_attribution, source_url, summary, title, translation_notes,
        updated_at, word_count,
        author:authors(name, slug, bio, birth_year, death_year, image_url, image_focus_x, image_focus_y, image_zoom, loc:locations(name, slug), tradition:traditions(slug, name), era:eras(label, slug)),
        genre:genres(name),
        text_themes(theme:themes(name, slug)),
        collection:collections(id, title, slug, published)
      `)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle(),
    'the reader page',
  )

  if (!text) notFound()

  // author and genre are many-to-one → plain objects at runtime. The casts go
  // through `unknown` because the select is now a literal column list, so
  // supabase-js infers the embeds structurally (as arrays) where `*` left the
  // whole row loose and the direct casts compiled. The runtime shape is
  // unchanged — PostgREST returns an object for a to-one embed — so these
  // assert exactly what they asserted before.
  const author = text.author as unknown as {
    name: string
    slug: string | null
    bio: string | null
    birth_year: number | null
    death_year: number | null
    image_url: string | null
    image_focus_x: number | null
    image_focus_y: number | null
    image_zoom: number | null
    loc: { name: string; slug: string } | null
    tradition: { slug: string; name: string } | null
    era: { label: string; slug: string } | null
  } | null
  const genre = text.genre as unknown as { name: string } | null
  // Treat an unpublished collection as no collection at all — the collection
  // page 404s unpublished slugs, so its breadcrumb / return links would be
  // dead. A published text under an unpublished collection reads as standalone.
  const collectionRaw = text.collection as unknown as { id: string; title: string; slug: string; published: boolean } | null
  const collection = collectionRaw?.published ? collectionRaw : null

  // text_themes is one-to-many → array; theme within it is many-to-one → object
  const themes = (text.text_themes as unknown as { theme: { name: string; slug: string } | null }[])
    .map(tt => tt.theme)
    .filter(Boolean) as { name: string; slug: string }[]

  const body = text.body as string
  const summary = text.summary as string | null
  const featuredNote = (text.featured_note as string | null)?.trim() || null
  const editorialIntro = text.editorial_introduction as string | null

  // Era label without the parenthetical span, e.g. "Nicene & Post-Nicene".
  const eraName = author?.era?.label?.replace(/\s*\(.*?\)/, '') ?? null

  // Frontispiece kicker: the accession label, e.g. "STROMATA № 65". Falls back
  // to the author name when a text has no accession number yet.
  const heroKicker = text.accession_number
    ? `Stromata № ${String(text.accession_number).padStart(2, '0')}`
    : author?.name ?? null

  // Extract headings for the TOC sidebar. Only show TOC if 3+ headings exist —
  // short letters and prayers are flowing prose with no meaningful structure to navigate.
  const headings = extractHeadings(body)
  const hasToc = headings.length >= 3

  // The phone reader's contents: the author's headings when there are enough,
  // else the editor's approved sections (migration 034), located in the body
  // by the same matcher the review page uses. See lib/reader/outline.ts.
  const sectionList = hasToc ? [] : readSections(text.sections as SectionsDoc)
  const locatedSections = locateSections(body, sectionList)
  const outline = buildOutline(headings, locatedSections, locatedSections.map((_, i) => i))
  const minutes = readingTime(body)

  // If this text belongs to a collection, fetch siblings for prev/next navigation
  // and for the frontispiece's "Part N of M" position marker.
  type Sibling = { id: string; title: string; slug: string; collection_order: number | null; author: { name: string } | null }
  let prevText: Sibling | null = null
  let nextText: Sibling | null = null
  let collectionPart: number | null = null
  let collectionTotal: number | null = null

  if (collection && text.collection_id) {
    const { data: siblings } = await supabase
      .from('texts')
      .select('id, title, slug, collection_order, author:authors(name)')
      .eq('collection_id', text.collection_id)
      .eq('published', true)
      .order('collection_order', { ascending: true, nullsFirst: false })
      .order('title')

    if (siblings) {
      const rows = siblings as unknown as Sibling[]
      const idx = rows.findIndex(s => s.id === text.id)
      if (idx > 0) prevText = rows[idx - 1]
      if (idx < rows.length - 1) nextText = rows[idx + 1]
      if (idx >= 0 && rows.length > 1) {
        collectionPart = idx + 1
        collectionTotal = rows.length
      }
    }
  }

  // ── Continue exploring — candidate pools for lib/read-next.ts ───────────────
  // Metadata only (never `body`); each pool is capped. Three small reads,
  // regenerated with the page, so the module costs nothing per view.
  const CAND = 'id, title, slug, word_count, collection_id, author_id, accession_number, author:authors(name, death_year, tradition:traditions(slug)), genre:genres(name)'
  type CandRow = {
    id: string; title: string; slug: string; word_count: number | null
    collection_id: string | null; author_id: string | null; accession_number: number | null
    author: { name: string; death_year: number | null; tradition: { slug: string } | null } | null
    genre: { name: string } | null
  }
  const toCand = (r: CandRow, themeSlugs?: string[]): ReadNextCandidate => ({
    id: r.id, title: r.title, slug: r.slug, word_count: r.word_count,
    collection_id: r.collection_id, authorId: r.author_id,
    authorName: r.author?.name ?? null, themeSlugs,
    accessionNumber: r.accession_number, deathYear: r.author?.death_year ?? null,
    traditionSlug: r.author?.tradition?.slug ?? null,
    genreName: r.genre?.name ?? null,
  })
  const themeSlugList = themes.map(t => t.slug)
  const [editorialRow, authorRows, genreRows, themeRows] = await Promise.all([
    // The editor's pick (migration 033), if one is set; published only.
    text.read_next_text_id
      ? supabase.from('texts').select(CAND).eq('id', text.read_next_text_id).eq('published', true).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    text.author_id
      ? supabase.from('texts').select(CAND).eq('author_id', text.author_id).eq('published', true).neq('id', text.id).order('title').limit(60)
      : Promise.resolve({ data: [], error: null }),
    text.genre_id
      ? supabase.from('texts').select(CAND).eq('genre_id', text.genre_id).eq('published', true).neq('id', text.id)
          .neq('author_id', text.author_id ?? '00000000-0000-0000-0000-000000000000').order('title').limit(60)
      : Promise.resolve({ data: [], error: null }),
    themeSlugList.length > 0
      ? supabase
          .from('text_themes')
          .select(`theme:themes!inner(slug), text:texts!inner(${CAND})`)
          .in('theme.slug', themeSlugList)
          .eq('text.published', true)
          .neq('text.id', text.id)
          .order('text_id')
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
  ])
  // Optional module: a failed read degrades to "no module", never to a failed
  // reader page (unlike the primary text read above, which must throw).
  const authorPool = (authorRows.error ? [] : authorRows.data ?? []) as unknown as CandRow[]
  const genrePool = (genreRows.error ? [] : genreRows.data ?? []) as unknown as CandRow[]
  const themePoolRaw = (themeRows.error ? [] : themeRows.data ?? []) as unknown as { theme: { slug: string } | null; text: CandRow | null }[]
  const themeByText = new Map<string, { row: CandRow; slugs: string[] }>()
  for (const r of themePoolRaw) {
    if (!r.text || !r.theme) continue
    const e = themeByText.get(r.text.id) ?? { row: r.text, slugs: [] }
    e.slugs.push(r.theme.slug)
    themeByText.set(r.text.id, e)
  }
  const editorialPick = editorialRow.error || !editorialRow.data
    ? null
    : { candidate: toCand(editorialRow.data as unknown as CandRow), note: text.read_next_note ?? null }
  const readNext = pickReadNext({
    editorial: editorialPick,
    self: { id: text.id, collectionId: collection ? text.collection_id : null, authorId: text.author_id, wordCount: text.word_count },
    authorName: author?.name ?? null,
    genreName: genre?.name ?? null,
    themes,
    sameAuthor: authorPool.map(r => toCand(r)),
    sameGenre: genrePool.map(r => toCand(r)),
    sameTheme: [...themeByText.values()].map(e => toCand(e.row, e.slugs)),
  })

  // ── Structured data — built from real fields only (no null values) ──────────
  const canonicalUrl = `${SITE_URL}/texts/${slug}`
  const bookJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: text.title,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    inLanguage: 'en',
    isAccessibleForFree: true,
    ...(author
      ? {
          author: {
            '@type': 'Person',
            name: author.name,
            ...(author.slug ? { url: `${SITE_URL}/authors/${author.slug}` } : {}),
          },
        }
      : {}),
    ...(genre?.name ? { genre: genre.name } : {}),
    ...(themes.length > 0 ? { about: themes.map(t => t.name) } : {}),
  }

  // BreadcrumbList mirrors the SiteHeader breadcrumb chain: Home → author → text.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'The Stromata', item: SITE_URL },
      ...(author?.slug
        ? [{ '@type': 'ListItem', position: 2, name: author.name, item: `${SITE_URL}/authors/${author.slug}` }]
        : []),
      { '@type': 'ListItem', position: author?.slug ? 3 : 2, name: text.title, item: canonicalUrl },
    ],
  }

  const license = resolveLicense(text.license)

  return (
    // suppressHydrationWarning: the inline script below sets data-reader-theme
    // from localStorage before React hydrates, and the server cannot know it.
    // It covers only this element's own attributes, not its children.
    <div id="reader-page" suppressHydrationWarning style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <JsonLd data={bookJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {/* Apply the reader's saved dark-theme preference before paint, to avoid a
          light flash. Runs during HTML parse and sets the attribute on this
          same #reader-page element (its parent). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var p=JSON.parse(localStorage.getItem('stromata:reader')||'{}');if(p&&p.theme==='dark'){document.currentScript.parentElement.setAttribute('data-reader-theme','dark')}}catch(e){}",
        }}
      />
      {/* Paper only: what a printout or a saved PDF opens with. The hero above
          is a dark screen ground and is not printed (globals.css, "Print"). */}
      <header className="print-only print-title">
        <h1>{text.title}</h1>
        {author && <p className="print-author">{author.name}{lifespan(author.birth_year, author.death_year)}</p>}
        {text.source_attribution && <p className="print-source">Source: {text.source_attribution}</p>}
      </header>
      <ReadingProgressBar slug={slug} />
      <SiteHeader breadcrumb={author ? (() => {
        return (
          <>
            {author.slug
              ? <Link data-umami-event="author-open" data-umami-event-from="text-reader" data-umami-event-author={author.name} href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
              : <span>{author.name}</span>
            }
            {author.tradition?.name && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
                <span aria-hidden className="px-2" style={{ color: 'var(--ink-faint)' }}>·</span>
                <Link href={`/traditions/${author.tradition.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.tradition.name}
                </Link>
              </span>
            )}
            {eraName && author.era?.slug && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
                <span aria-hidden className="px-2" style={{ color: 'var(--ink-faint)' }}>·</span>
                <Link href={`/eras/${author.era.slug}`} className="hover:opacity-70 transition-opacity">
                  {eraName}
                </Link>
              </span>
            )}
          </>
        )
      })() : undefined} />

      {/* ─── Frontispiece hero — book cover + title on the dark ink ground ─── */}
      <section style={{ background: 'var(--hero-ground)' }}>
        {/* frontispiece: on phones the cover drops to a thumbnail beside the
            title (globals.css), so the text starts in the first screen —
            most readers land here straight from search. */}
        <div className="margin-cols rail-first frontispiece py-6 lg:py-20">
          {/* Book cover — fills the rail column, the same column as the author
              rail in the reading container below; a thumbnail on phones */}
          <div className="margin-rail flex justify-center lg:justify-start">
            <div className="w-[84px] lg:w-full">
              <BookCover
                fluid
                title={text.title}
                authorName={author?.name ?? null}
                deathYear={author?.death_year ?? null}
                accessionNumber={text.accession_number ?? null}
                traditionSlug={author?.tradition?.slug ?? null}
                genre={genre?.name ?? null}
                index={0}
              />
            </div>
          </div>

          {/* Title block — starts on the reading column's left edge, the same
              grid line as the body below (globals.css, --text-page-columns) */}
          <div className="margin-body flex flex-col items-start gap-3 text-left lg:gap-8">
            {heroKicker && (
              <p
                className="font-mono uppercase"
                style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.22em', color: 'rgba(250,246,236,0.55)' }}
              >
                {heroKicker}
              </p>
            )}

            {/* Title + summary — grouped tightly */}
            <div className="flex flex-col items-start gap-4">
              <h1
                style={{
                  fontFamily: 'var(--serif-display)',
                  fontSize: 'var(--frontispiece-title-size)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                  color: '#FAF6EC',
                }}
              >
                {text.title}
              </h1>
              {text.featured && featuredNote && (
                // The editor's line sits above the summary and is attributed, so a
                // reader who arrives from search sees the pick as a note to them
                // and does not mistake it for the generated summary below.
                <blockquote
                  className="font-serif"
                  style={{ margin: 0, paddingLeft: '1rem', borderLeft: '2px solid var(--on-dark-gold-soft)', maxWidth: '30rem' }}
                >
                  <EditorNote note={featuredNote} linkColor="var(--on-dark-gold)" style={{ fontSize: 'var(--text-prose)', lineHeight: 1.6, color: 'var(--on-dark-body)' }} />
                  <footer style={{ fontSize: 'var(--text-label)', fontStyle: 'italic', color: 'var(--on-dark-mute)', marginTop: '0.5rem' }}>— the editor</footer>
                </blockquote>
              )}
              {summary && (
                <p
                  // On phones the introduction follows at once and says more,
                  // so the summary yields its space unless there is none.
                  className={`font-serif ${editorialIntro ? 'hidden lg:block' : ''}`}
                  style={{
                    fontSize: 'var(--text-base)',
                    lineHeight: 1.5,
                    color: 'rgba(250,246,236,0.72)',
                    maxWidth: '30rem',
                  }}
                >
                  {summary}
                </p>
              )}
            </div>

            {/* Who wrote it, and the way into the text's contents or its collection:
                the same sheet the reading header opens mid-text. */}
            {author && (
              <p className="font-serif" style={{ fontSize: 'var(--text-base)', color: 'var(--on-dark-soft)' }}>
                {author.slug ? (
                  <Link
                    href={`/authors/${author.slug}`}
                    className="hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--on-dark-body)' }}
                    data-umami-event="author-open"
                    data-umami-event-from="text-page"
                    data-umami-event-author={author.name}
                  >
                    {author.name}
                  </Link>
                ) : author.name}
                {lifespan(author.birth_year, author.death_year)}
              </p>
            )}

            <p
              className="font-serif italic flex flex-wrap items-center gap-x-2"
              style={{ fontSize: 'var(--text-base)', color: 'var(--on-dark-mute)' }}
            >
              {(outline.entries.length > 1 || (collection && collectionPart && collectionTotal)) ? (
                <>
                  <span>Approx. {minutes} min</span>
                  <span aria-hidden>·</span>
                  <ReaderNavTrigger slug={slug}>
                    {outline.entries.length > 1
                      ? `${outline.kind === 'sections' ? 'Sections' : 'Contents'} (${outline.entries.length}) ▾`
                      : `Part ${collectionPart} of ${collectionTotal} ▾`}
                  </ReaderNavTrigger>
                </>
              ) : (
                <span>Approx. {minutes} min read</span>
              )}
            </p>

            {themes.length > 0 && (
              <div className="hidden lg:flex flex-wrap gap-x-2">
                {themes.map(theme => (
                  <ThemeChip key={theme.slug} href={`/themes/${theme.slug}`} name={theme.name} source="text-page" tone="dark" />
                ))}
              </div>
            )}

            {collection && collectionPart && collectionTotal && (
              <Link
                href={`/collections/${collection.slug}`}
                className="font-serif hover:opacity-70 transition-opacity"
                style={{ fontSize: 'var(--text-base)', color: 'rgba(250,246,236,0.7)', textDecoration: 'none' }}
                data-umami-event="collection-open"
                data-umami-event-from="text-page"
                data-umami-event-collection={collection.slug}
              >
                {collection.title} →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ─── Reading container — marginalia rail + main reading column ─── */}
      <div className="margin-cols print-keep py-12 lg:py-16">
          {/* Left margin rail: author · provenance (the summary now leads the
              frontispiece, so the author block sits at the top of the rail) */}
          <aside className="margin-rail print:hidden">
            <div className="flex flex-col gap-8">
              {author && (
                <AuthorAside
                  name={author.name}
                  slug={author.slug}
                  birthYear={author.birth_year}
                  deathYear={author.death_year}
                  locationName={author.loc?.name ?? null}
                  eraName={eraName}
                  tradition={author.tradition}
                  bio={author.bio}
                  imageUrl={author.image_url}
                  imageFocusX={author.image_focus_x}
                  imageFocusY={author.image_focus_y}
                  imageZoom={author.image_zoom}
                />
              )}

              {/* Provenance — sourced metadata. The accession number is no longer
                  repeated here: it now leads the frontispiece as the hero kicker. */}
              {(text.source_attribution || text.provenance_notes || text.translation_notes || license) && (
                // break-words: a bare source URL (archive.org/stream/…) is one unbreakable
                // token, and at phone width it pushed the page 150px wide, so the reader
                // panned sideways and the fixed header's menu button sat off screen.
                <section
                  className="flex flex-col gap-3 break-words"
                  style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--ink-mute)' }}
                >
                  <h2 className="kicker">About this edition</h2>
                  {text.source_attribution && (
                    isBareUrl(text.source_attribution) ? (
                      <p>
                        Source:{' '}
                        <a
                          href={text.source_attribution}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:opacity-70 transition-opacity"
                        >
                          {hostLabel(text.source_attribution)} ↗
                        </a>
                      </p>
                    ) : (
                      <p>{text.source_attribution}</p>
                    )
                  )}
                  {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
                  {/* Long provenance notes are an editor's working account — worth
                      keeping, but not worth a rail of small type before the
                      reader has started. Short ones stay in view. */}
                  {text.provenance_notes && (
                    text.provenance_notes.length > PROVENANCE_INLINE_MAX ? (
                      <details>
                        <summary className="cursor-pointer" style={{ color: 'var(--ink-soft)' }}>
                          Notes on this edition
                        </summary>
                        <p className="mt-2">{text.provenance_notes}</p>
                      </details>
                    ) : (
                      <p>{text.provenance_notes}</p>
                    )
                  )}
                  {license && (
                    <p>
                      License:{' '}
                      <a
                        href={license.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:opacity-70 transition-opacity"
                      >
                        {license.name}
                      </a>
                    </p>
                  )}
                </section>
              )}

              {/* Free, ungated downloads — this text, and the whole collection
                  it belongs to (if any). Reading feature, never membership-gated. */}
              <DownloadLinks
                textSlug={slug}
                collectionSlug={collection?.slug}
                from="text-reader"
              />
            </div>
          </aside>

          {/* Main reading column */}
          <main id="reader-main" className="margin-body">
            {/* Skip-link target. The root layout's skip link points at #main-content, but this
                element keeps id="reader-main" because ReaderSettings and globals.css depend on it,
                so the target sits as the main column's first child. tabIndex -1 lets it take focus. */}
            <span id="main-content" tabIndex={-1} className="outline-none" />
            {/* Below xl the contents live in the reading header's sheet (ReaderNav),
                opened from the frontispiece and mid-text; the old "Jump to section"
                box that scrolled away with screen 1 is gone. */}
            {/* OCR quality notice */}
            {text.ocr_quality === 'low' && (
              <p
                className="mb-8 text-xs rounded px-3 py-2 border"
                style={{ color: 'var(--notice-text)', background: 'var(--notice-bg)', borderColor: 'var(--notice-border)' }}
              >
                This text was digitised from a scan and reviewed for accuracy, though as a rougher
                scan some errors may remain — if you spot one, do let us know.
              </p>
            )}
            {text.ocr_quality === 'medium' && (
              <p
                className="mb-8 text-xs rounded px-3 py-2 border"
                style={{ color: 'var(--ink-mute)', background: 'var(--paper-deep)', borderColor: 'var(--rule)' }}
              >
                This text was digitised from a scan and reviewed for accuracy. As with any scanned
                source, an occasional error may have slipped through — if you spot one, do let us know.
              </p>
            )}

            {/* Editorial introduction */}
            {editorialIntro && (
              <div
                className="mb-12 pb-10 border-b"
                style={{ borderColor: 'var(--rule)' }}
              >
                <p className="kicker" style={{ marginBottom: '1rem' }}>Introduction</p>
                <div className="prose-body" style={{ color: 'var(--ink-soft)' }}>
                  <MarkdownBody content={editorialIntro} numbered={false} />
                </div>
              </div>
            )}

            {/* Phones: the theme chips moved out of the frontispiece land here,
                after the introduction, where they no longer push the text down. */}
            {themes.length > 0 && (
              <div className="flex flex-wrap gap-x-2 mb-10 lg:hidden print:hidden">
                {themes.map(theme => (
                  <ThemeChip key={theme.slug} href={`/themes/${theme.slug}`} name={theme.name} source="text-page" />
                ))}
              </div>
            )}

            {/* Body */}
            <article className="prose-body mb-16">
              <MarkdownBody content={body} sections={locatedSections} />
            </article>

            {/* Paper only: where the printout came from, and the terms. */}
            <p className="print-only print-colophon">
              {COLOPHON} {SITE_URL}/texts/{slug}
              {text.translation_notes ? <><br />Translation: {text.translation_notes}</> : null}
            </p>

            {/* Prev / next within collection */}
            {(prevText || nextText || collection) && (
              <nav
                className="flex justify-between gap-4 mb-12 pt-6 border-t print:hidden"
                style={{ borderColor: 'var(--rule)' }}
              >
                {prevText ? (
                  <Link
                    href={`/texts/${prevText.slug}`}
                    className="group flex flex-col max-w-[45%]"
                    data-umami-event="collection-nav" data-umami-event-from="text-reader"
                    data-umami-event-direction="prev"
                    data-umami-event-collection={collection?.title}
                  >
                    <span className="smallcaps mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                      ← Previous
                    </span>
                    <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                      {prevText.title}
                    </span>
                    {prevText.author && (
                      <span className="text-xs mt-0.5 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                        {prevText.author.name}
                      </span>
                    )}
                  </Link>
                ) : <span />}
                {nextText ? (
                  <Link
                    href={`/texts/${nextText.slug}`}
                    className="group flex flex-col text-right max-w-[45%]"
                    data-umami-event="collection-nav" data-umami-event-from="text-reader"
                    data-umami-event-direction="next"
                    data-umami-event-collection={collection?.title}
                  >
                    <span className="smallcaps mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                      Next →
                    </span>
                    <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                      {nextText.title}
                    </span>
                    {nextText.author && (
                      <span className="text-xs mt-0.5 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                        {nextText.author.name}
                      </span>
                    )}
                  </Link>
                ) : collection ? (
                  <Link
                    href={`/collections/${collection.slug}`}
                    className="group flex flex-col text-right max-w-[45%]"
                    data-umami-event="collection-nav" data-umami-event-from="text-reader"
                    data-umami-event-direction="end"
                    data-umami-event-collection={collection.title}
                  >
                    <span className="smallcaps mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                      End of collection
                    </span>
                    <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                      Return to {collection.title} →
                    </span>
                  </Link>
                ) : <span />}
              </nav>
            )}
            <ContinueExploring picks={readNext} />
          </main>
      </div>

      {/* Footer — shares the body's edges at every width: same .margin-cols grid,
          an empty rail to hold the body's left edge, and the reader's measure. */}
      <div className="margin-cols">
      <div className="margin-rail hidden lg:block" aria-hidden="true" />
      <footer
        className="margin-body reader-measure mt-4 border-t pt-6 pb-12 text-xs"
        style={{ borderColor: 'var(--rule)', color: 'var(--ink-mute)' }}
      >
          <p>
            The Stromata is free to read and always will be.{' '}
            <a
              href="https://ko-fi.com/stromata"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity underline underline-offset-2"
              data-umami-event="ko-fi-click"
              data-umami-event-source="text-page"
            >
              Support the library on Ko-fi →
            </a>
          </p>
          <p className="mt-2">
            <CitationButton
              title={text.title}
              authorName={author?.name ?? null}
              slug={slug}
              sourceAttribution={text.source_attribution ?? null}
              accessionNumber={text.accession_number ?? null}
              licenseName={license?.name ?? null}
              licenseUrl={license?.url ?? null}
            />
          </p>
      </footer>
      </div>

      {/* Desktop TOC — fixed in right viewport margin, hover to expand.
          Renders outside the reading container so it doesn't affect column width.
          Only shown at xl (1280px+) where the right margin has enough room. */}
      {hasToc && <TableOfContents headings={headings} />}

      <ReaderSettings />

      <ReaderNav
        slug={slug}
        title={text.title}
        minutes={minutes}
        runningHead={showsRunningHead(minutes)}
        outline={outline}
        collection={collection && collectionPart && collectionTotal ? {
          title: collection.title,
          slug: collection.slug,
          part: collectionPart,
          total: collectionTotal,
          prev: prevText ? { slug: prevText.slug, title: prevText.title, authorName: prevText.author?.name ?? null } : null,
          next: nextText ? { slug: nextText.slug, title: nextText.title, authorName: nextText.author?.name ?? null } : null,
        } : null}
        readNext={readNext.map(p => ({ slug: p.slug, title: p.title, authorName: p.authorName, kind: p.kind }))}
      />

      <RecordVisit
        slug={slug}
        title={text.title}
        authorName={author?.name ?? null}
        deathYear={author?.death_year ?? null}
        accessionNumber={text.accession_number ?? null}
        traditionSlug={author?.tradition?.slug ?? null}
        genreName={genre?.name ?? null}
        readingMinutes={minutes}
      />
      <TrackTextSessionDepth slug={slug} />
      <TrackPageEvent
        event="text-view"
        data={{
          text: text.slug,
          author: author?.slug ?? null,
          tradition: author?.tradition?.slug ?? null,
          genre: genre?.name ?? null,
        }}
      />
    </div>
  )
}

/** ", 347–407" after an author's name on the frontispiece; whichever years are known. */
function lifespan(birth: number | null, death: number | null): string {
  if (birth && death) return `, ${birth}–${death}`
  if (death) return `, d. ${death}`
  return ''
}
