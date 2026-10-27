import { NextRequest, NextResponse } from 'next/server'
import { revalidateText } from '@/lib/publishing/publish-text'
import { createServerClient } from '@/lib/supabase/server'
import { themeCapError } from '@/lib/admin/theme-cap'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('texts')
    .select('*, genre:genres(slug), text_themes(theme:themes(slug))')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const payload = await request.json()
  const {
    title,
    slug,
    author_id,
    genre_slug,
    theme_slugs,
    collection_id,
    collection_order,
    source_url,
    source_attribution,
    provenance_notes,
    translation_notes,
    ocr_quality,
    summary,
    editorial_introduction,
    body: textBody,
    published,
    featured,
    featured_from,
    featured_note,
  } = payload

  if (!title || !slug || !author_id || !genre_slug || !textBody) {
    return NextResponse.json({ error: 'Required fields missing.' }, { status: 400 })
  }

  const capError = themeCapError(theme_slugs)
  if (capError) {
    return NextResponse.json({ error: capError }, { status: 400 })
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

  // Read before writing: if this save renames the text, /texts/{old-slug} keeps
  // serving its cached copy unless we revalidate that path too.
  const { data: prior } = await supabase.from('texts').select('slug').eq('id', id).maybeSingle()
  const priorSlug = (prior as { slug: string } | null)?.slug ?? null

  const { error: updateError } = await supabase
    .from('texts')
    .update({
      title,
      slug,
      author_id,
      genre_id: genre.id,
      body: textBody,
      collection_id: collection_id || null,
      collection_order: collection_order || null,
      source_url: source_url || null,
      source_attribution: source_attribution || null,
      provenance_notes: provenance_notes || null,
      translation_notes: translation_notes || null,
      ocr_quality: ocr_quality || null,
      summary: summary || null,
      editorial_introduction: editorial_introduction || null,
      published: published ?? false,
      featured: featured ?? false,
      featured_from: featured_from || null,
      featured_note: featured_note || null,
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Replace theme junctions
  await supabase.from('text_themes').delete().eq('text_id', id)

  if (theme_slugs && theme_slugs.length > 0) {
    const { data: themes } = await supabase
      .from('themes')
      .select('id')
      .in('slug', theme_slugs)

    if (themes && themes.length > 0) {
      await supabase
        .from('text_themes')
        .insert(themes.map((t: { id: number }) => ({ text_id: id, theme_id: t.id })))
    }
  }

  // One shared surface list (lib/publishing/publish-text.ts), not an inline one
  // per route. `priorSlug` clears the old path when the slug was just renamed.
  await revalidateText(supabase, id, [priorSlug])

  return NextResponse.json({ ok: true })
}
