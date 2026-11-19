import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { revalidateEntity } from '@/lib/publishing/revalidate-entities'

type Params = { params: Promise<{ slug: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const body = await req.json()

  const update: Record<string, unknown> = { description: body.description ?? null }

  // Plate fields (migration 035) are sent only when the plate section of the
  // form was touched, so saving a description works before the migration runs.
  if ('plate_url' in body) {
    const plateUrl: string | null = body.plate_url || null
    const credit: string | null = (body.plate_credit ?? '').trim() || null
    const focus = body.plate_focus_y == null ? null : Math.round(Number(body.plate_focus_y))
    if (plateUrl && !credit) {
      return NextResponse.json({ error: 'A replacement plate needs a credit line (what it is, where it is held, its licence).' }, { status: 400 })
    }
    if (focus != null && (Number.isNaN(focus) || focus < 0 || focus > 100)) {
      return NextResponse.json({ error: 'Focus must be between 0 and 100.' }, { status: 400 })
    }
    update.plate_url = plateUrl
    update.plate_credit = plateUrl ? credit : null
    update.plate_focus_y = focus
  }

  const supabase = createServerClient()

  const { error } = await supabase
    .from('eras')
    .update(update)
    .eq('slug', slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateEntity('era', [slug])
  return NextResponse.json({ ok: true })
}
