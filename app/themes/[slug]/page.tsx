import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { THEME_CLUSTERS } from '@/lib/constants'
import { readingTime } from '@/lib/reading-time'

type Props = { params: Promise<{ slug: string }> }

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  genre: { name: string } | null
  author: {
    name: string
    slug: string | null
    tradition: { name: string } | null
  } | null
}

export async function generateStaticParams() {
  return THEME_CLUSTERS.flatMap(c => c.themes.map(t => ({ slug: t.slug })))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('themes').select('name').eq('slug', slug).single()
  return { title: data ? `${data.name} — The Stromata` : 'Theme — The Stromata' }
}

export default async function ThemePage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: theme } = await supabase
    .from('themes')
    .select('id, slug, name, description')
    .eq('slug', slug)
    .single()

  if (!theme) notFound()

  const { data: textThemeRows } = await supabase
    .from('text_themes')
    .select('text_id')
    .eq('theme_id', theme.id)

  const textIds = (textThemeRows ?? []).map((r: { text_id: string }) => r.text_id)

  let texts: TextRow[] = []
  if (textIds.length > 0) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, body, genre:genres(name), author:authors(name, slug, tradition:traditions(name))')
      .in('id', textIds)
      .eq('published', true)
      .order('title')
    texts = (data ?? []) as unknown as TextRow[]
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={null} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="font-serif text-3xl mb-2" style={{ color: '#1b1b1b' }}>{theme.name}</h1>
        </div>

        {theme.description && (
          <div className="mb-10">
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>{theme.description}</p>
          </div>
        )}

        {texts.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>
                  Texts in the library
                </h2>
                <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
                  {texts.length}
                </span>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>

            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {texts.map(t => (
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
                          <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                            {t.author.name}
                            {t.author.tradition && ` · ${t.author.tradition.name}`}
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
              ))}
            </ul>
          </div>
        )}

        {texts.length === 0 && (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No texts published yet.</p>
        )}
      </main>
      <TrackPageEvent event="theme-page-view" data={{ theme: theme.name }} />
    </div>
  )
}
