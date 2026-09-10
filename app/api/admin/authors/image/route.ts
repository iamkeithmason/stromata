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

// Width we ask Wikimedia to resize a portrait down to before fetching. Author
// portraits are never displayed larger than a single column, so ~1024px is
// generous — and it keeps a JPEG comfortably under a few hundred KB, well below
// MAX_BYTES, so full-resolution museum scans no longer trip the size guard.
const WIKIMEDIA_THUMB_WIDTH = 1024

// Rewrite an upload.wikimedia.org file URL to a bounded-width thumbnail, so we
// never download the multi-megabyte original. Returns null when the URL isn't a
// Wikimedia upload URL or isn't a shape we recognise — the caller then falls
// back to fetching the source as given (the MAX_BYTES guard still applies).
//
//   original:  /wikipedia/commons/a/ab/File.jpg
//              → /wikipedia/commons/thumb/a/ab/File.jpg/1024px-File.jpg
//   thumbnail: /wikipedia/commons/thumb/a/ab/File.jpg/320px-File.jpg
//              → …/1024px-File.jpg   (just swap the width prefix)
function boundedWikimediaUrl(raw: string, width: number): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'upload.wikimedia.org') return null

  const parts = url.pathname.split('/') // ['', 'wikipedia', 'commons', 'a', 'ab', 'File.jpg', …]
  if (parts[1] !== 'wikipedia' || parts.length < 6) return null
  const filename = parts[parts.length - 1]
  if (!filename) return null

  if (parts.includes('thumb')) {
    // Already a thumbnail: the last segment is `<n>px-<suffix>` — swap the width.
    if (!/^\d+px-/.test(filename)) return null
    parts[parts.length - 1] = filename.replace(/^\d+px-/, `${width}px-`)
  } else {
    // Original: insert `thumb` after the project segment, append the sized name.
    parts.splice(3, 0, 'thumb')
    parts.push(`${width}px-${filename}`)
  }
  url.pathname = parts.join('/')
  return url.toString()
}

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

  const fetchImage = (u: string): Promise<Response | null> =>
    fetch(u, { headers: { 'User-Agent': 'TheStromata/1.0 (author portraits)' } }).catch(() => null)

  // Prefer a bounded-width thumbnail so an oversized original never trips the
  // size guard; fall back to the source as given if the thumbnail can't be
  // built or doesn't resolve (e.g. an SVG original, whose vector file is small).
  const bounded = boundedWikimediaUrl(sourceUrl, WIKIMEDIA_THUMB_WIDTH)
  let res = bounded ? await fetchImage(bounded) : null
  if (!res || !res.ok) {
    res = await fetchImage(sourceUrl)
  }

  if (!res) {
    return NextResponse.json({ error: 'Could not reach the image source.' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Image source returned ${res.status}.` }, { status: 502 })
  }

  const fetchedType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  const bytes = await res.arrayBuffer()
  // Record the original file as the provenance source, not the thumbnail URL.
  return store(bytes, fetchedType, slug, sourceUrl)
}
