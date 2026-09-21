import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { SITE_URL } from '@/lib/metadata'

// Serves /sitemap.xml — a full map of the public site for search engines,
// generated from the live library. Covers the static hub pages plus every
// published text, non-draft author, published collection, location, and the
// taxonomy detail pages (theme / tradition / era) that actually have texts.
// Generated dynamically so it stays current as texts are published, and so the
// build never needs database access (mirrors the RSS and llms.txt routes).

export const dynamic = 'force-dynamic'

type Slugged = { slug: string } | null
type TextRow = {
  slug: string
  updated_at: string | null
  author: { tradition: Slugged; era: Slugged } | null
  text_themes: { theme: Slugged }[] | null
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Live read: this feed declares `revalidate = 0` above and must reflect the
  // database as it is now, not the public client's hourly cache.
  const supabase = createPublicClient({ live: true })
  const loc = (path: string) => `${SITE_URL}${path}`

  const [textsRes, authorsRes, collectionsRes, locationsRes] = await Promise.all([
    supabase
      .from('texts')
      .select(
        'slug, updated_at, author:authors(tradition:traditions(slug), era:eras(slug)), text_themes(theme:themes(slug))'
      )
      .eq('published', true),
    supabase.from('authors').select('slug, updated_at').eq('draft', false).not('slug', 'is', null),
    supabase.from('collections').select('slug').eq('published', true),
    supabase.from('locations').select('slug'),
  ])

  const textRows = (textsRes.data ?? []) as unknown as TextRow[]

  // Taxonomy detail pages have no bare index route, so only emit the [slug]
  // pages that actually carry published texts.
  const themes = new Set<string>()
  const traditions = new Set<string>()
  const eras = new Set<string>()
  for (const row of textRows) {
    if (row.author?.tradition) traditions.add(row.author.tradition.slug)
    if (row.author?.era) eras.add(row.author.era.slug)
    for (const tt of row.text_themes ?? []) {
      if (tt.theme) themes.add(tt.theme.slug)
    }
  }

  const staticPages: MetadataRoute.Sitemap = [
    { url: loc('/'), changeFrequency: 'daily', priority: 1 },
    { url: loc('/texts'), changeFrequency: 'daily', priority: 0.9 },
    { url: loc('/authors'), changeFrequency: 'weekly', priority: 0.8 },
    { url: loc('/locations'), changeFrequency: 'monthly', priority: 0.6 },
    { url: loc('/scripture'), changeFrequency: 'weekly', priority: 0.6 },
    { url: loc('/about'), changeFrequency: 'monthly', priority: 0.5 },
  ]

  const textPages: MetadataRoute.Sitemap = textRows.map(t => ({
    url: loc(`/texts/${t.slug}`),
    lastModified: t.updated_at ? new Date(t.updated_at) : undefined,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  const authorPages: MetadataRoute.Sitemap = (
    (authorsRes.data ?? []) as { slug: string; updated_at: string | null }[]
  ).map(a => ({
    url: loc(`/authors/${a.slug}`),
    lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const collectionPages: MetadataRoute.Sitemap = (
    (collectionsRes.data ?? []) as { slug: string }[]
  ).map(c => ({ url: loc(`/collections/${c.slug}`), changeFrequency: 'monthly', priority: 0.6 }))

  const locationPages: MetadataRoute.Sitemap = (
    (locationsRes.data ?? []) as { slug: string }[]
  ).map(l => ({ url: loc(`/locations/${l.slug}`), changeFrequency: 'monthly', priority: 0.5 }))

  const taxonomyPages: MetadataRoute.Sitemap = [
    ...[...themes].map(slug => loc(`/themes/${slug}`)),
    ...[...traditions].map(slug => loc(`/traditions/${slug}`)),
    ...[...eras].map(slug => loc(`/eras/${slug}`)),
  ].map(url => ({ url, changeFrequency: 'weekly' as const, priority: 0.5 }))

  return [
    ...staticPages,
    ...textPages,
    ...authorPages,
    ...collectionPages,
    ...taxonomyPages,
    ...locationPages,
  ]
}
