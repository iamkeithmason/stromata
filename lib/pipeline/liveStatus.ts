// Server-side: resolve whether an "imported" pipeline/Sourcer queue entry has
// actually gone live on the site, so the admin views can stop showing it as
// active work once it's done — the queue file itself never learns this (see
// prospect-queue.json's STATUSES: the chain ends at "imported", there is no
// "published" status, and nothing writes back to the queue when a text is
// published — that's a pure Supabase write from the text/collection edit form).
//
// A collection_slug can resolve two different ways depending on how many
// output files the prospect produced (mirrors pipeline-import.mjs's own
// collectionId = files.length > 1 ? resolveCollectionId(...) : null):
//   - a single output file → one `texts` row, whose slug comes from that
//     file's OWN frontmatter (NOT the collection_slug — e.g. fetch-texts.mjs
//     derives it from the title, so the two can differ). Read the frontmatter
//     to find it.
//   - multiple output files → a `collections` row keyed by collection_slug,
//     with each chapter's `texts` row pointing at it via collection_id.
// Either shape can end up half-published — a published collection wrapping
// entirely unpublished chapters, or all-but-one chapter published, have both
// been observed in this corpus — so "live" here means every text the prospect
// produced is actually published, not just that a container-level flag is set.
//
// A local output file can also drift from what actually got imported (hand
// edits after the fact, a re-fetch that reset it to placeholder content) —
// observed directly in this corpus: one file's frontmatter slug matched no
// database row at all, even though its prospect's title clearly matched an
// already-published text under a different slug. That's why an unresolved
// slug comes back "unknown" rather than "draft" — false "still a draft" is a
// worse failure mode here than admitting the file can no longer be trusted.

import { promises as fs } from 'fs'
import path from 'path'
import { createServerClient } from '@/lib/supabase/server'
import {
  classifySingleText,
  classifyCollection,
  UNKNOWN,
  type LiveStatusResult,
} from './liveStatusClassify'

export {
  classifySingleText,
  classifyCollection,
  UNKNOWN,
  DRAFT,
} from './liveStatusClassify'
export type { LiveStatus, LiveStatusResult } from './liveStatusClassify'

const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'ingestion', 'output')

async function outputFilePaths(collectionSlug: string): Promise<string[]> {
  const files: string[] = []
  const flat = path.join(OUTPUT_DIR, `${collectionSlug}.md`)
  try {
    await fs.access(flat)
    files.push(flat)
  } catch {
    /* no flat file */
  }
  const dir = path.join(OUTPUT_DIR, collectionSlug)
  try {
    const stat = await fs.stat(dir)
    if (stat.isDirectory()) {
      const entries = await fs.readdir(dir)
      for (const e of entries.filter(e => e.endsWith('.md') && !e.endsWith('_review-summary.md')).sort()) {
        files.push(path.join(dir, e))
      }
    }
  } catch {
    /* no dir */
  }
  return files
}

/** Read just the `slug:` frontmatter field — frontmatter is always near the top, so a small read is enough. */
async function readFrontmatterSlug(filePath: string): Promise<string | null> {
  try {
    const head = (await fs.readFile(filePath, 'utf8')).slice(0, 2000)
    const m = head.match(/^slug:\s*"?([^"\n]+?)"?\s*$/m)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

/**
 * Resolve live/draft/unknown for a batch of collection_slugs (2 Supabase
 * queries total, regardless of how many slugs).
 */
export async function resolveLiveStatuses(collectionSlugs: string[]): Promise<Map<string, LiveStatusResult>> {
  const result = new Map<string, LiveStatusResult>()
  const uniqueSlugs = [...new Set(collectionSlugs.filter(Boolean))]
  if (uniqueSlugs.length === 0) return result

  const singleTextSlugByCollectionSlug = new Map<string, string>()
  const multiFileSlugs: string[] = []

  await Promise.all(
    uniqueSlugs.map(async cs => {
      const files = await outputFilePaths(cs)
      if (files.length === 0) {
        result.set(cs, UNKNOWN)
        return
      }
      if (files.length > 1) {
        multiFileSlugs.push(cs)
        return
      }
      const slug = await readFrontmatterSlug(files[0])
      if (!slug) {
        result.set(cs, UNKNOWN)
        return
      }
      singleTextSlugByCollectionSlug.set(cs, slug)
    })
  )

  const supabase = createServerClient()

  if (singleTextSlugByCollectionSlug.size > 0) {
    const slugs = [...singleTextSlugByCollectionSlug.values()]
    const { data } = await supabase.from('texts').select('slug, published').in('slug', slugs)
    const publishedBySlug = new Map<string, boolean>((data ?? []).map((t: { slug: string; published: boolean }) => [t.slug, t.published]))
    for (const [cs, slug] of singleTextSlugByCollectionSlug) {
      result.set(cs, classifySingleText(slug, publishedBySlug))
    }
  }

  if (multiFileSlugs.length > 0) {
    const { data: collections } = await supabase.from('collections').select('id, slug').in('slug', multiFileSlugs)
    const idByCollectionSlug = new Map<string, string>((collections ?? []).map((c: { id: string; slug: string }) => [c.slug, c.id]))
    const ids = [...idByCollectionSlug.values()]
    const { data: texts } = ids.length
      ? await supabase.from('texts').select('collection_id, published').in('collection_id', ids)
      : { data: [] as { collection_id: string; published: boolean }[] }
    const publishedFlagsByCollectionId = new Map<string, boolean[]>()
    for (const t of (texts ?? []) as { collection_id: string; published: boolean }[]) {
      const arr = publishedFlagsByCollectionId.get(t.collection_id) ?? []
      arr.push(t.published)
      publishedFlagsByCollectionId.set(t.collection_id, arr)
    }
    for (const cs of multiFileSlugs) {
      const id = idByCollectionSlug.get(cs)
      result.set(cs, classifyCollection(cs, id ? publishedFlagsByCollectionId.get(id) : undefined))
    }
  }

  return result
}
