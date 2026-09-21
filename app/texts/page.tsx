import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { SiteHeader } from '@/app/components/SiteHeader'
import { readingMinutes } from '@/lib/reading-time'
import { uniqueFacets } from '@/lib/facets'
import { TextsBrowser, type TextItem } from '@/app/components/TextsBrowser'

// tradition/era are author-level (one hop through authors); genre is a direct FK on texts.
type TextRow = {
  id: string
  title: string
  slug: string
  word_count: number | null
  author: {
    name: string
    slug: string | null
    tradition: { name: string; slug: string } | null
    era: { label: string; slug: string; year_start: number | null } | null
  } | null
  genre: { name: string; slug: string } | null
  text_themes: { theme: { name: string } | null }[]
}

export const metadata = {
  title: 'Library — The Stromata',
  description:
    'Browse the full library of freely readable public-domain Christian texts — homilies, letters, treatises, and more, organised by author, tradition, era, and genre.',
  // Canonical to the bare path so the ?tradition / ?era / ?genre / ?sort
  // filter variants fold into one indexed URL.
  alternates: { canonical: '/texts' },
}

// Incremental Static Regeneration. Without this the library index re-queried
// Supabase on every request — including every crawler hit — and the page reads
// the whole published corpus. See lib/reading-time.ts for the other half.
export const revalidate = 3600

export default async function TextsPage() {
  const supabase = createPublicClient()

  // orThrow, not `data ?? []`: a failed query here used to render "0 texts" as
  // a confident 200. See lib/supabase/query.ts.
  const data = orThrow(
    await supabase
      .from('texts')
      .select(
        'id, title, slug, word_count, author:authors(name, slug, tradition:traditions(name, slug), era:eras(label, slug, year_start)), genre:genres(name, slug), text_themes(theme:themes(name))',
      )
      .eq('published', true)
      .order('title'),
    'the library index',
  )

  const rows = (data ?? []) as unknown as TextRow[]

  const items: TextItem[] = rows.map(t => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    minutes: readingMinutes(t.word_count),
    author: t.author ? { name: t.author.name, slug: t.author.slug } : null,
    tradition: t.author?.tradition ?? null,
    era: t.author?.era ? { slug: t.author.era.slug, label: t.author.era.label } : null,
    genre: t.genre,
    themes: t.text_themes.map(tt => tt.theme?.name).filter((n): n is string => Boolean(n)),
  }))

  // Facets are derived from the published library so only values that actually
  // have texts appear. Eras order chronologically; traditions/genres alphabetically.
  const eraOrder = new Map<string, number>()
  rows.forEach(t => {
    const era = t.author?.era
    if (era) eraOrder.set(era.slug, era.year_start ?? Number.MAX_SAFE_INTEGER)
  })

  const traditions = uniqueFacets(items.map(i => i.tradition)).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  const eras = uniqueFacets(items.map(i => i.era)).sort(
    (a, b) => (eraOrder.get(a.slug) ?? 0) - (eraOrder.get(b.slug) ?? 0),
  )
  const genres = uniqueFacets(items.map(i => i.genre)).sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="content-shell py-12">
        <TextsBrowser
          items={items}
          facets={{ traditions, eras, genres }}
          from="library-index"
        />
      </main>
    </div>
  )
}
