import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

type TextRow = {
  id: string
  title: string
  slug: string
  author: { name: string; slug: string | null }[]
  genre: { name: string }[]
  text_themes: { theme: { name: string }[] }[]
}

export const metadata = {
  title: 'Library — The Stromata',
}

export default async function TextsPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, author:authors(name, slug), genre:genres(name), text_themes(theme:themes(name))')
    .eq('published', true)
    .order('title')

  const texts = (data ?? []) as TextRow[]

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b px-8 py-5 flex gap-4 text-sm"
        style={{ borderColor: '#e5e0d8', color: '#6f6a60', background: 'white' }}
      >
        <Link href="/" className="hover:text-stone-700">The Stromata</Link>
        <span>/</span>
        <span>Library</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-serif mb-2" style={{ color: '#1b1b1b' }}>Library</h1>
        <p className="text-sm mb-10" style={{ color: '#6f6a60' }}>
          {texts.length} text{texts.length === 1 ? '' : 's'}
        </p>

        {texts.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
            {texts.map((t: TextRow) => {
              const author = t.author?.[0]
              const themes = t.text_themes.map(tt => tt.theme?.[0]?.name).filter(Boolean)
              return (
                <li key={t.id}>
                  <Link
                    href={`/texts/${t.slug}`}
                    className="flex items-baseline justify-between py-4 group"
                  >
                    <div>
                      <span
                        className="font-serif group-hover:opacity-70 transition-opacity"
                        style={{ color: '#1b1b1b' }}
                      >
                        {t.title}
                      </span>
                      {author && (
                        <span className="text-sm ml-3" style={{ color: '#6f6a60' }}>
                          {author.name}
                        </span>
                      )}
                      {themes.length > 0 && (
                        <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                          {themes.join(' · ')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {t.genre?.[0]?.name}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p style={{ color: '#6f6a60' }} className="text-sm">No texts published yet.</p>
        )}
      </main>
    </div>
  )
}
