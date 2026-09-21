#!/usr/bin/env node
/**
 * backfill-published-at.mjs — give the corpus a publish history it can be
 * charted from, without inventing one.
 *
 * `texts.published_at` was added partway through the project's life, so it is
 * null for every text published before it existed — 207 of 547 published texts
 * at the time of writing. Anything that reads publishing over time (a burndown,
 * a cadence chart, throughput per month) therefore sees a corpus that appears to
 * have published nothing at all until 14 September 2026, which is when the
 * column started being written.
 *
 * WHAT IT WILL AND WILL NOT WRITE
 *
 * The only timestamp available to reconstruct from is `created_at`, and it is a
 * good proxy for exactly one population: texts that were created already
 * published. Before the pipeline existed Keith added texts straight to the site
 * in their finished state, so for those rows "created" and "published" are the
 * same act within minutes.
 *
 * For a text that arrived as a pipeline draft and was published later, they are
 * not the same act at all — the 246 drafts cleared on 21 September 2026 were
 * created on the 12th. Writing created_at there would claim a publish date that
 * is demonstrably wrong, and would do it silently, in a column whose whole
 * purpose is to be trusted by charts.
 *
 * So this script backfills ONLY where it can tell the text was created
 * published, and leaves the rest null. A row it cannot date stays undated, and
 * the charts keep drawing it as an explicit gap. A chart that says it does not
 * know beats one that quietly makes something up.
 *
 * HOW IT TELLS
 *
 * One test, and only one: the text was created before REVIEW_QUEUE_ERA. Before
 * that date there was no draft-then-publish path for these rows to have taken,
 * and a published row with no published_at must have been published before the
 * column started being written — so created_at and the real publish date are at
 * most a few weeks apart, and for the pre-pipeline era they are the same act.
 *
 * `updated_at` looks like it should sharpen this and does not. The first draft
 * of this script also required updated_at to be close to created_at, on the
 * theory that a row created published and never re-saved would not have moved.
 * The dry run rejected all 207 candidates: every row in the corpus carries an
 * updated_at of the same day, because the maintenance scripts
 * (strip-source-chrome, rejoin-text-paragraphs, the scripture backfill) rewrite
 * bodies corpus-wide. updated_at records the last time anything touched a row,
 * which by now is never the publish. It is not evidence and is not consulted.
 *
 * USAGE
 *   node scripts/backfill-published-at.mjs                 # dry run (default)
 *   node scripts/backfill-published-at.mjs --write         # apply
 *   node scripts/backfill-published-at.mjs --slug=foo      # scope to one text
 *   node scripts/backfill-published-at.mjs --id=<uuid>     # scope to one id
 *   node scripts/backfill-published-at.mjs --verbose       # list every row
 *
 * Dry run is the default and prints a per-month histogram of what it would
 * write plus what it would leave alone, so the shape can be checked against
 * what is known about the corpus before anything is applied.
 *
 * It never touches `published`, and never writes a row that already has a
 * published_at — re-running is safe and is a no-op once applied.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

/**
 * The review queue landed and `published_at` began being written on
 * 2026-09-14. Anything created on or after this could have taken the
 * draft-then-publish path, so created_at is no longer a safe proxy for it.
 */
const REVIEW_QUEUE_ERA = Date.parse('2026-09-01T00:00:00Z')

/**
 * Decide whether a row's created_at can stand in for its publish date.
 * Exported shape kept simple and pure so the reasoning is testable by eye.
 */
export function classify(row, now = Date.now()) {
  if (!row.published) return { action: 'skip', reason: 'not published' }
  if (row.published_at) return { action: 'skip', reason: 'already has published_at' }

  const created = Date.parse(row.created_at)
  if (Number.isNaN(created)) return { action: 'leave', reason: 'unparseable created_at' }
  if (created > now) return { action: 'leave', reason: 'created_at in the future' }

  if (created >= REVIEW_QUEUE_ERA) {
    return {
      action: 'leave',
      reason: 'created in the review-queue era — may have been a draft first',
    }
  }

  return { action: 'backfill', value: row.created_at }
}

function monthOf(iso) {
  return String(iso).slice(0, 7)
}

function histogram(rows, pick) {
  const counts = new Map()
  for (const r of rows) {
    const m = monthOf(pick(r))
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
}

async function main() {
  // Everything with a side effect lives in here, not at module scope: reading
  // .env.local, demanding credentials, and building the client. `classify` is
  // pure and its test imports this module, so a module-level `process.exit(1)`
  // on missing credentials killed the test process outright — green locally
  // where .env.local exists, red in CI where it does not.
  config({ path: '.env.local' })

  const args = process.argv.slice(2)
  const WRITE = args.includes('--write')
  const VERBOSE = args.includes('--verbose')
  const slug = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length)
  const id = args.find((a) => a.startsWith('--id='))?.slice('--id='.length)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  let query = supabase
    .from('texts')
    .select('id, slug, title, published, published_at, created_at')
    .eq('published', true)
    .is('published_at', null)
    .order('created_at', { ascending: true })

  if (slug) query = query.eq('slug', slug)
  if (id) query = query.eq('id', id)

  const { data, error } = await query
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  const rows = data ?? []
  const backfill = []
  const left = []

  for (const row of rows) {
    const verdict = classify(row)
    if (verdict.action === 'backfill') backfill.push({ row, value: verdict.value })
    else if (verdict.action === 'leave') left.push({ row, reason: verdict.reason })
  }

  console.log(`\n${WRITE ? 'BACKFILL' : 'DRY RUN'} — published texts with no published_at\n`)
  console.log(`  candidates examined : ${rows.length}`)
  console.log(`  would backfill      : ${backfill.length}`)
  console.log(`  left null on purpose: ${left.length}\n`)

  if (backfill.length) {
    console.log('  Would write published_at = created_at, by month:')
    for (const [month, n] of histogram(backfill, (b) => b.value)) {
      console.log(`    ${month}  ${String(n).padStart(4)}  ${'▪'.repeat(Math.min(n, 60))}`)
    }
    console.log()
  }

  if (left.length) {
    const reasons = new Map()
    for (const l of left) reasons.set(l.reason, (reasons.get(l.reason) ?? 0) + 1)
    console.log('  Left null, by reason:')
    for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${reason}`)
    }
    console.log()
  }

  if (VERBOSE) {
    for (const b of backfill) console.log(`    + ${b.value}  ${b.row.slug}`)
    for (const l of left) console.log(`    · (null)              ${l.row.slug} — ${l.reason}`)
    console.log()
  }

  if (!WRITE) {
    console.log('  Dry run — nothing written. Re-run with --write to apply.\n')
    return
  }

  let ok = 0
  const failures = []
  for (const b of backfill) {
    // Only ever fills a null. The published_at filter makes a concurrent write
    // win rather than being silently overwritten by this backfill.
    const { error: upErr, data: updated } = await supabase
      .from('texts')
      .update({ published_at: b.value })
      .eq('id', b.row.id)
      .is('published_at', null)
      .select('id')
    if (upErr) failures.push({ slug: b.row.slug, message: upErr.message })
    else if (updated?.length) ok += 1
  }

  console.log(`  written : ${ok}`)
  if (failures.length) {
    console.log(`  FAILED  : ${failures.length}`)
    for (const f of failures) console.log(`    ✕ ${f.slug} — ${f.message}`)
    process.exitCode = 1
  }
  console.log()
}

// Same guard as scripts/normalise-markdown.mjs: run as a CLI, import as a
// module. Without it, importing for `classify` would run the whole backfill.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
