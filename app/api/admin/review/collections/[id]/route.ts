import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateEntity } from '@/lib/publishing/revalidate-entities'

type Params = { params: Promise<{ id: string }> }

/**
 * The collection-level controls in the review queue: the provenance gate and
 * the description card.
 *
 * Three actions, all on one route because they are one card group in the UI:
 *
 *   verify_provenance   — stamps provenance_verified_at. This is the gate: no
 *                         text in the collection can be published until it is
 *                         set (re-checked server-side in publishText, since a
 *                         disabled button is not enforcement).
 *   description_draft   — autosaved edits to the generated description.
 *   approve_description — copies the draft into `description`. A filled
 *                         `description` IS the approval record; there is no
 *                         separate flag, and publishCollection reads only that
 *                         field, never the draft.
 *
 * No revalidation: an unpublished collection has no public page to refresh,
 * and publishing one goes through the publish route.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('collections')
    .select('id, slug, published, description, description_draft, provenance_verified_at')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const collection = existing as {
    slug: string
    published: boolean
    description: string | null
    description_draft: string | null
    provenance_verified_at: string | null
  }

  const update: Record<string, string | null> = {}

  if (payload.verify_provenance === true) {
    update.provenance_verified_at = new Date().toISOString()
  } else if (payload.verify_provenance === false) {
    // Un-verifying is allowed: provenance that turns out to be wrong after a
    // few approvals has to be retractable, and the gate then closes again.
    update.provenance_verified_at = null
  }

  if ('description_draft' in payload) {
    const value = payload.description_draft
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: 'description_draft must be a string or null.' }, { status: 400 })
    }
    update.description_draft = emptyToNull(value)
  }

  if (payload.approve_description === true) {
    // Approve whatever the operator is looking at: the edit in this same
    // payload if there is one, else the stored draft.
    const approved =
      'description_draft' in payload
        ? emptyToNull(payload.description_draft)
        : collection.description_draft
    if (!approved) {
      return NextResponse.json(
        { error: 'There is no description to approve.', reason: 'empty_description' },
        { status: 400 }
      )
    }
    update.description = approved
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No recognised action in the payload.' }, { status: 400 })
  }

  const { error } = await supabase.from('collections').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Approving a description writes the public `description`. On a collection
  // that is already live (new chapters arriving through the queue) the new
  // wording would otherwise wait a week to show.
  if ('description' in update && collection.published) revalidateEntity('collection', [collection.slug])

  return NextResponse.json({
    ok: true,
    saved_at: new Date().toISOString(),
    provenance_verified_at:
      'provenance_verified_at' in update ? update.provenance_verified_at : collection.provenance_verified_at,
    description_approved: 'description' in update ? true : !!collection.description,
  })
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : null
}
