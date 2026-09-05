import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import MarkdownBody from '@/app/components/MarkdownBody'
import { SiteHeader } from '@/app/components/SiteHeader'
import { RecordVisit } from '@/app/components/RecordVisit'
import { ReadingProgressBar } from '@/app/components/ReadingProgressBar'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import TableOfContents from '@/app/components/TableOfContents'
import { readingTime } from '@/lib/reading-time'
import { extractHeadings } from '@/lib/headings'
import { OG_IMAGE, SITE_URL } from '@/lib/metadata'
import { JsonLd } from '@/app/components/JsonLd'
import { ThemeChip } from '@/app/components/ThemeChip'
import { BookCover } from '@/app/components/BookCover'
import { AuthorAside } from '@/app/components/AuthorAside'
import { DownloadLinks } from '@/app/components/DownloadLinks'
import { ReaderSettings } from '@/app/components/ReaderSettings'
import { CitationButton } from '@/app/components/CitationButton'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('title, summary, author:authors(name)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!data) return { title: 'Text — The Stromata' }

  const author = (data.author as unknown as { name: string } | null)?.name
  // Format: "Author Name — Text Title | The Stromata"
  // Note: combined length can exceed 60 chars for long titles (e.g.
  // "Augustine of Hippo — Exposition on Psalm 115 | The Stromata" = 60 chars).
  // No programmatic truncation applied; flag for review if needed.
  const title = author
    ? `${author} — ${data.title} | The Stromata`
    : `${data.title} — The Stromata`

  // Description is unconditional: prefer the editorial summary, else a sensible
  // author + title fallback so every text page carries a description and per-page
  // OG/Twitter cards.
  // `||` (not `??`) so an empty-string summary also falls back to the template.
  const description = (data.summary as string | null) || (author
    ? `${author}'s ${data.title}, freely readable at The Stromata.`
    : `${data.title}, freely readable at The Stromata.`)
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
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select(`
      *,
      author:authors(name, slug, bio, birth_year, death_year, image_url, loc:locations(name, slug), tradition:traditions(slug, name), era:eras(label, slug)),
      genre:genres(name),
      text_themes(theme:themes(name, slug)),
      collection:collections(id, title, slug, published)
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!text) notFound()

  // author and genre are many-to-one → plain objects
  const author = text.author as {
    name: string
    slug: string | null
    bio: string | null
    birth_year: number | null
    death_year: number | null
    image_url: string | null
    loc: { name: string; slug: string } | null
    tradition: { slug: string; name: string } | null
    era: { label: string; slug: string } | null
  } | null
  const genre = text.genre as { name: string } | null
  // Treat an unpublished collection as no collection at all — the collection
  // page 404s unpublished slugs, so its breadcrumb / return links would be
  // dead. A published text under an unpublished collection reads as standalone.
  const collectionRaw = text.collection as { id: string; title: string; slug: string; published: boolean } | null
  const collection = collectionRaw?.published ? collectionRaw : null

  // text_themes is one-to-many → array; theme within it is many-to-one → object
  const themes = (text.text_themes as { theme: { name: string; slug: string } | null }[])
    .map(tt => tt.theme)
    .filter(Boolean) as { name: string; slug: string }[]

  const body = text.body as string
  const summary = text.summary as string | null
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

  return (
    <div id="reader-page" style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
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
      <ReadingProgressBar slug={slug} />
      <SiteHeader breadcrumb={author ? (() => {
        return (
          <>
            {author.slug
              ? <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
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
        <div className="margin-cols rail-first py-12 lg:py-20">
          {/* Book cover — sits in the left margin rail, aligned with the
              author rail in the reading container below */}
          <div className="margin-rail flex justify-center lg:justify-start">
            <div className="w-[200px]">
              <BookCover
                title={text.title}
                authorName={author?.name ?? null}
                deathYear={author?.death_year ?? null}
                accessionNumber={text.accession_number ?? null}
                traditionSlug={author?.tradition?.slug ?? null}
                index={0}
              />
            </div>
          </div>

          {/* Title block — aligned with the main reading column below */}
          <div className="margin-body flex flex-col items-center gap-6 text-center lg:items-start lg:gap-8 lg:text-left">
            {heroKicker && (
              <p
                className="font-mono uppercase"
                style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.22em', color: 'rgba(250,246,236,0.55)' }}
              >
                {heroKicker}
              </p>
            )}

            {/* Title + summary — grouped tightly */}
            <div className="flex flex-col items-center gap-4 lg:items-start">
              <h1
                style={{
                  fontFamily: 'var(--serif-display)',
                  fontSize: 'var(--text-hero)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                  color: '#FAF6EC',
                }}
              >
                {text.title}
              </h1>
              {summary && (
                <p
                  className="font-serif"
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

            <p
              className="font-serif italic"
              style={{ fontSize: 'var(--text-base)', color: 'rgba(250,246,236,0.6)' }}
            >
              Approx. {readingTime(body)} min read
            </p>

            {themes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
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
                {collection.title} (Part {collectionPart} of {collectionTotal}) →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ─── Reading container — marginalia rail + main reading column ─── */}
      <div className="margin-cols py-12 lg:py-16">
          {/* Left margin rail: author · provenance (the summary now leads the
              frontispiece, so the author block sits at the top of the rail) */}
          <aside className="margin-rail">
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
                />
              )}

              {/* Provenance — sourced metadata. The accession number is no longer
                  repeated here: it now leads the frontispiece as the hero kicker. */}
              {(text.source_attribution || text.provenance_notes || text.translation_notes) && (
                <section
                  className="flex flex-col gap-3 text-xs"
                  style={{ color: 'var(--ink-mute)' }}
                >
                  {text.source_attribution && <p>Source: {text.source_attribution}</p>}
                  {text.provenance_notes && <p>{text.provenance_notes}</p>}
                  {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
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
            {/* Mobile TOC disclosure — visible below xl where the fixed TOC is hidden */}
            {hasToc && (
              <div className="xl:hidden mb-8">
                <TableOfContents headings={headings} mobile />
              </div>
            )}

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

            {/* Body */}
            <article className="prose-body mb-16">
              <MarkdownBody content={body} />
            </article>

            {/* Prev / next within collection */}
            {(prevText || nextText || collection) && (
              <nav
                className="flex justify-between gap-4 mb-12 pt-6 border-t"
                style={{ borderColor: 'var(--rule)' }}
              >
                {prevText ? (
                  <Link
                    href={`/texts/${prevText.slug}`}
                    className="group flex flex-col max-w-[45%]"
                    data-umami-event="collection-nav"
                    data-umami-event-direction="prev"
                    data-umami-event-collection={collection?.title}
                  >
                    <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
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
                    data-umami-event="collection-nav"
                    data-umami-event-direction="next"
                    data-umami-event-collection={collection?.title}
                  >
                    <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
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
                    data-umami-event="collection-nav"
                    data-umami-event-direction="end"
                    data-umami-event-collection={collection.title}
                  >
                    <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-mute)' }}>
                      End of collection
                    </span>
                    <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: 'var(--ink)' }}>
                      Return to {collection.title} →
                    </span>
                  </Link>
                ) : <span />}
              </nav>
            )}
          </main>
      </div>

      {/* Footer — aligned to the reading column measure */}
      <footer
        className="measure-shell mt-4 border-t pt-6 pb-12 text-xs"
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
            />
          </p>
      </footer>

      {/* Desktop TOC — fixed in right viewport margin, hover to expand.
          Renders outside the reading container so it doesn't affect column width.
          Only shown at xl (1280px+) where the right margin has enough room. */}
      {hasToc && <TableOfContents headings={headings} />}

      <ReaderSettings />

      <RecordVisit
        slug={slug}
        title={text.title}
        authorName={author?.name ?? null}
        deathYear={author?.death_year ?? null}
        accessionNumber={text.accession_number ?? null}
        traditionSlug={author?.tradition?.slug ?? null}
        readingMinutes={readingTime(text.body)}
      />
      <TrackPageEvent
        event="text-open"
        data={{
          text: text.slug,
          author: author?.slug ?? null,
          tradition: author?.tradition?.slug ?? null,
          genre: genre?.name ?? null,
        }}
      />
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
