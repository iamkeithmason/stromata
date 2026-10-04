import { createPublicClient } from '@/lib/supabase/public'
import { orThrow } from '@/lib/supabase/query'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TrackPageEvent } from '@/app/components/TrackPageEvent'
import { uniqueFacets } from '@/lib/facets'
import { AuthorsBrowser, type AuthorItem } from '@/app/components/AuthorsBrowser'

// tradition and era are both direct FKs on authors.
// Incremental Static Regeneration: serve a cached render and refresh it at most
// weekly, so a crawler sweep costs one Supabase query per page per week rather
// than one per request.
export const revalidate = 604800

type AuthorRow = {
  id: string
  name: string
  slug: string
  birth_year: number | null
  death_year: number | null
  image_url: string | null
  image_focus_x: number | null
  image_focus_y: number | null
  image_zoom: number | null
  tradition: { name: string; slug: string } | null
  era: { label: string; slug: string; year_start: number | null } | null
}

export const metadata = {
  title: 'Authors — The Stromata',
  description:
    'Browse every author in The Stromata — theologians, pastors, monks, and divines from across Christian history, each with their freely readable works.',
  // Canonical to the bare path so the ?tradition / ?era / ?sort filter
  // variants fold into one indexed URL.
  alternates: { canonical: '/authors' },
}

export default async function AuthorsPage() {
  const supabase = createPublicClient()

  // Both guarded: a failed query here rendered "No authors match these
  // filters" as a confident 200. See lib/supabase/query.ts.
  const [authorsRes, textAuthorsRes] = await Promise.all([
    supabase
      .from('authors')
      .select(
        'id, name, slug, birth_year, death_year, image_url, image_focus_x, image_focus_y, image_zoom, tradition:traditions(name, slug), era:eras(label, slug, year_start)',
      )
      .not('slug', 'is', null)
      .eq('draft', false)
      .order('name'),
    supabase.from('texts').select('author_id').eq('published', true),
  ])

  const authors = orThrow(authorsRes, 'the authors index')
  const textAuthorRows = orThrow(textAuthorsRes, 'per-author text counts on the authors index')

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
    imageUrl: a.image_url,
    imageFocusX: a.image_focus_x,
    imageFocusY: a.image_focus_y,
    imageZoom: a.image_zoom,
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

  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="content-shell py-12">
        <AuthorsBrowser
          items={items}
          facets={{ traditions, eras }}
          from="authors-index"
        />
      </main>
      <TrackPageEvent event="authors-page-view" />
    </div>
  )
}
