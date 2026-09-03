import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// Copies an author portrait into Supabase Storage (the 'authors' bucket) and
// returns its public URL. Two input shapes:
//
//   • JSON  { sourceUrl, slug? }        — fetch a Wikimedia image server-side
//   • multipart form-data { file, slug? } — a manual upload from the admin form
//
// We store our own copy rather than hot-linking so the site never depends on an
// external URL. The service-role client bypasses RLS, so the public bucket needs
// no extra storage policies.

const BUCKET = 'authors'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Only fetch remote images from Wikimedia/Wikipedia — a basic SSRF guard so this
// route can't be pointed at internal hosts.
function isAllowedSource(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const h = url.hostname.toLowerCase()
  return (
    h === 'wikimedia.org' ||
    h === 'wikipedia.org' ||
    h.endsWith('.wikimedia.org') ||
    h.endsWith('.wikipedia.org')
  )
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

function objectPath(slug: string | null, contentType: string): string {
  const ext = EXT_BY_TYPE[contentType] ?? 'jpg'
  const base = (slug || 'author').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'author'
  return `${base}-${Date.now()}.${ext}`
}

async function store(
  bytes: ArrayBuffer,
  contentType: string,
  slug: string | null,
  imageSource: string,
) {
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 5 MB.' }, { status: 400 })
  }
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'That file is not an image.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const path = objectPath(slug, contentType)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false })

  if (error) {
    return NextResponse.json({ error: `Storage upload failed: ${error.message}` }, { status: 500 })
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ image_url: data.publicUrl, image_source: imageSource })
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''

  // ── Manual upload: multipart form-data ────────────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    const slug = (form.get('slug') as string) || null
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    const bytes = await file.arrayBuffer()
    return store(bytes, file.type || 'image/jpeg', slug, 'Manual upload')
  }

  // ── Wikimedia fetch: JSON { sourceUrl, slug } ─────────────────────────────
  const body = await request.json().catch(() => null)
  const sourceUrl: string | undefined = body?.sourceUrl
  const slug: string | null = body?.slug ?? null

  if (!sourceUrl) {
    return NextResponse.json({ error: 'sourceUrl is required.' }, { status: 400 })
  }
  if (!isAllowedSource(sourceUrl)) {
    return NextResponse.json(
      { error: 'Image source must be a Wikimedia or Wikipedia URL.' },
      { status: 400 },
    )
  }

  let res: Response
  try {
    res = await fetch(sourceUrl, { headers: { 'User-Agent': 'TheStromata/1.0 (author portraits)' } })
  } catch {
    return NextResponse.json({ error: 'Could not reach the image source.' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Image source returned ${res.status}.` }, { status: 502 })
  }

  const fetchedType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  const bytes = await res.arrayBuffer()
  return store(bytes, fetchedType, slug, sourceUrl)
}
