import { revalidatePath } from 'next/cache'

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
 * `paths` are concrete URLs. `patterns` are dynamic-route patterns revalidated
 * as a class (`revalidatePath('/texts/[slug]', 'page')`): used where a row is
 * rendered *inside* many other pages — a location name sits in every author
 * aside, a collection's title and published flag drive every member text's
 * prev/next nav. Marking them stale is lazy — nothing is rebuilt until a reader
 * or crawler next asks — so an admin edit that is rare costs one rebuild per
 * page that is actually visited, not one per page that exists.
 */
export type Entity = 'era' | 'tradition' | 'theme' | 'location' | 'collection'

export type Surfaces = { paths: string[]; patterns: string[] }

const TEXT_PAGES = '/texts/[slug]'
const AUTHOR_PAGES = '/authors/[slug]'

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
      return { paths: real.map(s => `/eras/${s}`), patterns: [] }
    case 'tradition':
      return { paths: real.map(s => `/traditions/${s}`), patterns: [] }
    case 'theme':
      return { paths: real.map(s => `/themes/${s}`), patterns: [] }
    // A location's name is printed in the author aside on author and text pages.
    case 'location':
      return {
        paths: ['/locations', ...real.map(s => `/locations/${s}`)],
        patterns: [AUTHOR_PAGES, TEXT_PAGES],
      }
    // Title, description and the published flag also drive each member text's
    // collection nav (an unpublished collection reads as no collection at all).
    case 'collection':
      return {
        paths: ['/', '/texts', ...real.map(s => `/collections/${s}`)],
        patterns: [TEXT_PAGES],
      }
  }
}

/**
 * Best-effort, like `revalidateAuthor`: the write is already committed by the
 * time this runs, and a stale page is a far smaller problem than a save that
 * reports failure after having saved.
 */
export function revalidateEntity(
  entity: Entity,
  slugs: (string | null | undefined)[]
): void {
  const { paths, patterns } = entitySurfaces(entity, slugs)
  for (const path of paths) {
    try {
      revalidatePath(path)
    } catch {
      /* one bad path must not stop the rest */
    }
  }
  for (const pattern of patterns) {
    try {
      revalidatePath(pattern, 'page')
    } catch {
      /* as above */
    }
  }
}

/**
 * Every `/texts/[slug]` page, as a class. For a text that sits in a collection:
 * its siblings render prev/next links to it, so publishing or editing one
 * chapter changes pages other than its own. Lazy, like the above.
 */
export function revalidateTextPages(): void {
  try {
    revalidatePath(TEXT_PAGES, 'page')
  } catch {
    /* best-effort */
  }
}
