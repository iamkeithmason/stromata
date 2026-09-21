import { NextRequest, NextResponse } from 'next/server'
import {
  publishCollection,
  publishText,
  revalidatePaths,
  type PublishResult,
} from '@/lib/publishing/publish-text'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Publish the approved texts in one collection (or a standalone selection).
 *
 * Every text goes through the shared `publishText()` — the review queue has no
 * publish path of its own, which is the whole point of that module. Approval
 * and provenance are re-checked there (`requireApproval: true`): the UI
 * disables the buttons, but a disabled button is not enforcement, and this
 * route is reachable with any session cookie.
 *
 * Partial failure is reported, never swallowed: each text comes back as a
 * discriminated result, and a batch where nothing landed returns 200 with an
 * empty `published` array rather than pretending to have succeeded — the same
 * rule pipeline-import.mjs follows when every file was skipped.
 *
 * Revalidation is deferred to the end and de-duplicated. Publishing 40
 * Tractates chapters otherwise means 40 identical `revalidatePath('/')` calls;
 * the union is a few dozen paths instead of several hundred.
 */
export async function POST(request: NextRequest) {
  let payload: { text_ids?: unknown; collection_id?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const textIds = Array.isArray(payload.text_ids)
    ? payload.text_ids.filter((v): v is string => typeof v === 'string')
    : []
  const collectionId = typeof payload.collection_id === 'string' ? payload.collection_id : null

  if (textIds.length === 0) {
    return NextResponse.json({ error: 'text_ids must be a non-empty array.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const results: PublishResult[] = []
  const paths = new Set<string>()

  // Serial, not Promise.all: these share a collection row and a revalidation
  // budget, and a phone on a flaky connection is better served by a request
  // that finishes than by one that fans out and half-fails.
  for (const id of textIds) {
    const result = await publishText(supabase, id, {
      requireApproval: true,
      skipRevalidation: true,
    })
    results.push(result)
    if (result.ok) for (const p of result.paths) paths.add(p)
  }

  const published = results.filter((r): r is Extract<PublishResult, { ok: true }> => r.ok)
  const refused = results.filter((r): r is Extract<PublishResult, { ok: false }> => !r.ok)

  // Publish the collection itself once its chapters are live — but only if its
  // description has been approved. `description_not_approved` and
  // `already_published` are expected outcomes here, not errors to surface.
  let collectionResult: PublishResult | null = null
  if (collectionId && published.length > 0) {
    collectionResult = await publishCollection(supabase, collectionId, { skipRevalidation: true })
    if (collectionResult.ok) for (const p of collectionResult.paths) paths.add(p)
  }

  // One revalidation sweep for the whole batch.
  revalidatePaths([...paths])

  return NextResponse.json({
    ok: true,
    published: published.map(r => ({ id: r.id, title: r.title, slug: r.slug })),
    refused: refused.map(r => ({ id: r.id, title: r.title, reason: r.reason, detail: r.detail })),
    collection: collectionResult
      ? collectionResult.ok
        ? { ok: true, title: collectionResult.title, slug: collectionResult.slug }
        : { ok: false, reason: collectionResult.reason, detail: collectionResult.detail }
      : null,
    revalidated: paths.size,
  })
}
