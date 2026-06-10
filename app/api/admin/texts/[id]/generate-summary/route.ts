import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts.

Write 1–2 complete sentences. Hard limit: 160 characters total — count carefully before responding. Every sentence must end with a period. If a sentence would push the total past 160 characters, write a shorter sentence instead. Never cut off mid-sentence or use ellipses.

Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read".

Return only the summary, with no preamble or explanation.`

/** Trim only at a real sentence boundary — never append ellipses to a cut sentence. */
function trimToLength(text: string, max: number): string {
  if (text.length <= max) return text
  const truncated = text.slice(0, max)
  const lastEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'))
  if (lastEnd > 0) return truncated.slice(0, lastEnd + 1).trim()
  return truncated.trim()
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

  /** Generate with retry: tighten char limit if model still runs long (160→140→120→100). */
  async function generateWithRetry(maxChars: number, attempt: number): Promise<string> {
    const prompt = SUMMARY_PROMPT.replace('160 characters', `${maxChars} characters`)
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: prompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    const result = trimToLength((message.content[0] as { text: string }).text.trim(), maxChars)
    const truncated = !result.match(/[.!?]$/)
    if (truncated && attempt < 4) {
      return generateWithRetry(maxChars - 20, attempt + 1)
    }
    return result
  }

  let summary: string
  try {
    summary = await generateWithRetry(160, 1)
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
