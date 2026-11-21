#!/usr/bin/env node
/**
 * backfill-translator-notes — put the NPNF/ANF translators' notes back into published texts.
 * Dry-run by default: reports, per text, how many of the volume's notes it could place exactly.
 *
 *   node scripts/backfill-translator-notes.mjs --collection=on-the-priesthood   # dry run, one work
 *   node scripts/backfill-translator-notes.mjs                                  # dry run, all NPNF/ANF texts
 *   node scripts/backfill-translator-notes.mjs --slug=on-the-priesthood-book-i --write
 *   node scripts/backfill-translator-notes.mjs --json=<file>                    # write the report as JSON
 *
 * Card: Import translators' notes into published NPNF/ANF texts. The method and its guarantees are in
 * scripts/lib/translator-notes.mjs: notes come from CCEL's plain-text export of the volume the text's
 * `source_attribution` cites; each marker is placed by the words around it or not at all; the body
 * is byte-identical outside the inserted `[^n]` and the definitions block.
 *
 * --write is refused for any text with an unplaced marker, a garbled definition, existing footnotes,
 * or a body that changes outside the notes. It needs SUPABASE_SERVICE_ROLE_KEY and calls
 * revalidateSite() for the slugs it changed. **Run it only with Keith's approval** (the card's last
 * step): it edits published bodies.
 *
 * METERS: Supabase egress for the bodies read (all ~410 texts: ~25 MB, about 0.5% of the 5 GB cycle
 * shared with Paideia; a dry run costs the same). CCEL: one download per volume (~3 MB each, ~35
 * volumes), cached under data/ccel/ (gitignored) so a rerun downloads nothing.
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  applyNotes, ccelUrl, isScriptureOnly, locateSpan, looksGarbled, placeMarkers, readDefinitions, stripNotes, volumeFor,
} from './lib/translator-notes.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false, quiet: true })

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const write = args.write === true
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = write ? process.env.SUPABASE_SERVICE_ROLE_KEY : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
if (!url || !key) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or ${write ? 'SUPABASE_SERVICE_ROLE_KEY' : 'a Supabase key'}`)
  process.exit(1)
}
const supabase = createClient(url, key)
const CACHE = path.join(ROOT, 'data', 'ccel')

async function volumeText(vol) {
  mkdirSync(CACHE, { recursive: true })
  const file = path.join(CACHE, `${vol}.txt`)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(ccelUrl(vol), { headers: { 'user-agent': 'stromata-notes-backfill' } })
  if (!res.ok) throw new Error(`CCEL ${vol}: HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(file, text)
  return text
}

async function texts() {
  let q = supabase.from('texts')
    .select('id, slug, body, source_attribution, collection:collections(slug)')
    .eq('published', true)
    .or('source_attribution.ilike.%NPNF%,source_attribution.ilike.%ANF%,source_attribution.ilike.%Nicene%')
    .order('slug')
  if (args.slug) q = q.eq('slug', args.slug)
  // Filter on the server: a one-work run must not read every NPNF/ANF body (~25 MB) to keep six.
  if (args.collection) {
    const { data: c, error: ce } = await supabase.from('collections').select('id').eq('slug', args.collection).maybeSingle()
    if (ce) throw ce
    if (!c) return []
    q = q.eq('collection_id', c.id)
  }
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

const rows = []
for (const t of await texts()) {
  const row = { slug: t.slug, collection: t.collection?.slug ?? null, volume: volumeFor(t.source_attribution) }
  rows.push(row)
  if (!row.volume) { row.status = 'no-volume'; continue }
  if (/\[\^\d+\]/.test(t.body)) { row.status = 'has-footnotes'; continue }
  let vol
  try { vol = await volumeText(row.volume) } catch (e) { row.status = 'no-ccel'; row.detail = e.message; continue }
  const span = locateSpan(vol, t.body)
  if (!span) { row.status = 'not-located'; continue }
  const { placed, unmatched, total } = placeMarkers(span, t.body)
  const defs = readDefinitions(vol)
  row.markers = total
  row.placed = placed.length
  row.unmatched = unmatched
  row.missingDefs = placed.filter(p => !defs.has(p.n)).map(p => p.n)
  row.scriptureOnly = placed.filter(p => defs.has(p.n) && isScriptureOnly(defs.get(p.n))).length
  row.garbled = placed.filter(p => defs.has(p.n) && looksGarbled(defs.get(p.n))).map(p => p.n)
  row.status = total === 0 ? 'no-notes' : unmatched.length || row.missingDefs.length ? 'partial' : 'matched'
  if (row.status === 'matched') {
    const out = applyNotes(t.body, placed, defs)
    row.identical = stripNotes(out.body).trimEnd() === t.body.trimEnd()
    if (!row.identical) row.status = 'changed-text'
    if (write && row.status === 'matched' && !row.garbled.length) {
      const { error } = await supabase.from('texts').update({ body: out.body }).eq('id', t.id).eq('published', true)
      row.written = !error
      if (error) row.detail = error.message
    }
  }
}

const by = s => rows.filter(r => r.status === s).length
console.log(`${write ? 'WRITE' : 'DRY RUN'}: ${rows.length} NPNF/ANF text(s)\n`)
for (const r of rows) {
  const n = r.markers !== undefined ? ` ${r.placed}/${r.markers}` : ''
  const extra = r.unmatched?.length ? `  unplaced: ${r.unmatched.slice(0, 3).map(u => `[${u.n}] "…${u.context}"`).join('; ')}${r.unmatched.length > 3 ? ' …' : ''}` : ''
  const flags = [r.garbled?.length ? `garbled [${r.garbled.join(',')}]` : '', r.written ? 'WRITTEN' : ''].filter(Boolean).join(' ')
  console.log(`  ${r.status.padEnd(13)} ${(r.volume ?? '-').padEnd(8)} ${r.slug}${n}${flags ? ` ${flags}` : ''}${extra}`)
}
const markers = rows.reduce((s, r) => s + (r.markers ?? 0), 0)
const placed = rows.reduce((s, r) => s + (r.placed ?? 0), 0)
console.log(`\nmatched ${by('matched')} · partial ${by('partial')} · no notes ${by('no-notes')} · not located ${by('not-located')} · no volume ${by('no-volume')} · no CCEL ${by('no-ccel')} · changed text ${by('changed-text')}`)
const scripture = rows.reduce((s, r) => s + (r.scriptureOnly ?? 0), 0)
console.log(`notes placed ${placed} of ${markers}${markers ? ` (${(100 * placed / markers).toFixed(1)}%)` : ''}; of those placed, ${scripture} are only a Scripture reference (New Advent already prints these inline)`)
if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2))

if (write) {
  const changed = rows.filter(r => r.written).map(r => r.slug)
  if (changed.length) {
    const { revalidateSite } = await import('./lib/revalidate.mjs')
    await revalidateSite({ texts: changed })
  }
}
