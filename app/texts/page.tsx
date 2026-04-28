import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { readingTime } from '@/lib/reading-time'

// author and genre are many-to-one from texts → objects; text_themes is one-to-many → array
type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  author: { name: string; slug: string | null } | null
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
}

export const metadata = {
  title: 'Library — The Stromata',
}

export default async function TextsPage() {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select('id, title, slug, body, author:authors(name, slug), genre:genres(name), text_themes(theme:themes(name))')
    .eq('published', true)
    .order('title')

  const texts = (data ?? []) as unknown as TextRow[]

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="font-serif italic text-xl" style={{ color: '#1b1b1b' }}>Library</h1>
            <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
              {texts.length} text{texts.length === 1 ? '' : 's'}
            </span>
          </div>
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>

        {texts.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
            {texts.map(t => {
              const themes = t.text_themes.map(tt => tt.theme?.name).filter(Boolean)
              return (
                <li key={t.id}>
                  <Link
                    href={`/texts/${t.slug}`}
                    className="flex items-start justify-between py-4 group"
                  >
                    <div>
                      <div>
                        <span
                          className="font-serif group-hover:opacity-70 transition-opacity"
                          style={{ color: '#1b1b1b' }}
                        >
                          {t.title}
                        </span>
                        {t.author && (
                          <span className="text-sm ml-3" style={{ color: '#6f6a60' }}>
                            {t.author.name}
                          </span>
                        )}
                        {themes.length > 0 && (
                          <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                            {themes.join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                        approx. {readingTime(t.body)} min read
                      </div>
                    </div>
                    <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: '#6f6a60' }}>
                      {t.genre?.name}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No texts published yet.</p>
        )}
      </main>
    </div>
  )
}
