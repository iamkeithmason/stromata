import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateAuthorPage } from '@/lib/authors/revalidate'
import { candidatesFor, cleanPick, validatePick } from '@/scripts/lib/begin-with.mjs'

type Params = { params: Promise<{ id: string }> }

/**
 * Save, approve, skip or remove one author's Begin with pick.
 *
 *   { action: 'save',    pick }  → begin_with_draft only
 *   { action: 'approve', pick }  → begin_with_draft and begin_with (live); refreshes the author page
 *   { action: 'skip' }           → no pick for this author: begin_with cleared, draft marked skipped,
 *                                  so the drafting script does not draft one again
 *
 * The pick is checked against the author's published works as they are now,
 * with the same rules the drafting script used (scripts/lib/begin-with.mjs).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  let payload: { action?: unknown; pick?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }
  const action = payload.action
  if (action !== 'save' && action !== 'approve' && action !== 'skip') {
    return NextResponse.json({ error: 'action must be save, approve or skip.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: author } = await supabase.from('authors').select('id, slug').eq('id', id).maybeSingle()
  if (!author) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const slug = (author as { slug: string | null }).slug

  if (action === 'skip') {
    const { error } = await supabase
      .from('authors')
      .update({ begin_with: null, begin_with_draft: { skipped: true } })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateAuthorPage(slug)
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Metadata only: no bodies.
  const { data: texts } = await supabase
    .from('texts')
    .select('slug, title, word_count, summary, collection_id, genre:genres(name)')
    .eq('author_id', id)
    .eq('published', true)
  const rows = ((texts ?? []) as unknown as { slug: string; title: string; word_count: number | null; summary: string | null; collection_id: string | null; genre: { name: string } | null }[])
    .map(t => ({ ...t, genre: t.genre?.name ?? null }))
  const collectionIds = [...new Set(rows.map(t => t.collection_id).filter(Boolean))] as string[]
  const { data: collections } = collectionIds.length
    ? await supabase.from('collections').select('id, slug, title, description, published').in('id', collectionIds)
    : { data: [] }

  const candidates = candidatesFor(rows, collections ?? [])
  const problems = validatePick(payload.pick, candidates) as string[]
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 })

  const pick = cleanPick(payload.pick)
  const update = action === 'approve' ? { begin_with_draft: pick, begin_with: pick } : { begin_with_draft: pick }
  const { error } = await supabase.from('authors').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action === 'approve') revalidateAuthorPage(slug)
  return NextResponse.json({ ok: true, approved: action === 'approve' })
}
