/**
 * shrink-author-portraits.mjs — replace oversized portraits with display-sized copies
 *
 * The `authors` storage bucket held 76 images totalling ~55 MB (mean ~730 KB,
 * largest ~5 MB), each served full-size from Supabase Storage to every reader
 * who opened that author's page or text. The admin upload route now shrinks new
 * portraits (scripts/lib/portrait-resize.mjs); this applies the same rule to
 * the portraits already in the bucket. See CHANGELOG 2026-10-06.
 *
 * What --write does, per author whose portrait is over the threshold:
 *   1. downloads the original (one-off egress: the oversized files only, ~45 MB)
 *   2. shrinks it, and skips it unless the result is at least 20% smaller
 *   3. uploads the copy under a NEW path (`<original-name>-sm.<ext>`)
 *   4. points `authors.image_url` at the copy
 * The original object is left in place, so nothing breaks while cached pages
 * still reference it and the change is reversible by restoring image_url.
 * Pages pick the new URL up on their next regeneration — the next production
 * deploy refreshes them all; otherwise within the week-long cache window.
 *
 * Dry-run by default and costs no egress: it reads sizes from the bucket
 * listing and prints what would change. Needs .env.local (service-role key),
 * so it runs on Keith's machine.
 *
 * Usage:
 *   node scripts/shrink-author-portraits.mjs                 # preview
 *   node scripts/shrink-author-portraits.mjs --write         # apply
 *   node scripts/shrink-author-portraits.mjs --slug=<slug>   # one author
 *   node scripts/shrink-author-portraits.mjs --min-kb=150    # threshold (default 250)
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { shrinkPortrait } from './lib/portrait-resize.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const BUCKET = 'authors'
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`

const args = process.argv.slice(2)
const write = args.includes('--write')
const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1]
const minKb = Number(args.find((a) => a.startsWith('--min-kb='))?.split('=')[1] ?? 250)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const kb = (n) => `${Math.round(n / 1024)} KB`

/** The object name inside the bucket, or null for a portrait hosted elsewhere. */
function objectName(imageUrl) {
  if (!imageUrl) return null
  const i = imageUrl.indexOf(PUBLIC_PREFIX)
  return i === -1 ? null : decodeURIComponent(imageUrl.slice(i + PUBLIC_PREFIX.length).split('?')[0])
}

async function listBucket() {
  const sizes = new Map()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000, offset })
    if (error) throw new Error(`Could not list the ${BUCKET} bucket: ${error.message}`)
    for (const o of data) sizes.set(o.name, { size: o.metadata?.size ?? 0, type: o.metadata?.mimetype })
    if (data.length < 1000) return sizes
  }
}

async function main() {
  let query = supabase.from('authors').select('id, slug, image_url').not('image_url', 'is', null)
  if (slugArg) query = query.eq('slug', slugArg)
  const { data: authors, error } = await query
  if (error) throw new Error(`Failed to load authors: ${error.message}`)

  const objects = await listBucket()
  const candidates = []
  for (const a of authors) {
    const name = objectName(a.image_url)
    const obj = name && objects.get(name)
    if (!obj) continue
    if (obj.size > minKb * 1024) candidates.push({ ...a, name, ...obj })
  }

  const total = candidates.reduce((n, c) => n + c.size, 0)
  console.log(
    `${write ? 'WRITE' : 'DRY RUN (nothing downloaded or written; pass --write to apply)'} — ` +
      `${candidates.length} of ${authors.length} portrait(s) over ${minKb} KB, ${kb(total)} in all.\n`
  )

  let before = 0
  let after = 0
  let changed = 0
  for (const c of candidates) {
    if (!write) {
      console.log(`  ${c.slug.padEnd(36)} ${kb(c.size).padStart(8)}  ${c.name}`)
      continue
    }
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(c.name)
    if (dlError) {
      console.warn(`  ! ${c.slug}: download failed: ${dlError.message}`)
      continue
    }
    const original = Buffer.from(await blob.arrayBuffer())
    const shrunk = await shrinkPortrait(original, c.type || blob.type)
    if (!shrunk || shrunk.buffer.length > original.length * 0.8) {
      console.log(`  = ${c.slug}: no worthwhile saving, left as is`)
      continue
    }

    const newName = `${c.name.replace(/\.[a-z0-9]+$/i, '')}-sm.${shrunk.ext}`
    const { error: upError } = await supabase.storage
      .from(BUCKET)
      .upload(newName, shrunk.buffer, { contentType: shrunk.contentType, upsert: true })
    if (upError) {
      console.warn(`  ! ${c.slug}: upload failed: ${upError.message}`)
      continue
    }
    const newUrl = supabase.storage.from(BUCKET).getPublicUrl(newName).data.publicUrl
    const { error: dbError } = await supabase.from('authors').update({ image_url: newUrl }).eq('id', c.id)
    if (dbError) {
      console.warn(`  ! ${c.slug}: image_url update failed (copy uploaded as ${newName}): ${dbError.message}`)
      continue
    }
    before += original.length
    after += shrunk.buffer.length
    changed++
    console.log(`  ✓ ${c.slug}: ${kb(original.length)} → ${kb(shrunk.buffer.length)}  (${newName})`)
  }

  if (write) {
    console.log(`\nTOTALS: ${changed} portrait(s) replaced, ${kb(before)} → ${kb(after)}.`)
    console.log('Originals were kept. Pages show the new copies after the next production deploy.')
  } else if (candidates.length > 0) {
    console.log('\nRe-run with --write to apply.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
