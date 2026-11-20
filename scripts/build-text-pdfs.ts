/**
 * Build every published text's PDF and store it in Vercel Blob, where
 * /texts/[slug]/download/pdf redirects. Dry-run by default.
 *
 *   npm run build:text-pdfs                            # dry run: render all, report sizes, store nothing
 *   npm run build:text-pdfs -- --write                 # render and store all
 *   npm run build:text-pdfs -- --slug=the-didache --write
 *   npm run build:text-pdfs -- --author=augustine-of-hippo --write
 *
 * Normally you never need it: publishing or saving a text rebuilds its PDF
 * (lib/pdf/text-pdf-schedule.ts), and so does a CLI script's revalidation. Run
 * it once before the release that restores text PDFs (20 Nov 2026), and after
 * editing an author's name or dates, which every one of their PDFs prints
 * (`--author=<slug>`).
 *
 * Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (the anon key sees only published rows, which is exactly what a PDF holds),
 * and for --write BLOB_READ_WRITE_TOKEN (`vercel env pull .env.local`, or copy
 * it from Vercel → Storage → the store → .env.local tab).
 *
 * METERS for one full run (~570 published texts, estimated 20 Nov 2026 from the
 * 18 Nov collection run, whose PDFs came out at ~1.45x their body text):
 *   Supabase egress — every published body once, ~30 MB, about 0.6% of the
 *     5 GB cycle shared with Paideia. A dry run costs the same.
 *   Vercel Blob — one write per text and ~45 MB stored (with the collections'
 *     ~30 MB, well inside Hobby's 1 GB).
 *   CPU — local, ~0.7s a text, so roughly 7 minutes. None on Vercel.
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { rebuildTextPdf } from '../lib/pdf/text-pdf'

dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const write = process.argv.includes('--write')
const slugArg = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1]
const authorArg = process.argv.find(a => a.startsWith('--author='))?.split('=')[1]

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
    // Slugs only: the bodies are read one at a time, by the render.
    let q = supabase.from('texts').select('slug, author:authors!inner(slug)').eq('published', true).order('slug')
    if (authorArg) q = q.eq('author.slug', authorArg)
    const { data, error } = await q
    if (error) throw error
    slugs = (data ?? []).map(r => r.slug as string)
  }

  console.log(`${write ? 'WRITE' : 'DRY RUN'}: ${slugs.length} text(s)\n`)
  let bytes = 0
  let failed = 0
  for (const slug of slugs) {
    const t0 = Date.now()
    try {
      const outcome = await rebuildTextPdf(supabase, slug, { dryRun: !write })
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
