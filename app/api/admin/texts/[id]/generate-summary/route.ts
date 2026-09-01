import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts.

Write 1–2 complete sentences. Hard limit: 160 characters total — count carefully before responding. Every sentence must end with a period. If a sentence would push the total past 160 characters, write a shorter sentence instead. Never cut off mid-sentence or use ellipses.

Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read".

Return only the summary, with no preamble or explanation.`

/**
 * Reduce to the longest run of whole sentences that fits within `max`.
 * Never cuts mid-sentence; only if a single sentence already exceeds `max`
 * does it fall back to a word-boundary cut, so a word is never split.
 */
function trimToLength(text: string, max: number): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? []
  let out = ''
  for (const sentence of sentences) {
    if ((out + sentence).length > max) break
    out += sentence
  }
  out = out.trim()
  if (out) return out
  // No whole sentence fits — cut at the last word boundary, never mid-word.
  const slice = clean.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()
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

  /**
   * Generate a summary. If the model overshoots 160 characters or stops
   * mid-sentence, hand its own draft back with the exact character count and
   * ask it to rewrite shorter. Feeding the overshoot back lets the model
   * self-correct — far more reliable than silently re-trimming a hidden,
   * ever-tighter limit, which is what produced summaries cut off mid-word.
   * Only if every attempt overshoots do we fall back to a clean trim.
   */
  async function generateSummary(): Promise<string> {
    const conversation: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]
    let fallback = ''
    let lastTrim = ''
    for (let attempt = 1; attempt <= 4; attempt++) {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: SUMMARY_PROMPT,
        messages: conversation,
      })
      const candidate = (message.content[0] as { text: string }).text.trim()
      // Accept the model's own output whenever it fits and ends a sentence.
      if (candidate.length <= 160 && /[.!?]$/.test(candidate)) return candidate
      // Otherwise remember the best complete-sentence version seen so far.
      lastTrim = trimToLength(candidate, 160)
      if (/[.!?]$/.test(lastTrim) && lastTrim.length >= fallback.length) fallback = lastTrim
      conversation.push({ role: 'assistant', content: candidate })
      conversation.push({
        role: 'user',
        content: `That draft was ${candidate.length} characters. Rewrite it as one or two complete sentences, each ending in a period, totalling 160 characters or fewer. Return only the summary.`,
      })
    }
    return fallback || lastTrim
  }

  let summary: string
  try {
    summary = await generateSummary()
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
