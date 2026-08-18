import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { readQueue, type Prospect } from '@/lib/pipeline/queue'
import { detectChapters, cleanBody, splitToFiles } from '@/scripts/ingestion/split-into-chapters.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INGEST = path.join(process.cwd(), 'scripts', 'ingestion')
const OUTPUT = path.join(INGEST, 'output')

// Find the single long source text to split: raw OCR, a flat output file, or a
// lone file in the output dir. Returns { raw, cleanup } — cleanup lists the
// non-chapter files to delete after a successful split.
async function resolveSource(slug: string): Promise<{ raw: string; cleanup: string[] } | null> {
  const rawPath = path.join(INGEST, 'sources', `${slug}-raw.txt`)
  try {
    return { raw: await fs.readFile(rawPath, 'utf8'), cleanup: [] }
  } catch {
    /* no raw OCR */
  }
  const flat = path.join(OUTPUT, `${slug}.md`)
  try {
    const raw = await fs.readFile(flat, 'utf8')
    return { raw, cleanup: [flat] }
  } catch {
    /* no flat file */
  }
  const dir = path.join(OUTPUT, slug)
  try {
    const entries = (await fs.readdir(dir)).filter(e => e.endsWith('.md') && !e.endsWith('_review-summary.md'))
    if (entries.length === 1) {
      const p = path.join(dir, entries[0])
      return { raw: await fs.readFile(p, 'utf8'), cleanup: [p] }
    }
  } catch {
    /* no dir */
  }
  return null
}

// Metadata for the per-chapter frontmatter, derived from the prospect.
function cfgFromProspect(p: Prospect) {
  let host = ''
  try { host = new URL(p.source_url ?? '').hostname.replace(/^www\./, '') } catch { /* */ }
  const translationNotes = p.translator
    ? `${p.translator}${p.translator_death_year ? ` (d. ${p.translator_death_year})` : ''}. Public-domain translation.`
    : ''
  return {
    slug: p.collection_slug || p.id,
    title: p.title || p.id,
    author: p.author || '',
    genre: p.genre || '',
    sourceAttribution: host ? `Sourced from ${host}.` : '',
    translationNotes,
    provenanceNotes: host ? `Text sourced from ${host}. Accessed ${new Date().toISOString().slice(0, 7)}.` : '',
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Splitting is disabled in production; run locally with `npm run dev`.' }, { status: 403 })
  }
  const body = (await request.json()) as { prospectId?: string; write?: boolean }
  if (!body.prospectId) return NextResponse.json({ error: 'prospectId required' }, { status: 400 })

  const queue = await readQueue()
  const prospect = queue.prospects.find(p => p.id === body.prospectId)
  if (!prospect) return NextResponse.json({ error: `No prospect "${body.prospectId}"` }, { status: 404 })

  const slug = prospect.collection_slug || prospect.id
  const src = await resolveSource(slug)
  if (!src) return NextResponse.json({ error: `No single source text found to split for "${slug}". Fetch/clean it first.` }, { status: 404 })

  // Preview: detect boundaries + per-chapter word/note counts, no writes.
  if (!body.write) {
    const det = detectChapters(src.raw)
    const chapters = det.chapters.map((c: { order: number; number: string; title: string; hadTitle: boolean; rawBody: string }) => {
      const { body: b, notes } = cleanBody(c.rawBody)
      return { order: c.order, number: c.number, title: c.title, hadTitle: c.hadTitle, words: b.split(/\s+/).filter(Boolean).length, notes: notes.length }
    })
    return NextResponse.json({ chapters, warnings: det.warnings, frontMatterLines: det.frontMatterLines })
  }

  // Write: split into per-chapter files, then remove the old single file(s).
  const res = splitToFiles(src.raw, cfgFromProspect(prospect), {})
  if (res.skipped) return NextResponse.json({ error: res.warnings.join(' ') }, { status: 422 })
  for (const f of src.cleanup) {
    try { await fs.unlink(f) } catch { /* already gone */ }
  }
  const written = (res.chapters as { order: number; title: string; words: number; noteCount: number }[]).map(c => ({ order: c.order, title: c.title, words: c.words, notes: c.noteCount }))
  return NextResponse.json({ written: res.written, warnings: res.warnings, chapters: written })
}
