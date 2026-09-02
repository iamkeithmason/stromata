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
import { OG_IMAGE } from '@/lib/metadata'
import { ThemeChip } from '@/app/components/ThemeChip'
import { BookCover } from '@/app/components/BookCover'
import { AuthorAside } from '@/app/components/AuthorAside'
import { DownloadLinks } from '@/app/components/DownloadLinks'
import { ReaderSettings } from '@/app/components/ReaderSettings'
import { CitationButton } from '@/app/components/CitationButton'

type Props = { params: Promise<{ slug: string }> }

// Shared horizontal frame so the frontispiece hero and the reading container
// stay in vertical alignment: the book cover lines up with the left margin
// column, and the hero title lines up with the main reading column.
const FRAME = 'mx-auto w-full max-w-[1200px] px-6 lg:px-12'

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

  const description = (data.summary as string | null) ?? undefined

  return {
    title,
    ...(description && {
      description,
      openGraph: { title, description, images: [OG_IMAGE] },
      twitter: { title, description, images: [OG_IMAGE.url] },
    }),
  }
}

export default async function TextPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select(`
      *,
      author:authors(name, slug, bio, birth_year, death_year, loc:locations(name, slug), tradition:traditions(slug, name), era:eras(label, slug)),
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

  // Frontispiece kicker: "Author • Location • Collection", omitting any part
  // that's absent.
  const kickerParts = [author?.name, author?.loc?.name, collection?.title].filter(Boolean) as string[]

  // Extract headings for the TOC sidebar. Only show TOC if 3+ headings exist —
  // short letters and prayers are flowing prose with no meaningful structure to navigate.
  const headings = extractHeadings(body)
  const hasToc = headings.length >= 3

  // If this text belongs to a collection, fetch siblings for prev/next navigation
  type Sibling = { id: string; title: string; slug: string; collection_order: number | null; author: { name: string } | null }
  let prevText: Sibling | null = null
  let nextText: Sibling | null = null

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
    }
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <ReadingProgressBar slug={slug} title={text.title} />
      <SiteHeader breadcrumb={author ? (() => {
        return (
          <>
            {author.slug
              ? <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
              : <span>{author.name}</span>
            }
            {author.tradition?.name && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
                {' '}
                <Link href={`/traditions/${author.tradition.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.tradition.name}
                </Link>
              </span>
            )}
            {eraName && author.era?.slug && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
                {' '}
                <Link href={`/eras/${author.era.slug}`} className="hover:opacity-70 transition-opacity">
                  {eraName}
                </Link>
              </span>
            )}
          </>
        )
      })() : undefined} />

      {/* ─── Frontispiece hero — book cover + title on the dark ink ground ─── */}
      <section style={{ background: 'var(--ink)' }}>
        <div className={`${FRAME} flex flex-col items-center gap-10 py-12 lg:flex-row lg:items-center lg:gap-16 lg:py-20`}>
          {/* Book cover — aligns with the left margin column below */}
          <div className="w-[200px] shrink-0 lg:w-[248px]">
            <BookCover
              title={text.title}
              authorName={author?.name ?? null}
              deathYear={author?.death_year ?? null}
              accessionNumber={text.accession_number ?? null}
              traditionSlug={author?.tradition?.slug ?? null}
              index={0}
            />
          </div>

          {/* Title block */}
          <div className="flex w-full min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:gap-8 lg:text-left">
            {kickerParts.length > 0 && (
              <p
                className="font-serif uppercase"
                style={{ fontSize: 'var(--text-label)', letterSpacing: '0.18em', color: 'rgba(250,246,236,0.7)' }}
              >
                {kickerParts.join(' • ')}
              </p>
            )}

            <div className="flex flex-col items-center gap-3 lg:items-start">
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
              <p
                className="font-serif italic"
                style={{ fontSize: 'var(--text-base)', color: 'rgba(250,246,236,0.7)' }}
              >
                Approx. {readingTime(body)} min read
              </p>
            </div>

            {themes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
                {themes.map(theme => (
                  <ThemeChip key={theme.slug} href={`/themes/${theme.slug}`} name={theme.name} source="text-page" tone="dark" />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Reading container — margin column + main reading column ─── */}
      <div className={`${FRAME} py-12 lg:py-16`}>
        <div className="flex flex-col-reverse gap-12 lg:flex-row lg:gap-16">
          {/* Left margin column: summary · author · provenance */}
          <aside className="w-full lg:w-[248px] lg:shrink-0">
            <div className="flex flex-col gap-10">
              {summary && (
                <section>
                  <p className="kicker" style={{ marginBottom: '0.75rem' }}>Summary</p>
                  <p
                    className="font-serif"
                    style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-label)', lineHeight: 1.6 }}
                  >
                    {summary}
                  </p>
                </section>
              )}

              {author && (
                <AuthorAside
                  name={author.name}
                  slug={author.slug}
                  birthYear={author.birth_year}
                  deathYear={author.death_year}
                  eraName={eraName}
                  tradition={author.tradition}
                  bio={author.bio}
                />
              )}

              {/* Provenance / accession — sourced metadata */}
              {(text.source_attribution || text.provenance_notes || text.translation_notes || text.accession_number) && (
                <section
                  className="flex flex-col gap-3 text-xs"
                  style={{ color: 'var(--ink-mute)' }}
                >
                  {text.source_attribution && <p>Source: {text.source_attribution}</p>}
                  {text.provenance_notes && <p>{text.provenance_notes}</p>}
                  {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
                  {text.accession_number && (
                    <p className="font-mono" style={{ color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>
                      STROMATA № {String(text.accession_number).padStart(2, '0')}
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
          <main id="reader-main" className="w-full min-w-0 lg:max-w-[800px] lg:flex-1">
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
                style={{ color: '#92400e', background: '#fffbeb', borderColor: '#fcd34d' }}
              >
                This text was digitised from a scan and reviewed for accuracy, though as a rougher
                scan some errors may remain — if you spot one, do let us know.
              </p>
            )}
            {text.ocr_quality === 'medium' && (
              <p
                className="mb-8 text-xs rounded px-3 py-2 border"
                style={{ color: 'var(--ink-mute)', background: '#f4f0e8', borderColor: 'var(--rule)' }}
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

        {/* Footer — full width beneath both columns */}
        <footer
          className="mt-16 border-t pt-6 text-xs"
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
      </div>

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
