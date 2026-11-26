import { revalidatePath } from 'next/cache'
import { scheduleCollectionPdfRebuilds } from '@/lib/pdf/collection-pdf-schedule'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Refresh the public pages that render a taxonomy / place / collection row,
 * after an admin editor has saved it.
 *
 * WHY THIS EXISTS (2026-10-04). The public pages used to refresh hourly, so an
 * admin save that forgot to call `revalidatePath` was invisible for at most an
 * hour and nobody noticed that the era / tradition / theme / location /
 * collection editors never called it at all. The pages now refresh weekly (the
 * Vercel Hobby CPU fix — see CHANGELOG 2026-10-04), which would turn "an hour"
 * into "a week" and make a saved description look like it had not saved. The
 * text and author editors already revalidate (`lib/publishing/publish-text.ts`,
 * `lib/authors/revalidate.ts`); this is the same thing for the rest.
 *
 * One function rather than a copy per route, for the reason `authorPaths` gives:
 * a second implementation of "where does X appear" is what goes stale.
 *
 * Every surface is a concrete path. Until 2026-11-04 a location or collection
 * save also marked whole dynamic routes stale (`revalidatePath('/texts/[slug]',
 * 'page')`), on the theory that marking is lazy and costs only the pages that
 * get visited. Crawlers visit all of them: one chapter edit re-rendered the
 * whole library of ~770 text pages and re-read every body from Supabase, the
 * same bill as a production deploy. The pages that really change are few and
 * cheap to list (a collection's published chapters; a location's authors and
 * their texts), so `collectionTextPaths` and `locationPaths` list them, and
 * `lib/cache/no-route-wide-revalidation.test.ts` keeps the pattern form out.
 */
export type Entity = 'era' | 'tradition' | 'theme' | 'location' | 'collection'

export type Surfaces = { paths: string[] }

/**
 * Pure, so the surface list is testable without mocking `next/cache`.
 *
 * Pass every slug the row has had in this save — the new one and, for a rename,
 * the one it had before — or the page at the old path keeps its stale copy.
 * Nullish and duplicate slugs are dropped.
 */
export function entitySurfaces(
  entity: Entity,
  slugs: (string | null | undefined)[]
): Surfaces {
  const real = [...new Set(slugs.filter((s): s is string => Boolean(s)))]
  switch (entity) {
    // The description / subtitle shows on the entity's own page and nowhere else.
    case 'era':
      return { paths: real.map(s => `/eras/${s}`) }
    case 'tradition':
      return { paths: real.map(s => `/traditions/${s}`) }
    case 'theme':
      return { paths: real.map(s => `/themes/${s}`) }
    // A location's name is also printed in the author aside on author and text
    // pages: the caller adds those from `locationPaths`.
    case 'location':
      return { paths: ['/locations', ...real.map(s => `/locations/${s}`)] }
    // Title, description and the published flag also drive each member text's
    // collection nav (an unpublished collection reads as no collection at all):
    // the caller adds those from `collectionTextPaths`.
    case 'collection':
      return { paths: ['/', '/texts', ...real.map(s => `/collections/${s}`)] }
  }
}

/**
 * Best-effort, like `revalidateAuthor`: the write is already committed by the
 * time this runs, and a stale page is a far smaller problem than a save that
 * reports failure after having saved.
 *
 * `extraPaths` carries the pages that render the row inside them, from
 * `collectionTextPaths` / `locationPaths`.
 */
export function revalidateEntity(
  entity: Entity,
  slugs: (string | null | undefined)[],
  extraPaths: string[] = []
): void {
  const { paths } = entitySurfaces(entity, slugs)
  const all = new Set([...paths, ...extraPaths])
  for (const path of all) {
    try {
      revalidatePath(path)
    } catch {
      /* one bad path must not stop the rest */
    }
  }
  // A collection save rebuilds its stored PDF; a rename's old slug finds no
  // published collection and removes the old file.
  scheduleCollectionPdfRebuilds(all)
}

/**
 * The reader pages of a collection's published chapters. Each one renders the
 * collection's title and prev/next links to its siblings, so a change to the
 * collection row, or to any one chapter, changes all of them. Unpublished
 * chapters have no public page to refresh.
 *
 * Also the author pages of those chapters' authors: since 26 Nov 2026 an author
 * page lists its works with each collection's title, slug and published state
 * (lib/works.ts), so a collection save changes them too.
 *
 * Selects slugs only. Returns [] on any error: callers are best-effort.
 */
export async function collectionTextPaths(
  supabase: SupabaseClient,
  collectionId: string | null | undefined
): Promise<string[]> {
  if (!collectionId) return []
  try {
    const { data, error } = await supabase
      .from('texts')
      .select('slug, author:authors(slug)')
      .eq('collection_id', collectionId)
      .eq('published', true)
    if (error || !data) return []
    const rows = data as unknown as { slug: string | null; author: { slug: string | null } | null }[]
    return [...slugPaths('/texts', rows), ...slugPaths('/authors', rows.map(r => r.author ?? {}))]
  } catch {
    return []
  }
}

/**
 * The author pages, and those authors' published text pages, that print a
 * location's name in their author aside. Slug columns only; [] on any error.
 */
export async function locationPaths(
  supabase: SupabaseClient,
  locationId: string | null | undefined
): Promise<string[]> {
  if (!locationId) return []
  try {
    const { data: authors, error } = await supabase
      .from('authors')
      .select('id, slug')
      .eq('location_id', locationId)
    if (error || !authors || authors.length === 0) return []
    const { data: texts } = await supabase
      .from('texts')
      .select('slug')
      .in('author_id', authors.map(a => a.id))
      .eq('published', true)
    return [...slugPaths('/authors', authors), ...slugPaths('/texts', texts ?? [])]
  } catch {
    return []
  }
}

/** `[{ slug: 'a' }, { slug: null }]` → `['/texts/a']`. Pure; exported for tests. */
export function slugPaths(prefix: string, rows: { slug?: string | null }[]): string[] {
  return [...new Set(rows.map(r => r.slug).filter((s): s is string => Boolean(s)))].map(
    s => `${prefix}/${s}`
  )
}
