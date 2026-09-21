import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { SUMMARY_MAX } from '@/lib/publishing/publish-text'

type Params = { params: Promise<{ id: string }> }

const REVIEW_STATES = ['pending', 'approved', 'held'] as const
type ReviewState = (typeof REVIEW_STATES)[number]

/**
 * Autosave + approve/hold for one card in the review queue.
 *
 * Deliberately NOT the general text PATCH: that route requires title, slug,
 * author, genre and body on every call and replaces the theme junctions. The
 * queue only ever touches four review fields, and it calls this on a debounce
 * from a phone that may lose signal mid-edit — so the payload has to be small,
 * every field optional, and a partial save has to be meaningful on its own.
 *
 * No revalidation here, on purpose: nothing this route writes is public. The
 * draft fields only reach the site through the publish route.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const update: Record<string, string | null> = {}

  if ('editorial_introduction' in payload) {
    const value = payload.editorial_introduction
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: 'editorial_introduction must be a string or null.' }, { status: 400 })
    }
    update.editorial_introduction = emptyToNull(value)
  }

  if ('summary_draft' in payload) {
    const value = payload.summary_draft
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: 'summary_draft must be a string or null.' }, { status: 400 })
    }
    // Enforced here as well as in the textarea's counter: the field is stored
    // into `summary`, which the publish gate rejects over the limit. Better a
    // 400 at save time than a card that looks saved and refuses to publish.
    if (typeof value === 'string' && value.length > SUMMARY_MAX) {
      return NextResponse.json(
        { error: `Summary is ${value.length} characters; the limit is ${SUMMARY_MAX}.` },
        { status: 400 }
      )
    }
    update.summary_draft = emptyToNull(value)
  }

  if ('review_state' in payload) {
    const value = payload.review_state
    if (!REVIEW_STATES.includes(value as ReviewState)) {
      return NextResponse.json(
        { error: `review_state must be one of ${REVIEW_STATES.join(', ')}.` },
        { status: 400 }
      )
    }
    update.review_state = value as ReviewState
  }

  if ('review_note' in payload) {
    const value = payload.review_note
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: 'review_note must be a string or null.' }, { status: 400 })
    }
    update.review_note = emptyToNull(value)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No reviewable fields in the payload.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Never resurrect a published text into the queue: a stale card left open on
  // a phone could otherwise re-approve something already live, and writing
  // review_state back onto it would put it in the queue a second time.
  const { data: existing } = await supabase
    .from('texts')
    .select('id, published')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if ((existing as { published: boolean }).published) {
    return NextResponse.json(
      { error: 'Already published — reload the queue.', reason: 'already_published' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('texts').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, saved_at: new Date().toISOString(), fields: Object.keys(update) })
}

/** '' and '   ' mean "cleared", which is NULL in the database, not an empty string. */
function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : null
}
