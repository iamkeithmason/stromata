import { NextRequest, NextResponse } from 'next/server'
import { readQueue, writeQueue, upsertProspect, rejectProspect, type Prospect } from '@/lib/pipeline/queue'
import { availableActions } from '@/lib/pipeline/runner'
import { TRADITIONS, ERAS, GENRES, ALL_THEMES, MAX_THEMES, SOURCE_TYPES } from '@/lib/pipeline/vocab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reject controlled-vocab values the pipeline isn't allowed to invent
// (CLAUDE.md HARD CONSTRAINT 4 / 5).
function validate(p: Prospect): string | null {
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) return 'id must be a non-empty kebab-case slug.'
  if (p.tradition && !TRADITIONS.some(t => t.slug === p.tradition)) return `Unknown tradition "${p.tradition}".`
  if (p.era && !ERAS.some(e => e.slug === p.era)) return `Unknown era "${p.era}".`
  if (p.genre && !GENRES.includes(p.genre as (typeof GENRES)[number])) return `Unknown genre "${p.genre}".`
  if (p.source_type && !SOURCE_TYPES.includes(p.source_type as (typeof SOURCE_TYPES)[number])) return `Unknown source_type "${p.source_type}".`
  if (p.stage_3_themes) {
    if (p.stage_3_themes.length > MAX_THEMES) return `At most ${MAX_THEMES} themes per text.`
    const bad = p.stage_3_themes.find(t => !ALL_THEMES.includes(t))
    if (bad) return `Unknown theme "${bad}".`
  }
  return null
}

export async function GET() {
  try {
    const queue = await readQueue()
    // Decorate each prospect with the one-click actions it supports.
    const prospects = queue.prospects.map(p => ({ ...p, _actions: availableActions(p) }))
    return NextResponse.json({ prospects })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to read queue' }, { status: 500 })
  }
}

// Create or edit a prospect.
export async function POST(request: NextRequest) {
  try {
    const prospect = (await request.json()) as Prospect
    const invalid = validate(prospect)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const queue = await readQueue()
    await writeQueue(upsertProspect(queue, prospect))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save prospect' }, { status: 500 })
  }
}

// Status changes: reject (with reason) or a plain status set.
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: string; action?: 'reject'; reason?: string; status?: string }
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const queue = await readQueue()
    if (!queue.prospects.some(p => p.id === body.id)) {
      return NextResponse.json({ error: `No prospect "${body.id}"` }, { status: 404 })
    }

    if (body.action === 'reject') {
      await writeQueue(rejectProspect(queue, body.id, body.reason ?? 'Rejected via GUI'))
    } else if (body.status) {
      await writeQueue({
        ...queue,
        prospects: queue.prospects.map(p => (p.id === body.id ? { ...p, status: body.status! } : p)),
      })
    } else {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update prospect' }, { status: 500 })
  }
}
