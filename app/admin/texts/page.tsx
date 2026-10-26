import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { one, type MaybeEmbedded } from '@/lib/collections/author'
import {
  PAGE_SIZE, parseTextIndexParams, searchTerm, pageRange, totalPages, toQueryString,
  type TextIndexParams,
} from '@/lib/admin/text-index'

// Library — the one canonical texts index. Server-paginated and searchable, so
// no admin page loads every text row. Reads metadata columns only (never
// `body`): Egress, about PAGE_SIZE rows per request.

type Row = {
  id: string; title: string; slug: string; published: boolean
  editorial_introduction: string | null; source_url: string | null; provenance_notes: string | null
  author: MaybeEmbedded<{ name: string; draft: boolean }>
  genre: MaybeEmbedded<{ name: string }>
  collection: MaybeEmbedded<{ title: string }>
}
type Option = { id: number; name: string; slug: string }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const SELECT_BASE =
  'id, title, slug, published, editorial_introduction, source_url, provenance_notes, genre:genres(name), collection:collections(title)'

export default async function AdminLibraryPage({ searchParams }: Props) {
  const p = parseTextIndexParams(await searchParams)
  const supabase = createServerClient()

  const [{ data: genres }, { data: traditions }, { data: eras }] = await Promise.all([
    supabase.from('genres').select('id, name, slug').order('name'),
    supabase.from('traditions').select('id, name, slug').order('name'),
    supabase.from('eras').select('id, name, slug').order('id'),
  ])
  const idOf = (list: Option[] | null, slug: string) => (list ?? []).find(o => o.slug === slug)?.id

  // Author-level facets (tradition, era, draft) and author-name search need the
  // authors join to be a filter, not just a column, hence !inner.
  const needsAuthorFilter = !!(p.tradition || p.era || p.authorDraft !== 'any')
  let query = supabase
    .from('texts')
    .select(
      `${SELECT_BASE}, author:authors${needsAuthorFilter ? '!inner' : ''}(name, draft)`,
      { count: 'exact' },
    )

  if (p.status === 'published') query = query.eq('published', true)
  if (p.status === 'draft') query = query.eq('published', false)
  if (p.genre) {
    const id = idOf(genres as Option[] | null, p.genre)
    query = id === undefined ? query.eq('genre_id', -1) : query.eq('genre_id', id)
  }
  if (p.tradition) {
    const id = idOf(traditions as Option[] | null, p.tradition)
    query = query.eq('author.tradition_id', id ?? -1)
  }
  if (p.era) {
    const id = idOf(eras as Option[] | null, p.era)
    query = query.eq('author.era_id', id ?? -1)
  }
  if (p.authorDraft !== 'any') query = query.eq('author.draft', p.authorDraft === 'yes')
  if (p.intro === 'yes') query = query.not('editorial_introduction', 'is', null)
  if (p.intro === 'no') query = query.is('editorial_introduction', null)
  if (p.provenance === 'missing') query = query.or('source_url.is.null,provenance_notes.is.null')

  const term = searchTerm(p.q)
  if (term) {
    // Title or slug match, or any text by an author whose name matches.
    const { data: authorHits } = await supabase
      .from('authors').select('id').ilike('name', `%${term}%`).limit(200)
    const ids = (authorHits ?? []).map(a => a.id)
    const clauses = [`title.ilike.%${term}%`, `slug.ilike.%${term}%`]
    if (ids.length) clauses.push(`author_id.in.(${ids.join(',')})`)
    query = query.or(clauses.join(','))
  }

  const [from, to] = pageRange(p.page)
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)
  const rows = (data ?? []) as unknown as Row[]
  const total = count ?? 0
  const pages = totalPages(total)

  const link = (over: Partial<TextIndexParams>) => `/admin/texts${toQueryString(p, { page: 1, ...over })}`
  const selectCls = 'border border-stone-300 rounded px-2 py-1 text-xs bg-white text-stone-700'

  return (
    <main>
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← Admin</Link>
      </div>

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-stone-800">
          Library <span className="text-stone-400 font-normal text-sm">({total})</span>
        </h2>
        <Link href="/admin/texts/new" className="text-sm text-stone-600 hover:text-stone-900">+ Add text</Link>
      </div>

      {/* GET form: every facet is a URL parameter, so a view can be bookmarked. */}
      <form method="get" className="mb-5 space-y-2">
        <div className="flex gap-2">
          <input
            type="search" name="q" defaultValue={p.q} placeholder="Title, slug or author"
            className="flex-1 border border-stone-300 rounded px-3 py-1.5 text-sm bg-white"
          />
          <button type="submit" className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700">
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select name="status" defaultValue={p.status} className={selectCls} aria-label="Status">
            <option value="all">Any status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <select name="genre" defaultValue={p.genre} className={selectCls} aria-label="Genre">
            <option value="">Any genre</option>
            {((genres ?? []) as Option[]).map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <select name="tradition" defaultValue={p.tradition} className={selectCls} aria-label="Tradition">
            <option value="">Any tradition</option>
            {((traditions ?? []) as Option[]).map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <select name="era" defaultValue={p.era} className={selectCls} aria-label="Era">
            <option value="">Any era</option>
            {((eras ?? []) as Option[]).map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <select name="intro" defaultValue={p.intro} className={selectCls} aria-label="Editorial introduction">
            <option value="any">Intro: any</option>
            <option value="yes">Has intro</option>
            <option value="no">No intro</option>
          </select>
          <select name="authorDraft" defaultValue={p.authorDraft} className={selectCls} aria-label="Author draft">
            <option value="any">Author: any</option>
            <option value="yes">Author is draft</option>
            <option value="no">Author is live</option>
          </select>
          <select name="provenance" defaultValue={p.provenance} className={selectCls} aria-label="Provenance">
            <option value="any">Provenance: any</option>
            <option value="missing">Missing source or notes</option>
          </select>
          <Link href="/admin/texts" className="text-xs text-stone-400 hover:text-stone-700 self-center">Reset</Link>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          Could not load texts: {error.message}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="border border-stone-200 rounded divide-y divide-stone-100">
          {rows.map(t => {
            const author = one(t.author)
            const genre = one(t.genre)
            const collection = one(t.collection)
            const provenanceOk = !!t.source_url && !!t.provenance_notes
            return (
              <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <span className="text-stone-800 text-sm font-medium">{t.title}</span>
                  <span className="text-stone-400 text-xs ml-3">
                    {author?.name}{genre?.name ? ` · ${genre.name}` : ''}
                    {collection?.title && <> · <span className="italic">{collection.title}</span></>}
                  </span>
                  <span className={`ml-3 text-xs ${t.published ? 'text-green-600' : 'text-stone-400'}`}>
                    {t.published ? '● Published' : '○ Draft'}
                  </span>
                  {author?.draft && (
                    <span className="ml-2 text-xs text-amber-700">author draft</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className={t.editorial_introduction ? 'text-green-600' : 'text-amber-500'}
                    title={t.editorial_introduction ? 'Editorial introduction written' : 'No editorial introduction'}>
                    intro
                  </span>
                  <span className={provenanceOk ? 'text-green-600' : 'text-amber-500'}
                    title={provenanceOk ? 'Source URL and provenance notes present' : 'Source URL or provenance notes missing'}>
                    source
                  </span>
                  <Link href={`/admin/texts/new?from=${t.id}`} className="text-stone-400 hover:text-stone-700">Duplicate</Link>
                  <Link href={`/admin/texts/${t.id}/edit`} className="text-stone-500 hover:text-stone-900">Edit</Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-stone-400">No texts match these filters.</p>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between mt-4 text-sm" aria-label="Pagination">
          {p.page > 1
            ? <Link href={link({ page: p.page - 1 })} className="text-stone-600 hover:text-stone-900">← Previous</Link>
            : <span />}
          <span className="text-xs text-stone-400">
            Page {Math.min(p.page, pages)} of {pages} · {PAGE_SIZE} per page
          </span>
          {p.page < pages
            ? <Link href={link({ page: p.page + 1 })} className="text-stone-600 hover:text-stone-900">Next →</Link>
            : <span />}
        </nav>
      )}
    </main>
  )
}
