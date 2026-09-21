import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { generateSummary } from '@/scripts/lib/summary-prompt.mjs'

type Params = { params: Promise<{ id: string }> }

/**
 * The "generate summary" button in the text edit form.
 *
 * The prompt, the 160-character guard and the self-correcting retry loop live
 * in scripts/lib/summary-prompt.mjs and are shared with the three CLI callers —
 * this route used to carry a fourth, TypeScript copy of all three, which is how
 * the register would have drifted between the form and the backfill scripts.
 * (Same arrangement as generate-note-draft/route.ts, which already imports its
 * critic loop from scripts/lib/note-prompt.mjs.)
 */
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

  let summary: string
  try {
    ;({ summary } = await generateSummary({
      anthropic,
      title: text.title as string,
      author: authorName,
      source: (text.body as string) ?? '',
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Claude API error: ${message}` }, { status: 502 })
  }

  if (!summary) {
    return NextResponse.json({ error: 'No usable summary was produced. Try again.' }, { status: 502 })
  }

  const { error: writeError } = await supabase
    .from('texts')
    .update({ summary })
    .eq('id', id)

  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  return NextResponse.json({ summary })
}
