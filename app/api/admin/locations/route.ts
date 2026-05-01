import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, slug')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, slug, alternative_names, lat, lng, description } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('locations').insert({
    name,
    slug,
    alternative_names: alternative_names || null,
    lat: lat ? Number(lat) : null,
    lng: lng ? Number(lng) : null,
    description: description || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
