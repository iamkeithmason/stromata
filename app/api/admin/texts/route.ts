import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const payload = await request.json()
  const {
    title,
    slug,
    author_id,
    genre_slug,
    theme_slugs,
    source_attribution,
    provenance_notes,
    translation_notes,
    ocr_quality,
    body: textBody,
    published,
  } = payload

  if (!title || !slug || !author_id || !genre_slug || !textBody) {
    return NextResponse.json({ error: 'Required fields missing.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: genre } = await supabase
    .from('genres')
    .select('id')
    .eq('slug', genre_slug)
    .single()

  if (!genre) {
    return NextResponse.json({ error: 'Invalid genre.' }, { status: 400 })
  }

  const { data: text, error: textError } = await supabase
    .from('texts')
    .insert({
      title,
      slug,
      author_id,
      genre_id: genre.id,
      body: textBody,
      source_attribution: source_attribution || null,
      provenance_notes: provenance_notes || null,
      translation_notes: translation_notes || null,
      ocr_quality: ocr_quality || null,
      published: published ?? false,
    })
    .select('id')
    .single()

  if (textError) return NextResponse.json({ error: textError.message }, { status: 500 })

  if (theme_slugs && theme_slugs.length > 0) {
    const { data: themes } = await supabase
      .from('themes')
      .select('id')
      .in('slug', theme_slugs)

    if (themes && themes.length > 0) {
      await supabase
        .from('text_themes')
        .insert(themes.map((t: { id: number }) => ({ text_id: text.id, theme_id: t.id })))
    }
  }

  return NextResponse.json({ ok: true })
}
