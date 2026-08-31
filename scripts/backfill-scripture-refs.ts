/**
 * backfill-scripture-refs.ts — Populate text_scripture_references from bodies.
 *
 * Parses every text's Markdown body with lib/scripture and writes one row per
 * distinct scripture reference (deduplicated by OSIS within the text) into the
 * text_scripture_references table. This is both the one-time backfill for the
 * existing corpus and the incremental step run after each pipeline import — by
 * default it only processes texts that have no references indexed yet, so it is
 * safe and cheap to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-scripture-refs.ts             # index texts not yet indexed
 *   npx tsx scripts/backfill-scripture-refs.ts --force     # re-index every text (drop + rebuild)
 *   npx tsx scripts/backfill-scripture-refs.ts --slug=foo  # index a single text by slug
 *   npx tsx scripts/backfill-scripture-refs.ts --dry-run   # report only; no writes
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

import { parseReferences } from '../lib/scripture'
import type { ScriptureRef } from '../lib/scripture'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(url, key)

interface TextRow {
  id: string
  slug: string
  body: string
}

interface RefRow {
  text_id: string
  osis: string
  book: string
  chapter: number
  verse_start: number | null
  verse_end: number | null
  raw: string
}

/** Collapse repeated citations of the same reference in one text to one row each. */
function toRows(textId: string, refs: ScriptureRef[]): RefRow[] {
  const byOsis = new Map<string, RefRow>()
  for (const r of refs) {
    if (byOsis.has(r.osis)) continue
    byOsis.set(r.osis, {
      text_id: textId,
      osis: r.osis,
      book: r.book,
      chapter: r.chapter,
      verse_start: r.verse,
      verse_end: r.verseEnd,
      raw: r.raw.trim().slice(0, 200),
    })
  }
  return [...byOsis.values()]
}

async function selectTexts(): Promise<TextRow[]> {
  if (slugArg) {
    const { data, error } = await supabase.from('texts').select('id, slug, body').eq('slug', slugArg)
    if (error) throw error
    return data ?? []
  }

  const { data, error } = await supabase.from('texts').select('id, slug, body')
  if (error) throw error
  const texts = (data ?? []) as TextRow[]

  if (force) return texts

  // Incremental: skip texts that already have references indexed.
  const { data: existing, error: exErr } = await supabase
    .from('text_scripture_references')
    .select('text_id')
  if (exErr) throw exErr
  const indexed = new Set((existing ?? []).map((r: { text_id: string }) => r.text_id))
  return texts.filter((t) => !indexed.has(t.id))
}

async function chunkedUpsert(rows: RefRow[]): Promise<void> {
  const size = 500
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase
      .from('text_scripture_references')
      .upsert(rows.slice(i, i + size), { onConflict: 'text_id,osis', ignoreDuplicates: true })
    if (error) throw error
  }
}

async function main() {
  const texts = await selectTexts()
  console.log(
    `Processing ${texts.length} text(s)` +
      (slugArg ? ` (slug=${slugArg})` : force ? ' (force re-index)' : ' (new/unindexed only)') +
      (dryRun ? ' [dry run]' : '')
  )

  let totalRefs = 0
  let textsWithRefs = 0
  for (const text of texts) {
    const rows = toRows(text.id, parseReferences(text.body || ''))
    if (rows.length === 0) continue
    textsWithRefs++
    totalRefs += rows.length

    if (dryRun) {
      console.log(`  ${text.slug.padEnd(40)} ${rows.length} refs`)
      continue
    }

    if (force) {
      const { error } = await supabase.from('text_scripture_references').delete().eq('text_id', text.id)
      if (error) throw error
    }
    await chunkedUpsert(rows)
    console.log(`  ${text.slug.padEnd(40)} ${rows.length} refs`)
  }

  console.log(
    `\nDone. ${textsWithRefs} text(s) with references, ${totalRefs} distinct references ${
      dryRun ? 'found' : 'written'
    }.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
