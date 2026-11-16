/**
 * FeaturedAuthors — the "featured authors" band on the homepage.
 *
 * Curated list of author slugs resolved against real DB records.
 * The CURATED_SLUGS array is editorial control over which authors appear
 * and in what order. The order is chosen so same-initial authors
 * (John Calvin / Julian of Norwich, both J) are not adjacent.
 *
 * Display name, dates, era, and tradition all come from the DB record; the
 * card itself is the shared AuthorCard, the same one the /authors grid uses.
 *
 * Analytics: author-open event on each frame, from="featured-band".
 */

import { createPublicClient } from '@/lib/supabase/public'
import { AuthorCard } from './AuthorCard'
import { SectionHeader } from './SectionHeader'

// ── Curated author slugs — edit here to change which authors appear ──────────
// Four authors = one clean row on desktop; two columns on mobile.
// Update as the library grows to include Aquinas, Luther, Calvin, Julian etc.
const CURATED_SLUGS = [
  'augustine-of-hippo',     // A
  'basil-the-great',        // B
  'john-chrysostom',        // J
  'anselm-of-canterbury',   // A  (A at positions 1,4 — non-adjacent)
]
// ────────────────────────────────────────────────────────────────────────────

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
  tradition: { name: string } | null
  era: { label: string } | null
}

export async function FeaturedAuthors() {
  const supabase = createPublicClient()

  const { data: raw } = await supabase
    .from('authors')
    .select('id, name, slug, birth_year, death_year, image_url, image_focus_x, image_focus_y, image_zoom, tradition:traditions(name), era:eras(label)')
    .in('slug', CURATED_SLUGS)
    .eq('draft', false)

  const authorsMap = new Map<string, AuthorRow>()
  for (const a of (raw ?? []) as unknown as AuthorRow[]) {
    if (a.slug) authorsMap.set(a.slug, a)
  }

  // Re-sort to curated order; skip any slug not found in DB
  const authors = CURATED_SLUGS
    .map(slug => authorsMap.get(slug))
    .filter(Boolean) as AuthorRow[]

  if (authors.length === 0) return null

  return (
    <section className="content-shell pb-20">
      <SectionHeader title="Featured authors" aside="All authors →" asideHref="/authors" />

      {/* Arch grid — 4 cols on sm+, 2 on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {authors.map(author => (
          <AuthorCard
            key={author.slug}
            from="featured-band"
            author={{
              name: author.name,
              slug: author.slug,
              birth_year: author.birth_year,
              death_year: author.death_year,
              imageUrl: author.image_url,
              imageFocusX: author.image_focus_x,
              imageFocusY: author.image_focus_y,
              imageZoom: author.image_zoom,
              traditionName: author.tradition?.name ?? null,
              eraLabel: author.era?.label ?? null,
            }}
          />
        ))}
      </div>
    </section>
  )
}
