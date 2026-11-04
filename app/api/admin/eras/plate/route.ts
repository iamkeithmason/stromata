import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createServerClient } from '@/lib/supabase/server'

// Uploads a replacement era plate to Supabase Storage (the 'plates' bucket,
// migration 035) and returns its public URL. The admin era form then saves the
// URL, a credit line and a focus point onto the era (PATCH /api/admin/eras/[slug]),
// and that save is what refreshes the public page.
//
// This route writes to Storage only, never to a table, so it changes nothing a
// public page renders until the era is saved.
//
// The plate is stored display-sized, as portraits are (CHANGELOG 2026-10-06):
// every reader's browser fetches it from Storage, so a 6000px museum scan would
// be egress on every era-page view. 2000px wide covers a 2x band on a laptop.

const BUCKET = 'plates'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // museum originals are large; we shrink before storing
const WIDTH = 2000

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const slug = ((form?.get('slug') as string) || 'era').replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'That file is not an image.' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 25 MB.' }, { status: 400 })
  }

  let jpeg: Buffer
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 78, progressive: true, mozjpeg: true })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Could not read that image.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const path = `${slug}-${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
  if (error) {
    return NextResponse.json({ error: `Storage upload failed: ${error.message}` }, { status: 500 })
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ plate_url: data.publicUrl })
}
