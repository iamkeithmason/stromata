/**
 * Build every published collection's PDF and store it in Vercel Blob, where
 * /collections/[slug]/download/pdf redirects. Dry-run by default.
 *
 *   npm run build:collection-pdfs                      # dry run: render all, report sizes, store nothing
 *   npm run build:collection-pdfs -- --write           # render and store all
 *   npm run build:collection-pdfs -- --slug=confessions --write
 *
 * Normally you never need it: an admin save or publish that touches a
 * collection rebuilds its PDF (lib/pdf/collection-pdf-schedule.ts). Run it
 * once after the Blob store is connected, and after a CLI script edits a
 * chapter body (CLI revalidation names text pages only, so it does not reach
 * the collection's PDF).
 *
 * Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (the anon key sees only published rows, which is exactly what a PDF holds),
 * and for --write BLOB_READ_WRITE_TOKEN (`vercel env pull .env.local`, or copy
 * it from Vercel → Storage → the store → .env.local tab).
 *
 * METERS for one full run (measured 18 Nov 2026, 41 collections):
 *   Supabase egress — every published collection body once, ~22 MB, about 0.4%
 *     of the 5 GB cycle shared with Paideia. A dry run costs the same.
 *   Vercel Blob — 41 writes (advanced operations) and ~32 MB stored.
 *   CPU — local, a few minutes in all (City of God alone ~8s). None on Vercel.
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { rebuildCollectionPdf } from '../lib/pdf/collection-pdf'

dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const write = process.argv.includes('--write')
const slugArg = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (write && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('--write needs BLOB_READ_WRITE_TOKEN in .env.local (Vercel → Storage → the Blob store).')
  process.exit(1)
}
const supabase = createClient(url, key)

async function main() {
  let slugs: string[]
  if (slugArg) {
    slugs = [slugArg]
  } else {
    const { data, error } = await supabase.from('collections').select('slug').eq('published', true).order('slug')
    if (error) throw error
    slugs = (data ?? []).map(r => r.slug as string)
  }

  console.log(`${write ? 'WRITE' : 'DRY RUN'}: ${slugs.length} collection(s)\n`)
  let bytes = 0
  let failed = 0
  for (const slug of slugs) {
    const t0 = Date.now()
    try {
      const outcome = await rebuildCollectionPdf(supabase, slug, { dryRun: !write })
      const ms = Date.now() - t0
      if (outcome.action === 'stored') {
        bytes += outcome.bytes
        console.log(`  ${slug.padEnd(48)} ${(outcome.bytes / 1024).toFixed(0).padStart(6)} KB  ${String(ms).padStart(5)} ms  ${write ? outcome.url : ''}`)
      } else {
        console.log(`  ${slug.padEnd(48)} ${outcome.action}${'reason' in outcome ? `: ${outcome.reason}` : ''}`)
      }
    } catch (err) {
      failed += 1
      console.error(`  ${slug.padEnd(48)} FAILED: ${(err as Error).message}`)
    }
  }
  console.log(`\nTotal ${(bytes / 1024 / 1024).toFixed(1)} MB${write ? ' stored' : ' (nothing stored; pass --write)'}${failed ? `, ${failed} failed` : ''}.`)
  if (failed) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
