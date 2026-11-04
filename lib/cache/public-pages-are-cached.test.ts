import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A public page with a [param] in its path and a `revalidate` window must also
 * export `generateStaticParams`, or the window is decoration.
 *
 * Next 15 classes a dynamic-segment route without generateStaticParams as
 * dynamic (ƒ in `next build`) and renders it on every request; `revalidate`
 * then caches its data fetches but never the page. Until 2026-11-04 that was
 * true of /texts/[slug], /authors/[slug], /collections/[slug] and
 * /scripture/[ref]: the 12-hour Observability view showed /texts/[slug] alone
 * rendering 1,100 times for ~4 min of CPU, against a 4h-per-30-days Hobby
 * allowance. Returning [] is enough: it prebuilds nothing and makes the route
 * ISR (● in `next build`). See CHANGELOG 2026-11-04.
 *
 * A source scan, like lib/supabase/no-body-in-listings.test.ts.
 */

const ROOT = path.resolve(__dirname, '..', '..')
const APP = path.join(ROOT, 'app')

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'admin' || e.name === 'api' ? [] : pages(p)
    return e.name === 'page.tsx' ? [p] : []
  })
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')

/** The rule, on one file's source. Exported shape kept tiny so the mutation test below can feed it. */
function violates(relPath: string, src: string): boolean {
  const dynamicSegment = /\[[^\]]+\]/.test(relPath)
  const windowSecs = Number(src.match(/export const revalidate\s*=\s*(\d+)/)?.[1] ?? 0)
  const hasParams = /export (async )?function generateStaticParams|export const generateStaticParams/.test(src)
  return dynamicSegment && windowSecs > 0 && !hasParams
}

test('every cached public [param] page exports generateStaticParams', () => {
  const found = pages(APP)
  assert.ok(found.some(f => rel(f) === 'app/texts/[slug]/page.tsx'), 'scanner missed the reader page')
  const offenders = found.map(f => rel(f)).filter(r => violates(r, fs.readFileSync(path.join(ROOT, r), 'utf8')))
  assert.deepEqual(offenders, [], 'Add `export async function generateStaticParams() { return [] }` (see header)')
})

test('the rule flags the 4 Nov shape and passes its repair', () => {
  const before = "export const revalidate = 604800\nexport default function Page() {}"
  assert.equal(violates('app/texts/[slug]/page.tsx', before), true)
  assert.equal(violates('app/texts/[slug]/page.tsx', before + '\nexport async function generateStaticParams() { return [] }'), false)
  // Static routes and uncached routes are out of scope.
  assert.equal(violates('app/texts/page.tsx', before), false)
  assert.equal(violates('app/search/[q]/page.tsx', 'export const dynamic = "force-dynamic"'), false)
})
