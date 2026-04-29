import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { ERAS } from '@/lib/constants'
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
  return ERAS.map(e => ({ slug: e.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('eras').select('label').eq('slug', slug).single()
  return { title: data ? `${data.label} — The Stromata` : 'Era — The Stromata' }
}

export default async function EraPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: era } = await supabase
    .from('eras')
    .select('id, slug, label, year_start, year_end, description')
    .eq('slug', slug)
    .single()

  if (!era) notFound()

  const { data: authors } = await supabase
    .from('authors')
    .select('id')
    .eq('era_id', era.id)

  const authorIds = (authors ?? []).map(a => a.id)

  let texts: TextRow[] = []
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, body, genre:genres(name), author:authors(name, slug, tradition:traditions(name))')
      .in('author_id', authorIds)
      .eq('published', true)
      .order('title')
    texts = (data ?? []) as unknown as TextRow[]
  }

  const yearRange = era.year_start != null && era.year_end != null
    ? `${era.year_start}–${era.year_end}`
    : era.year_end != null
      ? `to ${era.year_end}`
      : null

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={null} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="font-serif text-3xl mb-2" style={{ color: '#1b1b1b' }}>{era.label}</h1>
          {yearRange && (
            <p className="text-sm" style={{ color: '#6f6a60' }}>{yearRange}</p>
          )}
        </div>

        {era.description && (
          <div className="mb-10">
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>{era.description}</p>
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
    </div>
  )
}
