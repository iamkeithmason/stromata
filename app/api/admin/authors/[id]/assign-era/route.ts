import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { era_slug } = await request.json()
  const supabase = createServerClient()

  let era_id: number | null = null
  if (era_slug) {
    const { data: era } = await supabase
      .from('eras')
      .select('id')
      .eq('slug', era_slug)
      .single()
    era_id = era?.id ?? null
  }

  const { error } = await supabase
    .from('authors')
    .update({ era_id })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
