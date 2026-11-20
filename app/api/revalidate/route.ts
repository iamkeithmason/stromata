import { NextRequest, NextResponse } from 'next/server'
import { revalidatePaths } from '@/lib/publishing/publish-text'
import { scheduleTextPdfRebuilds, textSlugsIn } from '@/lib/pdf/text-pdf-schedule'
import { parseRevalidateBody, secretMatches } from '@/lib/cache/revalidate-request'

/**
 * Refresh named public pages after a CLI script has edited the database.
 *
 *   POST /api/revalidate
 *   x-revalidate-secret: <REVALIDATE_SECRET>
 *   { "texts": ["slug-a", "slug-b"], "paths": ["/", "/texts"] }
 *
 * Called by `scripts/lib/revalidate.mjs`; see `lib/cache/revalidate-request.ts`
 * for what it accepts and why it refuses route-wide purges. Outside
 * `/api/admin`, so the admin cookie middleware does not apply; the shared
 * secret is the whole of its authorisation, and with no secret configured it
 * answers 503 to everyone.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const configured = process.env.REVALIDATE_SECRET
  if (!configured) {
    return NextResponse.json({ error: 'Revalidation is not configured.' }, { status: 503 })
  }
  if (!secretMatches(request.headers.get('x-revalidate-secret'), configured)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const parsed = parseRevalidateBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  revalidatePaths(parsed.paths)
  // CLI scripts name exactly the texts they edited, so their PDFs follow.
  scheduleTextPdfRebuilds(textSlugsIn(parsed.paths))
  return NextResponse.json({ ok: true, revalidated: parsed.paths.length })
}
