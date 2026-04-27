import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { Wordmark } from '@/app/components/Wordmark'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('collections')
    .select('title')
    .eq('slug', slug)
    .eq('published', true)
    .single()
  return {
    title: data ? `${data.title} — The Stromata` : 'Collection — The Stromata',
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: collection } = await supabase
    .from('collections')
    .select('*, author:authors(name, slug)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!collection) notFound()

  // Fetch published texts in this collection, ordered by collection_order then title
  const { data: texts } = await supabase
    .from('texts')
    .select('id, title, slug, collection_order, genre:genres(name)')
    .eq('collection_id', collection.id)
    .eq('published', true)
    .order('collection_order', { ascending: true, nullsFirst: false })
    .order('title')

  const author = collection.author as { name: string; slug: string | null } | null

  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b bg-white px-8 py-5 flex justify-between items-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <div className="flex gap-4 text-sm items-baseline font-serif" style={{ color: 'var(--ink-mute)' }}>
          <Wordmark size={16} />
          {author?.slug && (
            <>
              <span>/</span>
              <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                {author.name}
              </Link>
            </>
          )}
        </div>
        <div className="hidden sm:flex gap-6 text-sm font-serif" style={{ color: 'var(--ink-soft)' }}>
          <Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>
          <Link href="/texts" className="hover:opacity-70 transition-opacity">Library</Link>
          <Link href="/about" className="hover:opacity-70 transition-opacity">About</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Collection header */}
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#6f6a60' }}>
            Collection
          </p>
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>
            {collection.title}
          </h1>
          {author && (
            <p className="text-sm mb-4" style={{ color: '#6f6a60' }}>
              {author.slug ? (
                <Link href={`/authors/${author.slug}`} className="hover:opacity-70 transition-opacity">
                  {author.name}
                </Link>
              ) : author.name}
            </p>
          )}
          {collection.description && (
            <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>
              {collection.description}
            </p>
          )}
        </div>

        {/* Divider */}
        <hr className="mb-8" style={{ borderColor: '#e5e0d8' }} />

        {/* Text list */}
        {texts && texts.length > 0 ? (
          <ol className="space-y-1">
            {texts.map((text, i) => {
              const genre = text.genre as unknown as { name: string } | null
              const position = text.collection_order ?? i + 1
              return (
                <li key={text.id}>
                  <Link
                    href={`/texts/${text.slug}`}
                    className="flex items-baseline gap-4 py-3 group"
                    style={{ borderBottom: '1px solid #e5e0d8' }}
                  >
                    <span
                      className="text-sm tabular-nums shrink-0 w-6 text-right"
                      style={{ color: '#c8c3bb' }}
                    >
                      {position}
                    </span>
                    <span className="flex-1">
                      <span
                        className="font-serif group-hover:opacity-70 transition-opacity"
                        style={{ color: '#1b1b1b' }}
                      >
                        {text.title}
                      </span>
                      {genre?.name && (
                        <span className="ml-3 text-xs" style={{ color: '#6f6a60' }}>
                          {genre.name}
                        </span>
                      )}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: '#c8c3bb' }}>→</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm italic" style={{ color: '#6f6a60' }}>
            No published texts in this collection yet.
          </p>
        )}
      </main>
    </div>
  )
}
