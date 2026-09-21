// Pure classification helpers behind resolveLiveStatuses — no Supabase, no
// filesystem, no environment. They live in their own module so they stay
// unit-testable: lib/supabase/server.ts carries `import 'server-only'`, which
// throws outside a React Server Component, so a test that imported
// liveStatus.ts for these helpers alone would fail on the transitive import.
//
// "Live" means every published flag for the prospect's output is true: a lone
// unpublished chapter, or a text/collection absent from the database entirely,
// both fall short of that (see lib/pipeline/liveStatus.test.ts for the real
// half-published cases this corpus has actually produced).

export type LiveStatus = 'live' | 'draft' | 'unknown'

export interface LiveStatusResult {
  status: LiveStatus
  /** The live public URL, set only when status === 'live'. */
  href: string | null
}

export const UNKNOWN: LiveStatusResult = { status: 'unknown', href: null }
export const DRAFT: LiveStatusResult = { status: 'draft', href: null }

export function classifySingleText(slug: string, publishedBySlug: Map<string, boolean>): LiveStatusResult {
  const pub = publishedBySlug.get(slug)
  return pub === undefined ? UNKNOWN : pub ? { status: 'live', href: `/texts/${slug}` } : DRAFT
}

export function classifyCollection(collectionSlug: string, publishedFlags: boolean[] | undefined): LiveStatusResult {
  if (!publishedFlags || publishedFlags.length === 0) return UNKNOWN
  return publishedFlags.every(Boolean) ? { status: 'live', href: `/collections/${collectionSlug}` } : DRAFT
}
