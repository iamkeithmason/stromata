import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, slug, title, published, author:authors(name)')
    .order('title')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { title, slug, author_id, description, published } = await request.json()

  if (!title || !slug) {
    return NextResponse.json({ error: 'Title and slug are required.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('collections').insert({
    title,
    slug,
    author_id: author_id || null,
    description: description || null,
    published: published ?? false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
