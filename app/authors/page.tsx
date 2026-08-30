import { createServerClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { uniqueFacets, pickFacet } from '@/lib/facets'
import { AuthorsBrowser, type AuthorItem } from '@/app/components/AuthorsBrowser'

// tradition and era are both direct FKs on authors.
type AuthorRow = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  tradition: { name: string; slug: string } | null
  era: { label: string; slug: string; year_start: number | null } | null
}

type Props = {
  searchParams: Promise<{ tradition?: string; era?: string; sort?: string }>
}

export const metadata = {
  title: 'Authors — The Stromata',
}

const SORT_KEYS = ['name', 'texts', 'chronological'] as const

export default async function AuthorsPage({ searchParams }: Props) {
  const sp = await searchParams
  const supabase = createServerClient()

  const [{ data: authors }, { data: textAuthorRows }] = await Promise.all([
    supabase
      .from('authors')
      .select(
        'id, name, slug, birth_year, death_year, tradition:traditions(name, slug), era:eras(label, slug, year_start)',
      )
      .not('slug', 'is', null)
      .eq('draft', false)
      .order('name'),
    supabase.from('texts').select('author_id').eq('published', true),
  ])

  const rows = (authors ?? []) as unknown as AuthorRow[]

  const textCounts = (textAuthorRows ?? []).reduce(
    (acc: Record<string, number>, t: { author_id: string | null }) => {
      if (t.author_id) acc[t.author_id] = (acc[t.author_id] ?? 0) + 1
      return acc
    },
    {},
  )

  const items: AuthorItem[] = rows.map(a => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    birth_year: a.birth_year,
    death_year: a.death_year,
    tradition: a.tradition,
    era: a.era ? { slug: a.era.slug, label: a.era.label } : null,
    textCount: textCounts[a.id] ?? 0,
  }))

  const eraOrder = new Map<string, number>()
  rows.forEach(a => {
    if (a.era) eraOrder.set(a.era.slug, a.era.year_start ?? Number.MAX_SAFE_INTEGER)
  })

  const traditions = uniqueFacets(items.map(i => i.tradition)).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  const eras = uniqueFacets(items.map(i => i.era)).sort(
    (a, b) => (eraOrder.get(a.slug) ?? 0) - (eraOrder.get(b.slug) ?? 0),
  )

  const sort = SORT_KEYS.includes(sp.sort as (typeof SORT_KEYS)[number])
    ? (sp.sort as (typeof SORT_KEYS)[number])
    : 'name'

  const initial = {
    tradition: pickFacet(sp.tradition, traditions),
    era: pickFacet(sp.era, eras),
    sort,
  }

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <AuthorsBrowser
          items={items}
          facets={{ traditions, eras }}
          initial={initial}
          from="authors-index"
        />
      </main>
      <TrackPageEvent event="authors-page-view" />
    </div>
  )
}
