import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

type Props = { params: Promise<{ slug: string }> }

// genre is many-to-one from texts → object; text_themes is one-to-many → array of { theme: object }
type TextRow = {
  id: string
  title: string
  slug: string
  genre: { name: string } | null
  text_themes: { theme: { name: string } | null }[]
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

  // tradition and era are many-to-one from authors → objects
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

  const rows = (texts ?? []) as unknown as TextRow[]

  // tradition/era come back as objects (many-to-one)
  const tradition = (author.tradition as { name: string } | null)?.name
  const era = (author.era as { label: string } | null)?.label

  const dateLine = [
    author.birth_year && author.death_year
      ? `${author.birth_year}–${author.death_year}`
      : author.death_year
        ? `d. ${author.death_year}`
        : null,
    tradition,
    era,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b bg-white px-8 py-5 flex justify-between items-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <div className="flex gap-4 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/" className="hover:opacity-70 transition-opacity">The Stromata</Link>
          <span>/</span>
          <Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>
        </div>
        <div className="hidden sm:flex gap-6 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/authors" className="hover:text-stone-900 transition-colors">Authors</Link>
          <Link href="/texts" className="hover:text-stone-900 transition-colors">Library</Link>
          <Link href="/about" className="hover:text-stone-900 transition-colors">About</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Author header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl mb-2" style={{ color: '#1b1b1b' }}>{author.name}</h1>
          {dateLine && (
            <p className="text-sm" style={{ color: '#6f6a60' }}>{dateLine}</p>
          )}
        </div>

        {/* Bio */}
        {author.bio && (
          <div className="mb-10">
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>{author.bio}</p>
          </div>
        )}

        {/* Texts */}
        {rows.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>
                  Texts in the library
                </h2>
                <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>
                  {rows.length}
                </span>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>

            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {rows.map(t => {
                const themes = t.text_themes.map(tt => tt.theme?.name).filter(Boolean)
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
                        {themes.length > 0 && (
                          <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                            {themes.join(' · ')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                        {t.genre?.name}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {rows.length === 0 && (
          <p className="text-sm" style={{ color: '#6f6a60' }}>No texts published yet.</p>
        )}
      </main>
    </div>
  )
}
