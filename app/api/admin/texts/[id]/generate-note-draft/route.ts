import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { generateNoteWithCritic } from '@/scripts/lib/note-prompt.mjs'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select('title, body, author_id, author:authors(name)')
    .eq('id', id)
    .single()

  if (!text) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const authorName = (text.author as unknown as { name: string } | null)?.name ?? 'Unknown'

  // Sibling notes by the same author, so the critic loop can steer this note
  // away from repeating a cluster's shared openings/closings.
  let siblingNotes: string[] = []
  if (text.author_id) {
    const { data: siblings } = await supabase
      .from('texts')
      .select('note_draft')
      .eq('author_id', text.author_id)
      .neq('id', id)
      .not('note_draft', 'is', null)
    siblingNotes = (siblings ?? [])
      .map((s) => (s as { note_draft: string | null }).note_draft ?? '')
      .filter(Boolean)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let draft: string
  try {
    // Shared prompt + critic loop + truncation guard (scripts/lib/note-prompt.mjs).
    const result = await generateNoteWithCritic({
      anthropic,
      title: text.title as string,
      author: authorName,
      body: (text.body as string) ?? '',
      siblingNotes,
    })
    draft = result.note
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 })
  }

  if (!draft) {
    return NextResponse.json({ error: 'No usable note was produced. Try again.' }, { status: 502 })
  }

  const { error: writeError } = await supabase
    .from('texts')
    .update({ note_draft: draft })
    .eq('id', id)

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  return NextResponse.json({ note_draft: draft })
}
