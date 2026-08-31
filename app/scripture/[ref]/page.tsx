import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { readingTime } from '@/lib/reading-time'
import { parseReferenceQuery } from '@/lib/scripture'
import ScriptureSearch from '../ScriptureSearch'

type Props = { params: Promise<{ ref: string }> }

type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  collection_id: string | null
  genre: { name: string } | null
  author: { name: string; slug: string | null; tradition: { name: string } | null } | null
}

type Entry =
  | { kind: 'text'; text: TextRow; cited: string[] }
  | { kind: 'collection'; id: string; title: string; slug: string; matched: TextRow[]; totalCount: number }

function referenceLabel(bookName: string, chapter: number, verse: number | null): string {
  return verse == null ? `${bookName} ${chapter}` : `${bookName} ${chapter}:${verse}`
}

export async function generateMetadata({ params }: Props) {
  const { ref } = await params
  const q = parseReferenceQuery(decodeURIComponent(ref))
  const label = q ? referenceLabel(q.bookName, q.chapter, q.verse) : decodeURIComponent(ref)
  return { title: `${label} — The Stromata` }
}

export default async function ScriptureLookupPage({ params }: Props) {
  const { ref } = await params
  const raw = decodeURIComponent(ref)
  const query = parseReferenceQuery(raw)

  const shell = (children: React.ReactNode) => (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={null} />
      <main className="max-w-2xl mx-auto px-6 py-12">{children}</main>
    </div>
  )

  // Couldn't parse a reference out of the input — let the reader try again.
  if (!query) {
    return shell(
      <>
        <div className="mb-8">
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>Scripture</h1>
          <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>
            We couldn&rsquo;t read a verse reference in{' '}
            <span style={{ fontStyle: 'italic' }}>&ldquo;{raw}&rdquo;</span>. Try something like{' '}
            <span style={{ fontStyle: 'italic' }}>John 3:16</span>.
          </p>
        </div>
        <ScriptureSearch initialValue={raw} />
      </>
    )
  }

  const supabase = createServerClient()
  const label = referenceLabel(query.bookName, query.chapter, query.verse)

  // Reverse lookup. Exact-verse match: a text cites this verse if it has a
  // reference in the same book+chapter whose span covers the verse. Whole-chapter
  // citations (verse_start NULL) are excluded for a verse query — matching a whole
  // chapter to any of its verses is the deferred chapter-scan feature.
  let refFilter = supabase
    .from('text_scripture_references')
    .select('text_id, raw')
    .eq('book', query.book)
    .eq('chapter', query.chapter)

  if (query.verse == null) {
    refFilter = refFilter.is('verse_start', null)
  } else {
    refFilter = refFilter.lte('verse_start', query.verse).or(`verse_start.eq.${query.verse},verse_end.gte.${query.verse}`)
  }

  const { data: refRows } = await refFilter
  const citedByText = new Map<string, Set<string>>()
  for (const r of (refRows ?? []) as { text_id: string; raw: string }[]) {
    if (!citedByText.has(r.text_id)) citedByText.set(r.text_id, new Set())
    citedByText.get(r.text_id)!.add(r.raw)
  }
  const textIds = [...citedByText.keys()]

  let texts: TextRow[] = []
  if (textIds.length > 0) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, body, collection_id, genre:genres(name), author:authors(name, slug, tradition:traditions(name))')
      .in('id', textIds)
      .eq('published', true)
      .order('title')
    texts = (data ?? []) as unknown as TextRow[]
  }

  // Roll multi-chapter collections up into a single entry, as the themes page does.
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

  const entries: Entry[] = []
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
      entries.push({ kind: 'text', text: t, cited: [...(citedByText.get(t.id) ?? [])] })
    }
  }
  entries.sort((a, b) => {
    const titleA = a.kind === 'text' ? a.text.title : a.title
    const titleB = b.kind === 'text' ? b.text.title : b.title
    return titleA.localeCompare(titleB)
  })

  return shell(
    <>
      <div className="mb-8">
        <div className="text-xs tracking-[0.18em] uppercase mb-2" style={{ color: '#6f6a60' }}>
          Texts citing
        </div>
        <h1 className="font-serif text-3xl mb-4" style={{ color: '#1b1b1b' }}>{label}</h1>
        <ScriptureSearch initialValue={raw} />
      </div>

      {texts.length > 0 ? (
        <div>
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Referenced in</h2>
              <span className="text-xs tracking-[0.18em] uppercase" style={{ color: '#6f6a60' }}>{texts.length}</span>
            </div>
            <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
          </div>

          <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
            {entries.map(entry => {
              if (entry.kind === 'text') {
                const t = entry.text
                return (
                  <li key={t.id}>
                    <Link href={`/texts/${t.slug}`} className="flex items-start justify-between py-4 group">
                      <div>
                        <div>
                          <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
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
                      <span className="text-xs ml-4 shrink-0 mt-0.5" style={{ color: '#6f6a60' }}>{t.genre?.name}</span>
                    </Link>
                  </li>
                )
              }

              const author = entry.matched[0]?.author
              return (
                <li key={entry.id} className="py-4">
                  <Link href={`/collections/${entry.slug}`} className="flex items-start justify-between group">
                    <div>
                      <span className="font-serif group-hover:opacity-70 transition-opacity" style={{ color: '#1b1b1b' }}>
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
      ) : (
        <p className="text-sm" style={{ color: '#6f6a60' }}>
          No texts in the library cite {label} yet.
        </p>
      )}

      <TrackPageEvent event="scripture-lookup-view" data={{ from: 'scripture-lookup', osis: query.osis }} />
    </>
  )
}
