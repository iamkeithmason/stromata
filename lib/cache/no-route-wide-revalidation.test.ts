import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Two guards on how the site refreshes its week-long page cache.
 *
 * 1. NO ROUTE-WIDE PURGES. `revalidatePath('/texts/[slug]', 'page')` marks
 *    every text page stale. Marking is lazy, but crawlers visit every page, so
 *    until 2026-11-04 one chapter edit re-rendered all ~770 text pages and
 *    re-read each body from Supabase: a production deploy's worth of Vercel CPU
 *    and egress, from one save. Name the pages that changed instead
 *    (`collectionTextPaths`, `locationPaths` in lib/publishing/revalidate-entities.ts).
 *    `'layout'` purges are refused for the same reason.
 *
 * 2. EVERY ADMIN WRITE REFRESHES SOMETHING. An admin route that writes to
 *    Supabase must import one of the revalidation helpers, or be on
 *    NO_PUBLIC_WRITE below with the reason its write is invisible to the public
 *    site. A route that forgot looked fine under an hourly cache and stale for a
 *    week under this one (CHANGELOG 2026-10-04: five editors had never called it).
 *
 * A source scan, deliberately blunt, like lib/supabase/no-body-in-listings.test.ts.
 */

const ROOT = path.resolve(__dirname, '..', '..')

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')
const source = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]

test('no revalidatePath call purges a whole dynamic route or layout', () => {
  const offenders: string[] = []
  for (const file of source) {
    // Comments may quote the forbidden form to explain it; code may not.
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const m of text.matchAll(/revalidatePath\(([^)]*)\)/g)) {
      const args = m[1]
      if (/\[/.test(args) || /['"`](page|layout)['"`]/.test(args)) {
        offenders.push(`${rel(file)}: revalidatePath(${args.trim()})`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'Name the changed pages instead of purging a route class')
})

// Admin routes whose writes no public page reads. Say why; keep it short.
const NO_PUBLIC_WRITE: Record<string, string> = {
  'app/api/admin/texts/[id]/generate-note-draft/route.ts': 'note_draft is admin-only',
  // Both write the prospects table (via lib/pipeline/queue.ts); no public page reads prospects.
  'app/api/admin/pipeline/queue/route.ts': 'prospects table is admin-only',
  'app/api/admin/pipeline/run/route.ts': 'prospects table is admin-only (dev-only route)',
}

const HELPERS = /from ['"]@\/lib\/(publishing\/publish-text|publishing\/revalidate-entities|authors\/revalidate)['"]/
const MUTATION = /\.(insert|update|upsert|delete)\(/

test('every admin route that writes to Supabase calls a revalidation helper', () => {
  const routes = walk(path.join(ROOT, 'app', 'api', 'admin')).filter(f => f.endsWith('route.ts'))
  assert.ok(routes.length > 10, 'scanner found too few admin routes — has the tree moved?')
  const missing: string[] = []
  for (const file of routes) {
    const r = rel(file)
    const text = fs.readFileSync(file, 'utf8')
    if (!MUTATION.test(text) || NO_PUBLIC_WRITE[r]) continue
    if (!HELPERS.test(text)) missing.push(r)
  }
  assert.deepEqual(missing, [], 'Call revalidateText / revalidateEntity / revalidateAuthor, or add the route to NO_PUBLIC_WRITE with a reason')
})

test('NO_PUBLIC_WRITE lists only routes that exist', () => {
  for (const r of Object.keys(NO_PUBLIC_WRITE)) assert.ok(fs.existsSync(path.join(ROOT, r)), r)
})
