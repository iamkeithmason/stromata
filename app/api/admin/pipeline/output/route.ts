import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { TRADITIONS, ERAS, GENRES, ALL_THEMES, MAX_THEMES } from '@/lib/pipeline/vocab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'ingestion', 'output')

// Keep every read/write inside the output directory — never let a slug escape it.
function resolveInOutput(rel: string): string {
  const full = path.resolve(OUTPUT_DIR, rel)
  if (full !== OUTPUT_DIR && !full.startsWith(OUTPUT_DIR + path.sep)) {
    throw new Error('Path escapes the output directory.')
  }
  return full
}

// Collect the staged output file(s) for a slug: either output/{slug}.md
// (single) or output/{slug}/*.md (multi-chapter collection).
async function outputFiles(slug: string): Promise<string[]> {
  const files: string[] = []
  const flat = path.join(OUTPUT_DIR, `${slug}.md`)
  try {
    await fs.access(flat)
    files.push(`${slug}.md`)
  } catch {
    /* no flat file */
  }
  const dir = path.join(OUTPUT_DIR, slug)
  try {
    const stat = await fs.stat(dir)
    if (stat.isDirectory()) {
      const entries = await fs.readdir(dir)
      for (const e of entries.filter(e => e.endsWith('.md')).sort()) files.push(`${slug}/${e}`)
    }
  } catch {
    /* no dir */
  }
  return files
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Valid slug required' }, { status: 400 })
  }
  try {
    const rels = await outputFiles(slug)
    if (rels.length === 0) return NextResponse.json({ files: [] })
    const files = await Promise.all(
      rels.map(async rel => ({ name: rel, content: await fs.readFile(resolveInOutput(rel), 'utf8') }))
    )
    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to read output' }, { status: 500 })
  }
}

// --- frontmatter editing (scalar fields + inline themes array) ---

function frontmatterBounds(lines: string[]): { end: number } | null {
  if (lines[0]?.trim() !== '---') return null
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return { end: i }
  return null
}

function setScalar(lines: string[], end: number, key: string, value: string): void {
  const line = `${key}: "${value.replace(/"/g, '\\"')}"`
  for (let i = 1; i < end; i++) {
    if (lines[i].match(new RegExp(`^${key}:`))) {
      lines[i] = line
      return
    }
  }
  lines.splice(end, 0, line) // insert before closing ---
}

function setThemes(lines: string[], end: number, themes: string[]): number {
  const inline = `themes: [${themes.join(', ')}]`
  // Remove any existing `themes:` line plus trailing `  - item` list lines.
  for (let i = 1; i < end; i++) {
    if (lines[i].match(/^themes:/)) {
      let last = i
      while (last + 1 < end && lines[last + 1].match(/^\s*-\s/)) last++
      lines.splice(i, last - i + 1, inline)
      return end - (last - i) // block shrank
    }
  }
  lines.splice(end, 0, inline)
  return end + 1
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      file: string
      genre?: string
      tradition?: string
      era?: string
      themes?: string[]
    }
    if (!body.file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    // Validate against controlled vocabularies before touching the file.
    if (body.genre && !GENRES.includes(body.genre as (typeof GENRES)[number])) return NextResponse.json({ error: `Unknown genre "${body.genre}".` }, { status: 400 })
    if (body.tradition && !TRADITIONS.some(t => t.slug === body.tradition)) return NextResponse.json({ error: `Unknown tradition "${body.tradition}".` }, { status: 400 })
    if (body.era && !ERAS.some(e => e.slug === body.era)) return NextResponse.json({ error: `Unknown era "${body.era}".` }, { status: 400 })
    if (body.themes) {
      if (body.themes.length > MAX_THEMES) return NextResponse.json({ error: `At most ${MAX_THEMES} themes.` }, { status: 400 })
      const bad = body.themes.find(t => !ALL_THEMES.includes(t))
      if (bad) return NextResponse.json({ error: `Unknown theme "${bad}".` }, { status: 400 })
    }

    const full = resolveInOutput(body.file)
    const content = await fs.readFile(full, 'utf8')
    const lines = content.split('\n')
    const bounds = frontmatterBounds(lines)
    if (!bounds) return NextResponse.json({ error: 'No frontmatter block found in file.' }, { status: 422 })

    let end = bounds.end
    if (body.genre !== undefined) setScalar(lines, end, 'genre', body.genre)
    if (body.tradition !== undefined) setScalar(lines, end, 'tradition', body.tradition)
    if (body.era !== undefined) setScalar(lines, end, 'era', body.era)
    // recompute end in case scalars were inserted
    const b2 = frontmatterBounds(lines)
    end = b2 ? b2.end : end
    if (body.themes !== undefined) setThemes(lines, end, body.themes)

    await fs.writeFile(full, lines.join('\n'), 'utf8')
    return NextResponse.json({ ok: true, content: lines.join('\n') })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to edit frontmatter' }, { status: 500 })
  }
}
