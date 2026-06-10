import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts. Write 1–2 sentences, maximum 160 characters total. Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read". Return only the summary text, no preamble.`

function trimToLength(text: string, max: number): string {
  if (text.length <= max) return text
  const truncated = text.slice(0, max)
  const lastEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'))
  if (lastEnd > max * 0.7) return truncated.slice(0, lastEnd + 1).trim()
  const lastSpace = truncated.lastIndexOf(' ')
  return truncated.slice(0, lastSpace).trim() + '…'
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

  const authorName = (text.author as unknown as { name: string } | null)?.name ?? 'Unknown'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage = [
    `Title: ${text.title}`,
    `Author: ${authorName}`,
    '',
    (text.body as string).slice(0, 3000),
  ].join('\n')

  let summary: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    summary = trimToLength((message.content[0] as { text: string }).text.trim(), 160)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 })
  }

  const { error: writeError } = await supabase
    .from('texts')
    .update({ summary })
    .eq('id', id)

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  return NextResponse.json({ summary })
}
