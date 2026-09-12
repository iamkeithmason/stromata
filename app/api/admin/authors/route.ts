import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('authors')
    .select('id, name')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, slug, tradition_slug, birth_year, death_year, era_slug, bio, bio_source,
    location_id, location, draft, image_url, image_source,
    image_focus_x, image_focus_y, image_zoom } = body

  if (!name || !tradition_slug) {
    return NextResponse.json({ error: 'Name and tradition are required.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: tradition } = await supabase
    .from('traditions')
    .select('id')
    .eq('slug', tradition_slug)
    .single()

  if (!tradition) {
    return NextResponse.json({ error: 'Invalid tradition.' }, { status: 400 })
  }

  let era_id: number | null = null
  if (era_slug) {
    const { data: era } = await supabase
      .from('eras')
      .select('id')
      .eq('slug', era_slug)
      .single()
    era_id = era?.id ?? null
  }

  const { error } = await supabase.from('authors').insert({
    name,
    slug: slug || null,
    tradition_id: tradition.id,
    birth_year: birth_year ?? null,
    death_year: death_year ?? null,
    era_id,
    bio: bio || null,
    bio_source: bio_source || null,
    location_id: location_id ?? null,
    location: location || null,
    draft: draft ?? false,
    image_url: image_url || null,
    image_source: image_source || null,
    image_focus_x: image_focus_x ?? 50,
    image_focus_y: image_focus_y ?? 50,
    image_zoom: image_zoom ?? 1,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
