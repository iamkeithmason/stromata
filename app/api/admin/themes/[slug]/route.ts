import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ slug: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const body = await req.json()

  const plainLanguageSubtitle: string | null = body.plain_language_subtitle ?? null

  const supabase = createServerClient()

  const { error } = await supabase
    .from('themes')
    .update({ plain_language_subtitle: plainLanguageSubtitle })
    .eq('slug', slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
