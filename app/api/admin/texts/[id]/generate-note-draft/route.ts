import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { NOTE_PROMPT } from '@/scripts/lib/note-prompt.mjs'

type Params = { params: Promise<{ id: string }> }

function trimToCompleteSentence(text: string): string {
  const lastEnd = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'))
  if (lastEnd === -1) return text
  return text.slice(0, lastEnd + 1).trim()
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: text } = await supabase
    .from('texts')
    .select('title, body, author:authors(name)')
    .eq('id', id)
    .single()

  if (!text) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const authorName = (text.author as { name: string } | null)?.name ?? 'Unknown'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage = [
    `Title: ${text.title}`,
    `Author: ${authorName}`,
    '',
    (text.body as string).slice(0, 3000),
  ].join('\n')

  let draft: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 400,
      system: NOTE_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    draft = trimToCompleteSentence((message.content[0] as { text: string }).text.trim())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 })
  }

  const { error: writeError } = await supabase
    .from('texts')
    .update({ note_draft: draft })
    .eq('id', id)

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  return NextResponse.json({ note_draft: draft })
}
