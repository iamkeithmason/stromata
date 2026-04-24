import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

type Props = { params: Promise<{ slug: string }> }

type TextRow = {
  id: string; title: string; slug: string
  genre: { name: string }[]
  text_themes: { theme: { name: string }[] }[]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('authors').select('name').eq('slug', slug).single()
  return { title: data ? `${data.name} — The Stromata` : 'Author — The Stromata' }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: author } = await supabase
    .from('authors')
    .select('*, tradition:traditions(name), era:eras(label)')
    .eq('slug', slug)
    .single()

  if (!author) notFound()

  const { data: texts } = await supabase
    .from('texts')
    .select('id, title, slug, genre:genres(name), text_themes(theme:themes(name))')
    .eq('author_id', author.id)
    .eq('published', true)
    .order('title')

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-8 py-5 flex gap-4 text-sm text-stone-400">
        <Link href="/" className="hover:text-stone-600">The Stromata</Link>
        <span>/</span>
        <Link href="/authors" className="hover:text-stone-600">Authors</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Author header */}
        <div className="mb-10">
          <h1 className="text-3xl font-serif text-stone-800 mb-2">{author.name}</h1>
          <p className="text-stone-500 text-sm">
            {author.birth_year && author.death_year
              ? `${author.birth_year}–${author.death_year} · `
              : author.death_year
                ? `d. ${author.death_year} · `
                : ''}
            {author.tradition?.[0]?.name}
            {author.era?.[0]?.label ? ` · ${author.era[0].label}` : ''}
          </p>
        </div>

        {/* Bio */}
        {author.bio && (
          <div className="mb-10 prose-none">
            <p className="text-stone-700 leading-relaxed font-serif">{author.bio}</p>
          </div>
        )}

        {/* Texts */}
        {texts && texts.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-4">
              Texts in the library
            </h2>
            <ul className="divide-y divide-stone-100">
              {texts.map((t: TextRow) => {
                const themes = t.text_themes
                  .map(tt => tt.theme?.[0]?.name)
                  .filter(Boolean)
                return (
                  <li key={t.id}>
                    <Link
                      href={`/texts/${t.slug}`}
                      className="flex items-baseline justify-between py-4 group"
                    >
                      <div>
                        <span className="text-stone-800 font-serif group-hover:text-stone-600 transition-colors">
                          {t.title}
                        </span>
                        {themes.length > 0 && (
                          <span className="text-stone-400 text-xs ml-3">{themes.join(', ')}</span>
                        )}
                      </div>
                      <span className="text-stone-400 text-xs ml-4 shrink-0">{t.genre?.[0]?.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {texts && texts.length === 0 && (
          <p className="text-stone-400 text-sm">No texts published yet.</p>
        )}
      </main>
    </div>
  )
}
