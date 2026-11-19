import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateText } from '@/lib/publishing/publish-text'
import { bodyBlocks, buildSectionsDoc, validatePicks } from '@/scripts/lib/sections.mjs'

type Params = { params: Promise<{ id: string }> }

/**
 * Save or approve one text's editor's sections.
 *
 * Takes picks ({ label, paragraph }) and turns them into anchors against the
 * body as it is now, so a saved section always points at text the body really
 * contains. Save writes `sections_draft`; Approve writes the same document to
 * `sections` too, and refreshes the text's pages: `sections` is public-facing
 * (the reader will render it), and pages are cached for a week (CLAUDE.md,
 * "Public pages are cached for a week").
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  let payload: { picks?: unknown; approve?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const picks = Array.isArray(payload.picks)
    ? payload.picks.map((p: { label?: unknown; paragraph?: unknown }) => ({
        label: typeof p?.label === 'string' ? p.label : '',
        paragraph: typeof p?.paragraph === 'number' ? p.paragraph : NaN,
      }))
    : null
  if (!picks) return NextResponse.json({ error: 'picks must be a list.' }, { status: 400 })
  const approve = payload.approve === true

  const supabase = createServerClient()
  const { data: text } = await supabase.from('texts').select('id, body').eq('id', id).maybeSingle()
  if (!text) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const blocks = bodyBlocks((text as { body: string | null }).body ?? '')
  const problems = validatePicks(picks, blocks.length) as string[]
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 })

  const doc = buildSectionsDoc(blocks, picks)
  const update = approve ? { sections_draft: doc, sections: doc } : { sections_draft: doc }
  const { error } = await supabase.from('texts').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (approve) await revalidateText(supabase, id)

  return NextResponse.json({ ok: true, approved: approve, sections: doc.sections.length })
}
