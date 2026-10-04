import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateEntity } from '@/lib/publishing/revalidate-entities'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json()
  const { name, slug, alternative_names, lat, lng, description } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400 })
  }

  const supabase = createServerClient()
  // The slug before this save, so a rename also refreshes the old path.
  const { data: prior } = await supabase.from('locations').select('slug').eq('id', id).maybeSingle()
  const { error } = await supabase
    .from('locations')
    .update({
      name,
      slug,
      alternative_names: alternative_names || null,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      description: description || null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateEntity('location', [slug, prior?.slug])
  return NextResponse.json({ ok: true })
}
