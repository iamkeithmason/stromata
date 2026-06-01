import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import MarkdownBody from '@/app/components/MarkdownBody'
import { SiteHeader } from '@/app/components/SiteHeader'
import { RecordVisit } from '@/app/components/RecordVisit'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import TableOfContents from '@/app/components/TableOfContents'
import { readingTime } from '@/lib/reading-time'
import { extractHeadings } from '@/lib/headings'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('title, author:authors(name)')
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

  return { title }
}

export default async function TextPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select(`
      *,
      author:authors(name, slug, death_year, loc:locations(name, slug), tradition:traditions(slug, name), era:eras(label)),
      genre:genres(name),
      text_themes(theme:themes(name, slug)),
      collection:collections(id, title, slug)
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!text) notFound()

  // author and genre are many-to-one → plain objects
  const author = text.author as { name: string; slug: string | null; death_year: number | null; loc: { name: string; slug: string } | null; tradition: { slug: string; name: string } | null; era: { label: string } | null } | null
  const genre = text.genre as { name: string } | null
  const collection = text.collection as { id: string; title: string; slug: string } | null

  // text_themes is one-to-many → array; theme within it is many-to-one → object
  const themes = (text.text_themes as { theme: { name: string; slug: string } | null }[])
    .map(tt => tt.theme)
    .filter(Boolean) as { name: string; slug: string }[]

  const body = text.body as string
  const editorialIntro = text.editorial_introduction as string | null

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
      <SiteHeader breadcrumb={author ? (() => {
        const eraName = author.era?.label?.replace(/\s*\(.*?\)/, '') ?? null
        return (
          <>
            {author.slug
              ? <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
              : <span>{author.name}</span>
            }
            {author.tradition?.name && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}> {author.tradition.name}</span>
            )}
            {eraName && (
              <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}> {eraName}</span>
            )}
          </>
        )
      })() : undefined} />

      {/* Content column — max-w-3xl. The desktop TOC is fixed in the right margin (see below). */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Mobile TOC disclosure — visible below xl where fixed TOC is hidden */}
        {hasToc && (
          <div className="xl:hidden mb-8">
            <TableOfContents headings={headings} mobile />
          </div>
        )}

        {/* Text header */}
        <div className="mb-20">
          {/* Author left / Collection right */}
          <div
            className="flex justify-between items-baseline mb-4 text-xs tracking-widest uppercase font-serif"
            style={{ color: 'var(--ink-mute)' }}
          >
            <div className="flex items-baseline gap-2">
              {author?.slug ? (
                <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.name}
                </Link>
              ) : author?.name ? (
                <span>{author.name}</span>
              ) : null}
              {author?.loc && (
                <>
                  <span style={{ color: 'var(--rule)' }}>·</span>
                  <Link
                    href={`/locations/${author.loc.slug}`}
                    className="hover:opacity-70 transition-opacity"
                    data-umami-event="location-country-click"
                    data-umami-event-country={author.loc.name}
                    data-umami-event-from="text-reader"
                  >
                    {author.loc.name}
                  </Link>
                </>
              )}
            </div>
            {collection && (
              <Link href={`/collections/${collection.slug}`} className="hover:opacity-70 transition-opacity">
                {collection.title}
              </Link>
            )}
          </div>

          <hr style={{ borderColor: 'var(--rule)', borderTopWidth: '1px', marginBottom: '3rem' }} />

          {/* Reading time — kicker above the title */}
          <p className="text-xs mb-3" style={{ color: 'var(--ink-mute)' }}>
            Approx. {readingTime(body)} min read
          </p>

          {/* Title — IM Fell English at display size, left-aligned */}
          <h1
            className="mb-6"
            style={{
              fontFamily: 'var(--serif-display)',
              fontSize: '3rem',
              lineHeight: 1.5,
              color: 'var(--ink)',
            }}
          >
            {text.title}
          </h1>

          {themes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {themes.map(theme => (
                <Link
                  key={theme.slug}
                  href={`/themes/${theme.slug}`}
                  className="inline-flex items-center text-xs px-2.5 py-1 hover:opacity-70 transition-opacity"
                  style={{
                    color: 'var(--ink-mute)',
                    border: '1px solid var(--rule)',
                    background: 'transparent',
                    fontFamily: '"EB Garamond", Georgia, serif',
                    letterSpacing: '0.1rem',
                    textTransform: 'uppercase',
                  }}
                  data-umami-event="theme-click"
                  data-umami-event-theme={theme.name}
                  data-umami-event-source="text-page"
                >
                  {theme.name}
                </Link>
              ))}
            </div>
          )}
          {/* OCR quality notice */}
          {text.ocr_quality === 'low' && (
            <p
              className="mt-4 text-xs rounded px-3 py-2 border"
              style={{ color: '#92400e', background: '#fffbeb', borderColor: '#fcd34d' }}
            >
              This text was digitised from a scan and may contain OCR errors. If you spot mistakes,
              please let us know.
            </p>
          )}
          {text.ocr_quality === 'medium' && (
            <p
              className="mt-4 text-xs rounded px-3 py-2 border"
              style={{ color: 'var(--ink-mute)', background: '#f4f0e8', borderColor: 'var(--rule)' }}
            >
              This text was digitised from a scan and has been partially reviewed for accuracy.
            </p>
          )}
        </div>

        {/* Editorial introduction */}
        {editorialIntro && (
          <div
            className="mb-12 pb-10 border-b"
            style={{ borderColor: 'var(--rule)' }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-4 font-serif"
              style={{ color: 'var(--ink-mute)' }}
            >
              Introduction
            </p>
            <div className="prose-body" style={{ color: 'var(--ink-soft)' }}>
              <MarkdownBody content={editorialIntro} numbered={false} size="large" />
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
            style={{ borderColor: '#e5e0d8' }}
          >
            {prevText ? (
              <Link
                href={`/texts/${prevText.slug}`}
                className="group flex flex-col max-w-[45%]"
                data-umami-event="collection-nav"
                data-umami-event-direction="prev"
                data-umami-event-collection={collection?.title}
              >
                <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
                  ← Previous
                </span>
                <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                  {prevText.title}
                </span>
                {prevText.author && (
                  <span className="text-xs mt-0.5 group-hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
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
                <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
                  Next →
                </span>
                <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                  {nextText.title}
                </span>
                {nextText.author && (
                  <span className="text-xs mt-0.5 group-hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
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
                <span className="text-xs uppercase tracking-widest mb-1 group-hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
                  End of collection
                </span>
                <span className="font-serif text-sm group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
                  Return to {collection.title} →
                </span>
              </Link>
            ) : <span />}
          </nav>
        )}

        {/* Footer metadata */}
        <footer
          className="border-t pt-6 text-xs space-y-1"
          style={{ borderColor: '#e5e0d8', color: '#6f6a60' }}
        >
          {text.source_attribution && <p>Source: {text.source_attribution}</p>}
          {text.provenance_notes && <p>{text.provenance_notes}</p>}
          {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
          {text.accession_number && (
            <p className="pt-3 font-mono" style={{ color: '#c8c3bb' }}>
              Stromata № {String(text.accession_number).padStart(2, '0')}
            </p>
          )}
          <p className="pt-5 border-t" style={{ borderColor: '#e5e0d8' }}>
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
        </footer>
      </main>

      {/* Desktop TOC — fixed in right viewport margin, hover to expand.
          Renders outside <main> so it doesn't affect content column width.
          Only shown at xl (1280px+) where the right margin has enough room. */}
      {hasToc && <TableOfContents headings={headings} />}

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
