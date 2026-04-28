import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import MarkdownBody from '@/app/components/MarkdownBody'
import { SiteHeader } from '@/app/components/SiteHeader'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('title')
    .eq('slug', slug)
    .eq('published', true)
    .single()
  return {
    title: data ? `${data.title} — The Stromata` : 'Text — The Stromata',
  }
}

export default async function TextPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select(`
      *,
      author:authors(name, slug),
      genre:genres(name),
      text_themes(theme:themes(name)),
      collection:collections(id, title, slug)
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!text) notFound()

  // author and genre are many-to-one → plain objects
  const author = text.author as { name: string; slug: string | null } | null
  const genre = text.genre as { name: string } | null
  const collection = text.collection as { id: string; title: string; slug: string } | null

  // text_themes is one-to-many → array; theme within it is many-to-one → object
  const themes = (text.text_themes as { theme: { name: string } | null }[])
    .map(tt => tt.theme?.name)
    .filter(Boolean) as string[]

  const body = text.body as string

  // If this text belongs to a collection, fetch siblings for prev/next navigation
  type Sibling = { id: string; title: string; slug: string; collection_order: number | null }
  let prevText: Sibling | null = null
  let nextText: Sibling | null = null

  if (collection && text.collection_id) {
    const { data: siblings } = await supabase
      .from('texts')
      .select('id, title, slug, collection_order')
      .eq('collection_id', text.collection_id)
      .eq('published', true)
      .order('collection_order', { ascending: true, nullsFirst: false })
      .order('title')

    if (siblings) {
      const idx = siblings.findIndex((s: Sibling) => s.id === text.id)
      if (idx > 0) prevText = siblings[idx - 1]
      if (idx < siblings.length - 1) nextText = siblings[idx + 1]
    }
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={author?.slug
        ? <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">{author.name}</Link>
        : undefined}
      />

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Text header */}
        <div className="mb-20">
          {/* Author left / Collection right */}
          <div
            className="flex justify-between items-baseline mb-4 text-xs tracking-widest uppercase font-serif"
            style={{ color: 'var(--ink-mute)' }}
          >
            <div>
              {author?.slug ? (
                <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.name}
                </Link>
              ) : author?.name ? (
                <span>{author.name}</span>
              ) : null}
            </div>
            {collection && (
              <Link href={`/collections/${collection.slug}`} className="hover:opacity-70 transition-opacity">
                {collection.title}
              </Link>
            )}
          </div>

          <hr style={{ borderColor: 'var(--rule)', borderTopWidth: '1px', marginBottom: '5rem' }} />

          <h1 className="font-serif text-3xl text-center italic mb-4" style={{ color: 'var(--ink)' }}>
            {text.title}
          </h1>

          {themes.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-4">
              {themes.map(theme => (
                <Link
                  key={theme}
                  href={`/search?q=${encodeURIComponent(theme)}`}
                  className="text-xs tracking-widest uppercase font-serif hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--ink-mute)' }}
                >
                  {theme}
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
            >
              Support the library on Ko-fi →
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
