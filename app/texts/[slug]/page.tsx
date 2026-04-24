import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

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
      text_themes(theme:themes(name, cluster))
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!text) notFound()

  // Supabase returns joins as arrays; grab the first element
  const author = (text.author as { name: string; slug: string | null }[])?.[0] ?? null
  const genre = (text.genre as { name: string }[])?.[0] ?? null

  const themes = (text.text_themes as { theme: { name: string }[] }[])
    .map(tt => tt.theme?.[0]?.name)
    .filter(Boolean)

  const paragraphs = (text.body as string)
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean)

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-8 py-5 flex gap-4 text-sm text-stone-400">
        <Link href="/" className="hover:text-stone-600">The Stromata</Link>
        {author?.slug && (
          <>
            <span>/</span>
            <Link href={`/authors/${author.slug}`} className="hover:text-stone-600">
              {author.name}
            </Link>
          </>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Text header */}
        <div className="mb-10">
          <h1 className="text-3xl font-serif text-stone-800 mb-3">{text.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
            {author?.slug ? (
              <Link href={`/authors/${author.slug}`} className="hover:text-stone-700">
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
            <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              This text was digitised from a scan and may contain OCR errors. If you spot mistakes,
              please let us know.
            </p>
          )}
          {text.ocr_quality === 'medium' && (
            <p className="mt-4 text-xs text-stone-500 bg-stone-100 border border-stone-200 rounded px-3 py-2">
              This text was digitised from a scan and has been partially reviewed for accuracy.
            </p>
          )}
        </div>

        {/* Body */}
        <article className="mb-12">
          {paragraphs.map((para: string, i: number) => (
            <p key={i} className="font-serif text-stone-800 leading-loose mb-5 text-[1.05rem]">
              {para}
            </p>
          ))}
        </article>

        {/* Footer metadata */}
        <footer className="border-t border-stone-200 pt-6 text-xs text-stone-400 space-y-1">
          {text.source_attribution && <p>Source: {text.source_attribution}</p>}
          {text.provenance_notes && <p>{text.provenance_notes}</p>}
          {text.translation_notes && <p>Translation: {text.translation_notes}</p>}
        </footer>
      </main>
    </div>
  )
}
