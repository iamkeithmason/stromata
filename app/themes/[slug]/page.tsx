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
  collection_id: string | null
  genre: { name: string } | null
  author: {
    name: string
    slug: string | null
    tradition: { name: string } | null
  } | null
}

type ThemeEntry =
  | { kind: 'text'; text: TextRow }
  | { kind: 'collection'; id: string; title: string; slug: string; matched: TextRow[]; totalCount: number }

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

function romanToInt(numeral: string): number {
  let total = 0
  for (let i = 0; i < numeral.length; i++) {
    const current = ROMAN_VALUES[numeral[i]]
    const next = ROMAN_VALUES[numeral[i + 1]]
    total += next && current < next ? -current : current
  }
  return total
}

/**
 * Split a title like "Catechetical Lecture IX" into its prefix ("Catechetical Lecture")
 * and trailing Roman numeral value (9). Returns null for the value if there's no
 * trailing numeral, so titles like "On Prayer" fall back to plain alphabetical sorting.
 */
function titleNumeralKey(title: string): { prefix: string; value: number | null } {
  const match = title.match(/^(.*\S)\s+([IVXLCDM]+)$/i)
  if (!match) return { prefix: title, value: null }
  const value = romanToInt(match[2].toUpperCase())
  return value > 0 ? { prefix: match[1], value } : { prefix: title, value: null }
}

/** Sort titles that share a prefix numerically by trailing Roman numeral (…VI, VII…IX, X…); otherwise alphabetically. */
function sortByTitleWithRomanNumerals(texts: TextRow[]): TextRow[] {
  return [...texts]
    .map(text => ({ text, key: titleNumeralKey(text.title) }))
    .sort((a, b) => {
      if (a.key.value !== null && b.key.value !== null && a.key.prefix === b.key.prefix) {
        return a.key.value - b.key.value
      }
      return a.text.title.localeCompare(b.text.title)
    })
    .map(({ text }) => text)
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
      .select('id, title, slug, body, collection_id, genre:genres(name), author:authors(name, slug, tradition:traditions(name))')
      .in('id', textIds)
      .eq('published', true)
      .order('title')
    texts = sortByTitleWithRomanNumerals((data ?? []) as unknown as TextRow[])
  }

  // Roll multi-chapter collections up into a single entry — a theme like "Prayer" shouldn't
  // be dominated by every individual chapter of one multi-book work.
  const collectionIds = [...new Set(texts.map(t => t.collection_id).filter(Boolean))] as string[]

  let collectionMeta: Record<string, { title: string; slug: string }> = {}
  let collectionTotals: Record<string, number> = {}
  if (collectionIds.length > 0) {
    const [{ data: collectionsData }, { data: allCollectionTexts }] = await Promise.all([
      supabase.from('collections').select('id, title, slug').in('id', collectionIds),
      supabase.from('texts').select('id, collection_id').eq('published', true).in('collection_id', collectionIds),
    ])
    collectionMeta = Object.fromEntries(
      (collectionsData ?? []).map((c: { id: string; title: string; slug: string }) => [c.id, { title: c.title, slug: c.slug }])
    )
    collectionTotals = (allCollectionTexts ?? []).reduce((acc: Record<string, number>, t: { collection_id: string | null }) => {
      if (t.collection_id) acc[t.collection_id] = (acc[t.collection_id] ?? 0) + 1
      return acc
    }, {})
  }

  const entries: ThemeEntry[] = []
  const seenCollections = new Set<string>()
  for (const t of texts) {
    if (t.collection_id && collectionMeta[t.collection_id]) {
      if (seenCollections.has(t.collection_id)) continue
      seenCollections.add(t.collection_id)
      const matched = texts.filter(other => other.collection_id === t.collection_id)
      entries.push({
        kind: 'collection',
        id: t.collection_id,
        title: collectionMeta[t.collection_id].title,
        slug: collectionMeta[t.collection_id].slug,
        matched,
        totalCount: collectionTotals[t.collection_id] ?? matched.length,
      })
    } else {
      entries.push({ kind: 'text', text: t })
    }
  }
  entries.sort((a, b) => {
    const titleA = a.kind === 'text' ? a.text.title : a.title
    const titleB = b.kind === 'text' ? b.text.title : b.title
    return titleA.localeCompare(titleB)
  })

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
              {entries.map(entry => {
                if (entry.kind === 'text') {
                  const t = entry.text
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
                  )
                }

                const author = entry.matched[0]?.author
                return (
                  <li key={entry.id} className="py-4">
                    <Link
                      href={`/collections/${entry.slug}`}
                      className="flex items-start justify-between group"
                    >
                      <div>
                        <span
                          className="font-serif group-hover:opacity-70 transition-opacity"
                          style={{ color: '#1b1b1b' }}
                        >
                          {entry.title}
                        </span>
                        {author && (
                          <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                            {author.name}
                            {author.tradition && ` · ${author.tradition.name}`}
                          </span>
                        )}
                      </div>
                      <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: '#6f6a60' }}>
                        {entry.matched.length} of {entry.totalCount} books
                      </span>
                    </Link>
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1 mt-2">
                      {entry.matched.map((m, i) => (
                        <span key={m.id} className="text-xs" style={{ color: '#9c9589' }}>
                          <Link href={`/texts/${m.slug}`} className="hover:opacity-70 transition-opacity" style={{ textDecoration: 'underline', textDecorationColor: '#d6d0c8' }}>
                            {m.title}
                          </Link>
                          {i < entry.matched.length - 1 ? ' ·' : ''}
                        </span>
                      ))}
                    </div>
                  </li>
                )
              })}
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
