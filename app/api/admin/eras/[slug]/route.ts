import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateEntity } from '@/lib/publishing/revalidate-entities'

type Params = { params: Promise<{ slug: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const body = await req.json()

  const description: string | null = body.description ?? null

  const supabase = createServerClient()

  const { error } = await supabase
    .from('eras')
    .update({ description })
    .eq('slug', slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateEntity('era', [slug])
  return NextResponse.json({ ok: true })
}
