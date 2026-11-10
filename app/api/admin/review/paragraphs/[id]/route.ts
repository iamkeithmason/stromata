import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePaths } from '@/lib/publishing/publish-text'
import {
  applyBreaks,
  buildParagraphsDoc,
  draftState,
  validatePicks,
  withProvenanceLine,
} from '@/scripts/lib/paragraphs.mjs'
import { bodyBlocks, resolvePicks as resolveSections } from '@/scripts/lib/sections.mjs'

type Params = { params: Promise<{ id: string }> }

const ACTIONS = ['save', 'hold', 'approve'] as const
type Action = (typeof ACTIONS)[number]

/**
 * Save, hold or approve one text's proposed paragraph breaks.
 *
 * Takes picks ({ paragraph, sentence }) and turns them into anchors against the
 * body as it is now, so a stored break always points at a real sentence end.
 * Save and Hold write only `paragraphs_draft`, which no public page reads.
 *
 * Approve is the one write to `body`. `applyBreaks` inserts a blank line at
 * each anchor and throws unless the result has exactly the same words as the
 * body it started from, with exactly one new paragraph break per anchor. The
 * page sends the `updated_at` it loaded, and the request is refused if the
 * text has changed since: the breaks Keith saw are placed by sentence number,
 * so on an edited body they could land somewhere he never looked. The write
 * is conditional on the same value. It also refuses if a break would stop an
 * editor's section from finding its paragraph (sections anchor on a
 * paragraph's opening words, and a new paragraph could share them). It appends the
 * editor's line to provenance_notes and refreshes the text's own page, and
 * only that page: nothing else the site renders shows the body. It never
 * touches `published` — an unpublished text stays a draft.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  let payload: { picks?: unknown; action?: unknown; loadedAt?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const action = payload.action as Action
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  const picks = Array.isArray(payload.picks)
    ? payload.picks.map((p: { paragraph?: unknown; sentence?: unknown }) => ({
        paragraph: typeof p?.paragraph === 'number' ? p.paragraph : NaN,
        sentence: typeof p?.sentence === 'number' ? p.sentence : NaN,
      }))
    : null
  if (!picks) return NextResponse.json({ error: 'picks must be a list.' }, { status: 400 })
  if (action === 'approve' && picks.length === 0) {
    return NextResponse.json({ error: 'There are no breaks to apply. Hold the text instead.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data } = await supabase
    .from('texts')
    .select('id, slug, body, provenance_notes, paragraphs_draft, sections, sections_draft, updated_at')
    .eq('id', id)
    .maybeSingle()
  const text = data as {
    id: string
    slug: string
    body: string | null
    provenance_notes: string | null
    paragraphs_draft: unknown
    sections: unknown
    sections_draft: unknown
    updated_at: string | null
  } | null
  if (!text) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  // Draft-only writes leave updated_at alone (migration 038), so this moves
  // only when the text itself was edited after the page loaded.
  const loadedAt = typeof payload.loadedAt === 'string' ? payload.loadedAt : null
  if (!loadedAt || !text.updated_at || new Date(loadedAt).getTime() !== new Date(text.updated_at).getTime()) {
    return NextResponse.json(
      { error: 'The text has changed since this page loaded; nothing was saved. Reload and check the breaks.' },
      { status: 409 }
    )
  }
  if (draftState(text.paragraphs_draft) === 'applied') {
    return NextResponse.json({ error: 'These breaks have already been applied.' }, { status: 409 })
  }

  const body = text.body ?? ''
  const problems = validatePicks(body, picks) as string[]
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 })
  const doc = picks.length ? buildParagraphsDoc(body, picks) : { source: 'editorial', breaks: [] }

  if (action !== 'approve') {
    // Saving with every break removed is a decision that the text reads fine:
    // store it as held, or it would sit in "to review" with nothing to approve.
    const held = action === 'hold' || doc.breaks.length === 0
    const { error } = await supabase
      .from('texts')
      .update({ paragraphs_draft: held ? { ...doc, held: true } : doc })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, state: held ? 'held' : 'pending', breaks: doc.breaks.length })
  }

  let newBody: string
  try {
    newBody = applyBreaks(body, doc)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 })
  }

  // Every section that resolves today must still resolve after the breaks.
  for (const sectionsDoc of [text.sections, text.sections_draft]) {
    if (!sectionsDoc) continue
    const before = resolveSections(bodyBlocks(body), sectionsDoc).missing.length
    const after = resolveSections(bodyBlocks(newBody), sectionsDoc).missing.length
    if (after > before) {
      return NextResponse.json(
        { error: 'A break would hide one of this text’s editor’s sections (two paragraphs would open alike). Move or remove the break next to that section; nothing was changed.' },
        { status: 409 }
      )
    }
  }

  const now = new Date().toISOString()
  const { data: written, error } = await supabase
    .from('texts')
    .update({
      body: newBody,
      provenance_notes: withProvenanceLine(text.provenance_notes),
      paragraphs_draft: { ...doc, applied_at: now },
      updated_at: now,
    })
    .eq('id', id)
    .eq('updated_at', text.updated_at)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!written?.length) {
    return NextResponse.json(
      { error: 'The text was edited while you were reviewing; nothing was changed. Reload and check the breaks.' },
      { status: 409 }
    )
  }

  revalidatePaths([`/texts/${text.slug}`])
  return NextResponse.json({ ok: true, state: 'applied', breaks: doc.breaks.length })
}
