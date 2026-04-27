import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { title, slug, author_id, description, published } = await request.json()

  if (!title || !slug) {
    return NextResponse.json({ error: 'Title and slug are required.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('collections')
    .update({
      title,
      slug,
      author_id: author_id || null,
      description: description || null,
      published: published ?? false,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
