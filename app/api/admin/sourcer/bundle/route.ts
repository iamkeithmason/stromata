import { NextRequest, NextResponse } from 'next/server'
import { readBundleFiles } from '@/lib/sourcer/staging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-only: returns the reviewable files of one staged Sourcer bundle. There
// is no corresponding write route — the Sourcer is the only writer of
// content/staging/, and confirming/editing a proposal happens by hand-editing
// metadata.yml (see scripts/sourcer/README.md), not through this admin view.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Valid slug required' }, { status: 400 })
  }
  try {
    const files = await readBundleFiles(slug)
    if (files.length === 0) return NextResponse.json({ error: `No staged bundle found for "${slug}".` }, { status: 404 })
    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to read bundle' }, { status: 500 })
  }
}
