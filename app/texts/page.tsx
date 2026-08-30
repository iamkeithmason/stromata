import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { readingTime } from '@/lib/reading-time'
import { uniqueFacets, pickFacet } from '@/lib/facets'
import { TextsBrowser, type TextItem } from '@/app/components/TextsBrowser'

// tradition/era are author-level (one hop through authors); genre is a direct FK on texts.
type TextRow = {
  id: string
  title: string
  slug: string
  body: string
  author: {
    name: string
    slug: string | null
    tradition: { name: string; slug: string } | null
    era: { label: string; slug: string; year_start: number | null } | null
  } | null
  genre: { name: string; slug: string } | null
  text_themes: { theme: { name: string } | null }[]
}

type Props = {
  searchParams: Promise<{ tradition?: string; era?: string; genre?: string; sort?: string }>
}

export const metadata = {
  title: 'Library — The Stromata',
}

const SORT_KEYS = ['title', 'author', 'length'] as const

export default async function TextsPage({ searchParams }: Props) {
  const sp = await searchParams
  const supabase = createServerClient()

  const { data } = await supabase
    .from('texts')
    .select(
      'id, title, slug, body, author:authors(name, slug, tradition:traditions(name, slug), era:eras(label, slug, year_start)), genre:genres(name, slug), text_themes(theme:themes(name))',
    )
    .eq('published', true)
    .order('title')

  const rows = (data ?? []) as unknown as TextRow[]

  const items: TextItem[] = rows.map(t => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    minutes: readingTime(t.body),
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

  const sort = SORT_KEYS.includes(sp.sort as (typeof SORT_KEYS)[number])
    ? (sp.sort as (typeof SORT_KEYS)[number])
    : 'title'

  const initial = {
    tradition: pickFacet(sp.tradition, traditions),
    era: pickFacet(sp.era, eras),
    genre: pickFacet(sp.genre, genres),
    sort,
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <TextsBrowser
          items={items}
          facets={{ traditions, eras, genres }}
          initial={initial}
          from="library-index"
        />
      </main>
    </div>
  )
}
