import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import MarkdownBody from '@/app/components/MarkdownBody'

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
      text_themes(theme:themes(name))
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!text) notFound()

  // author and genre are many-to-one → plain objects
  const author = text.author as { name: string; slug: string | null } | null
  const genre = text.genre as { name: string } | null

  // text_themes is one-to-many → array; theme within it is many-to-one → object
  const themes = (text.text_themes as { theme: { name: string } | null }[])
    .map(tt => tt.theme?.name)
    .filter(Boolean) as string[]

  const body = text.body as string

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b bg-white px-8 py-5 flex justify-between items-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <div className="flex gap-4 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/" className="hover:opacity-70 transition-opacity">The Stromata</Link>
          {author?.slug && (
            <>
              <span>/</span>
              <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                {author.name}
              </Link>
            </>
          )}
        </div>
        <div className="flex gap-6 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/authors" className="hover:text-stone-900 transition-colors">Authors</Link>
          <Link href="/texts" className="hover:text-stone-900 transition-colors">Library</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Text header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>{text.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: '#6f6a60' }}>
            {author?.slug ? (
              <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                {author.name}
              </Link>
            ) : (
              <span>{author?.name}</span>
            )}
            {genre?.name && <span>{genre.name}</span>}
            {themes.length > 0 && <span>{themes.join(' · ')}</span>}
          </div>

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
              style={{ color: '#6f6a60', background: '#f4f0e8', borderColor: '#e5e0d8' }}
            >
              This text was digitised from a scan and has been partially reviewed for accuracy.
            </p>
          )}
        </div>

        {/* Body */}
        <article className="mb-16">
          <MarkdownBody content={body} />
        </article>

        {/* Footer metadata */}
        <footer
          className="border-t pt-6 text-xs space-y-1"
          style={{ borderColor: '#e5e0d8', color: '#6f6a60' }}
        >
          {text.source_attribution && <p>Source: {text.source_attribution}</p>}
          {text.provenance_notes && <p>{text.provenance_notes}</p>}
          {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
        </footer>
      </main>
    </div>
  )
}
