import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { BookCover } from '@/app/components/BookCover'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { readingMinutes } from '@/lib/reading-time'
import { contentWords, labelMatches, needsWordPass, mergeResults, allFailed, snippetFocus } from '@/lib/search/query'
import { findBodyMatches, type Excerpt } from '@/lib/search/body-matches'

type Props = { searchParams: Promise<{ q?: string }> }

type TextResult = {
  id: string
  title: string
  slug: string
  // Set only on body-match results: the passage around the hit, from the
  // text_excerpts function (see the body-search note below).
  excerpt?: Excerpt
  summary: string | null
  word_count: number | null
  accession_number: number | null
  author: {
    name: string
    slug: string | null
    death_year: number | null
    tradition: { name: string; slug: string } | null
    era: { label: string; slug: string } | null
  } | null
  genre: { name: string } | null
}


type AuthorResult = {
  id: string
  name: string
  slug: string | null
  tradition: { name: string } | null
}

type SuggestedText = {
  id: string
  title: string
  slug: string
  genre: { name: string } | null
  author: { name: string } | null
}

// Strip markdown and return plain text
function stripMarkdown(body: string): string {
  return body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Return a ~160-char snippet centred on the first occurrence of `query` in the body.
// Falls back to the opening of the text if the term isn't found in the body.
function bodySnippet(body: string, query = '', max = 160): string {
  const stripped = stripMarkdown(body)
  if (query) {
    const idx = stripped.toLowerCase().indexOf(query.toLowerCase())
    if (idx !== -1) {
      const half = Math.floor((max - query.length) / 2)
      const start = Math.max(0, idx - half)
      const end = Math.min(stripped.length, start + max)
      let snip = stripped.slice(start, end).trimEnd()
      if (start > 0) snip = '…' + snip
      if (end < stripped.length) snip += '…'
      return snip
    }
  }
  return stripped.length > max ? stripped.slice(0, max).trimEnd() + '…' : stripped
}

// The snippet for a body match. The excerpt is already a window cut from the
// middle of the body, so ellipses mark where the window, not just the
// snippet, was cut short.
function excerptSnippet({ excerpt, has_before, has_after }: Excerpt, query: string): string {
  let snip = bodySnippet(excerpt, snippetFocus(excerpt, query))
  if (has_before && !snip.startsWith('…')) snip = '…' + snip
  if (has_after && !snip.endsWith('…')) snip += '…'
  return snip
}

// Highlight occurrences of `query` within `text` using <mark>.
// Safe for server components — pure JSX, no hooks.
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  const lower = query.toLowerCase()
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower ? (
          <mark
            key={i}
            style={{
              background: 'var(--highlight)',
              color: 'var(--ink)',
              padding: '0 1px',
              borderRadius: '2px',
              fontStyle: 'inherit',
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export async function generateMetadata({ searchParams }: Props) {
  const { q } = await searchParams
  return {
    title: q ? `"${q}" — The Stromata` : 'Search — The Stromata',
    // Canonical to the bare path so per-query result pages fold into one URL.
    alternates: { canonical: '/search' },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  const supabase = createPublicClient()

  let texts: TextResult[] = []
  let authors: AuthorResult[] = []
  let suggested: SuggestedText[] | null = null
  let searchFailed = false

  // NO QUERY HERE SELECTS `body`.
  //
  // A search once ran five text queries that each asked for `body`: up to ~90
  // bodies averaging 55 kB, roughly 5 MB of egress per search. Title, genre,
  // theme and author matches show `summary` instead. The body match still
  // *filters* on body (PostgREST can filter on a column it does not return),
  // and its snippet comes from text_excerpts (migration 032), which sends back
  // a few hundred characters around the hit. lib/supabase/no-body-in-listings
  // .test.ts keeps it that way.
  const textSelect = `id, title, slug, summary, word_count, accession_number,
    author:authors(name, slug, death_year, tradition:traditions(name, slug), era:eras(label, slug)),
    genre:genres(name)`

  if (query) {
    const pattern = `%${query}%`
    const words = contentWords(query)
    const wordPass = needsWordPass(query)
    // Every query's outcome, so the page can tell "nothing matched" from
    // "nothing answered" (see allFailed in lib/search/query.ts).
    const outcomes: { error: unknown }[] = []
    const track = <R extends { error: unknown }>(r: R): R => { outcomes.push(r); return r }

    // Phase 1: the short vocabularies (35 themes, 17 genres, 12 traditions,
    // 9 eras) come back whole and are matched here, by phrase or by any word
    // (labelMatches), plus authors matched by name.
    const [themesRes, genresRes, traditionsRes, erasRes, authorPhraseRes, authorWordsRes] = await Promise.all([
      supabase.from('themes').select('id, name').then(track),
      supabase.from('genres').select('id, name').then(track),
      supabase.from('traditions').select('id, name').then(track),
      supabase.from('eras').select('id, label').then(track),
      supabase.from('authors')
        .select('id, name, slug, tradition:traditions(name), texts!inner(id)')
        .ilike('name', pattern)
        .not('slug', 'is', null)
        .eq('draft', false)
        // Only authors with a published text, matching the /authors index.
        .eq('texts.published', true)
        .order('name')
        .limit(10)
        .then(track),
      wordPass
        ? words
            .reduce(
              (qb, w) => qb.ilike('name', `%${w}%`),
              supabase.from('authors').select('id, name, slug, tradition:traditions(name), texts!inner(id)')
            )
            .not('slug', 'is', null)
            .eq('draft', false)
            .eq('texts.published', true)
            .order('name')
            .limit(10)
            .then(track)
        : Promise.resolve({ data: [], error: null }),
    ])

    const idsWhere = <R extends { id: number | string }>(rows: R[] | null, label: (r: R) => string) =>
      (rows ?? []).filter((r) => labelMatches(label(r), query)).map((r) => r.id)
    const themeIds = idsWhere(themesRes.data as { id: number; name: string }[] | null, (r) => r.name)
    const genreIds = idsWhere(genresRes.data as { id: number; name: string }[] | null, (r) => r.name)
    const traditionIds = idsWhere(traditionsRes.data as { id: number; name: string }[] | null, (r) => r.name)
    const eraIds = idsWhere(erasRes.data as { id: number; label: string }[] | null, (r) => r.label)

    const authorSeen = new Set<string>()
    authors = [...((authorPhraseRes.data ?? []) as unknown as AuthorResult[]), ...((authorWordsRes.data ?? []) as unknown as AuthorResult[])]
      .filter((a) => (authorSeen.has(a.id) ? false : (authorSeen.add(a.id), true)))
      .slice(0, 10)

    // Phase 1b: which texts and authors those vocabulary matches point at.
    const [themeTextsRes, traditionAuthorsRes, eraAuthorsRes] = await Promise.all([
      themeIds.length > 0
        ? supabase.from('text_themes').select('text_id').in('theme_id', themeIds).limit(200).then(track)
        : Promise.resolve({ data: [], error: null }),
      traditionIds.length > 0
        ? supabase.from('authors').select('id').in('tradition_id', traditionIds).limit(200).then(track)
        : Promise.resolve({ data: [], error: null }),
      eraIds.length > 0
        ? supabase.from('authors').select('id').in('era_id', eraIds).limit(200).then(track)
        : Promise.resolve({ data: [], error: null }),
    ])
    const themeTextIds = [...new Set(((themeTextsRes.data ?? []) as { text_id: string }[]).map((r) => r.text_id))]
    const uniqueAuthorIds = [
      ...new Set([
        ...((traditionAuthorsRes.data ?? []) as { id: string }[]).map((a) => a.id),
        ...((eraAuthorsRes.data ?? []) as { id: string }[]).map((a) => a.id),
      ]),
    ]

    // Phase 2: texts matched by title (phrase, then every word), genre, theme
    // or author dimension. These rank above body matches, as they always have.
    const published = () => supabase.from('texts').select(textSelect).eq('published', true)
    const metadataResults = await Promise.all([
      published().ilike('title', pattern).order('title').limit(20).then(track),
      ...(wordPass
        ? [words.reduce((qb, w) => qb.ilike('title', `%${w}%`), published()).order('title').limit(20).then(track)]
        : []),
      ...(genreIds.length > 0 ? [published().in('genre_id', genreIds).order('title').limit(20).then(track)] : []),
      ...(themeTextIds.length > 0 ? [published().in('id', themeTextIds).order('title').limit(20).then(track)] : []),
      ...(uniqueAuthorIds.length > 0 ? [published().in('author_id', uniqueAuthorIds).order('title').limit(20).then(track)] : []),
    ])

    // Body matches: whole words, ranked (migration 036), falling back to the
    // old substring match while that migration is not applied. Never selects
    // `body` (lib/supabase/no-body-in-listings.test.ts).
    const body = await findBodyMatches<TextResult>({
      ranked: () => supabase.rpc('search_texts_body', { term: query, max_results: 20 }),
      fetchByIds: (ids) =>
        published().in('id', ids).then((r) => ({ data: r.data as unknown as TextResult[] | null, error: r.error })),
      substring: () =>
        published().ilike('body', pattern).order('title').limit(10)
          .then((r) => ({ data: r.data as unknown as TextResult[] | null, error: r.error })),
    })
    outcomes.push({ error: body.error })

    const merged = mergeResults(
      metadataResults.map(({ data }) => (data ?? []) as unknown as TextResult[]),
      body.rows
    )
    texts = merged.texts
    searchFailed = allFailed(outcomes)

    // Snippets for the body matches that survived the merge. The ranked search
    // brings its own; the fallback asks text_excerpts. If that fails too, those
    // rows show their summary: a plainer snippet, never a broken page.
    const excerptIds = texts.filter((t) => merged.bodyMatchIds.has(t.id)).map((t) => t.id)
    if (excerptIds.length > 0) {
      let byId: Map<string, Excerpt> | null = body.excerpts
      if (!byId) {
        const { data: excerpts } = await supabase.rpc('text_excerpts', { text_ids: excerptIds, term: query })
        byId = new Map(((excerpts ?? []) as (Excerpt & { id: string })[]).map((e) => [e.id, e]))
      }
      for (const t of texts) if (merged.bodyMatchIds.has(t.id)) t.excerpt = byId.get(t.id)
    }
  }

  const total = texts.length + authors.length

  // Suggested texts for zero-results state
  if (query && total === 0 && !searchFailed) {
    const { data } = await supabase
      .from('texts')
      .select('id, title, slug, genre:genres(name), author:authors(name)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(4)
    suggested = data as unknown as SuggestedText[]
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={<span>Search</span>} />

      <main id="main-content" className="content-shell py-12">
        <h1 className="font-serif italic text-xl mb-6" style={{ color: '#1b1b1b' }}>Search</h1>

        {/* Search form */}
        <form method="GET" action="/search" role="search" aria-label="Site search" className="mb-10">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded border shadow-sm"
            style={{ background: 'white', borderColor: '#d6d0c8' }}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              style={{ color: '#6f6a60' }}
              className="shrink-0"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search authors, titles, ideas…"
              aria-label="Search authors, titles, ideas"
              className="field-input flex-1 bg-transparent outline-none font-serif text-base"
              style={{ color: '#1b1b1b' }}
              autoFocus
            />
          </div>
        </form>

        {query && (
          <p className="text-sm mb-8" style={{ color: '#6f6a60' }}>
            {searchFailed
              ? 'Search is unavailable right now. Please try again in a moment.'
              : total === 0
              ? `No results for "${query}"`
              : `${total} result${total === 1 ? '' : 's'} for "${query}"`}
          </p>
        )}

        {/* Authors */}
        {authors.length > 0 && (
          <section className="mb-10">
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Authors</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {authors.map(a => (
                <li key={a.id}>
                  <Link data-umami-event="author-open" data-umami-event-from="search-results" data-umami-event-author={a.name}
                    href={`/authors/${a.slug}`}
                    className="flex items-baseline justify-between py-4 group"
                  >
                    <span
                      className="font-serif group-hover:opacity-70 transition-opacity"
                      style={{ color: '#1b1b1b' }}
                    >
                      {a.name}
                    </span>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {a.tradition?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Texts */}
        {texts.length > 0 && (
          <section>
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>Texts</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {texts.map((t, i) => {
                const author = t.author
                const tradition = author?.tradition?.name
                const eraLabel = author?.era?.label
                const eraSlug = author?.era?.slug
                const snippet = t.excerpt ? excerptSnippet(t.excerpt, query) : (t.summary ?? '')
                const readTime = `approx. ${readingMinutes(t.word_count)} min read`
                return (
                  <li key={t.id} className="relative group">
                    <div className="flex items-start py-4 gap-4">
                      <div style={{ width: 64, height: 96, flexShrink: 0, overflow: 'hidden', position: 'relative' }} className="group-hover:opacity-80 transition-opacity">
                        <div style={{ width: 256, transformOrigin: 'top left', transform: 'scale(0.25)', position: 'absolute', top: 0, left: 0 }}>
                          <BookCover
                            title={t.title}
                            authorName={author?.name ?? null}
                            deathYear={author?.death_year ?? null}
                            accessionNumber={t.accession_number}
                            traditionSlug={author?.tradition?.slug ?? null}
                            genre={t.genre?.name ?? null}
                            index={i}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 relative">
                        <div className="flex items-baseline flex-wrap gap-x-3">
                          <span
                            className="font-serif group-hover:opacity-70 transition-opacity"
                            style={{ color: '#1b1b1b' }}
                          >
                            <Highlight text={t.title} query={query} />
                          </span>
                          {author && (
                            <span className="text-xs" style={{ color: '#6f6a60' }}>
                              <Highlight text={author.name} query={query} />
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#9c9589' }}>
                          {tradition && <><Highlight text={tradition} query={query} />{eraLabel ? ' · ' : ''}</>}
                          {eraLabel && eraSlug
                            ? <Link href={`/eras/${eraSlug}`} className="relative hover:opacity-70 transition-opacity" style={{ zIndex: 2 }}><Highlight text={eraLabel} query={query} /></Link>
                            : eraLabel ? <Highlight text={eraLabel} query={query} /> : null
                          }
                          {(tradition || eraLabel) ? ' · ' : ''}{readTime}
                        </p>
                        {snippet && (
                          <p className="font-serif text-xs mt-1 leading-relaxed" style={{ color: '#9c9589' }}>
                            <Highlight text={snippet} query={query} />
                          </p>
                        )}
                      </div>
                      <span className="text-xs mt-1 shrink-0 relative" style={{ color: '#6f6a60' }}>
                        {t.genre?.name}
                      </span>
                    </div>
                    {/* Stretched link last in DOM so it sits above content; era link uses zIndex 2 to remain clickable */}
                    <Link data-umami-event="text-open" data-umami-event-from="search-results" data-umami-event-text={t.slug} href={`/texts/${t.slug}`} className="absolute inset-0" style={{ zIndex: 1 }} aria-label={t.title} />
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Zero-results suggestions */}
        {query && total === 0 && !searchFailed && <TrackPageEvent event="search-no-results" data={{ query }} />}
        {query && total === 0 && suggested && suggested.length > 0 && (
          <section className="mt-10">
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-base" style={{ color: '#1b1b1b' }}>From the library</h2>
              </div>
              <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
            </div>
            <ul className="divide-y" style={{ borderColor: '#e5e0d8' }}>
              {suggested.map(t => (
                <li key={t.id}>
                  <Link data-umami-event="text-open" data-umami-event-from="search-results" data-umami-event-text={t.slug}
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
                      {t.author && (
                        <span className="text-xs ml-3" style={{ color: '#6f6a60' }}>
                          {t.author.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs ml-4 shrink-0" style={{ color: '#6f6a60' }}>
                      {t.genre?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!query && (
          <p className="text-sm" style={{ color: '#6f6a60' }}>
            Search by title, author, theme, or tradition.
          </p>
        )}
      </main>
    </div>
  )
}
