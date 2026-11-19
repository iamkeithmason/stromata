import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The public site must stay cacheable: a route that renders on every request
 * spends Vercel Hobby CPU on every crawler hit (4h per 30 days, ~8 min a day).
 * Until 2026-11-04 the four biggest public routes did exactly that, unnoticed
 * for a month (CHANGELOG 2026-11-04). This scan fails on any public code that
 * would make a page or route dynamic, unless the file is on DYNAMIC_ALLOWED
 * with its reason.
 *
 * What makes a route render per request in Next 15, and so what this looks for:
 * reading cookies(), headers(), draftMode() or connection(); opting out with
 * noStore, `dynamic = 'force-dynamic'` or `revalidate = 0`; a page taking
 * `searchParams`; and a public-client read with `{ live: true }` (no-store
 * fetch). Separately, a browser fetch to an /api route from public code is
 * billed on every page view even when the page is cached, so it fails too.
 *
 * Its companion, public-pages-are-cached.test.ts, covers the other cause: a
 * [param] page without generateStaticParams. Neither replaces looking at the
 * `next build` route table (● or ○, not ƒ) for a new public route: a source
 * scan cannot see every import chain. It is the floor, not the proof.
 */

const ROOT = path.resolve(__dirname, '..', '..')

/**
 * Files allowed to be dynamic, and why. Keep the reasons honest and the list
 * short: an entry that no longer needs to be here fails the last test below.
 */
const DYNAMIC_ALLOWED: Record<string, string> = {
  'app/search/page.tsx': 'results depend on the query string; one render per search',
  'app/rss/route.ts': 'feed generated per request; CDN-cached for an hour (s-maxage)',
  'app/llms.txt/route.ts': 'generated per request; CDN-cached for an hour (s-maxage)',
  'app/sitemap.ts': 'generated per request; measured ~7s CPU a day on 2026-10-04',
  'app/texts/[slug]/download/markdown/route.ts': 'download; CDN-cached for a day (s-maxage)',
  'app/collections/[slug]/download/markdown/route.ts': 'download; CDN-cached for a day (s-maxage)',
}

/** Each marker: what it is, and the source pattern that finds it. */
const MARKERS: [string, RegExp][] = [
  ['imports next/headers', /from ['"]next\/headers['"]/],
  ['calls cookies()', /\bcookies\(\)/],
  ['calls headers()', /\bheaders\(\)/],
  ['calls draftMode()', /\bdraftMode\(\)/],
  ['calls connection()', /\bconnection\(\)/],
  ['opts out with noStore', /\b(unstable_)?noStore\(/],
  ["sets dynamic = 'force-dynamic'", /export const dynamic\s*=\s*['"]force-dynamic['"]/],
  ['sets revalidate = 0', /export const revalidate\s*=\s*0\b/],
  ['takes searchParams', /\bsearchParams\b/],
  ['reads the public client live', /\blive:\s*true\b/],
  ['fetches an /api route from public code', /fetch\(\s*['"`]\/api\//],
]

/** Comments may quote a marker to explain it; code may not. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

export function markersIn(src: string): string[] {
  const body = code(src)
  return MARKERS.filter(([, re]) => re.test(body)).map(([name]) => name)
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')

/** Public code: everything in app/ and lib/ except the admin app and its API. */
function publicFiles(): string[] {
  return [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
    .map(rel)
    .filter(r => !r.startsWith('app/admin/') && !r.startsWith('app/api/'))
}

test('no public code makes a route render on every request, outside DYNAMIC_ALLOWED', () => {
  const files = publicFiles()
  assert.ok(files.includes('app/texts/[slug]/page.tsx'), 'scanner missed the reader page')
  const offenders = files
    .filter(r => !DYNAMIC_ALLOWED[r])
    .map(r => [r, markersIn(fs.readFileSync(path.join(ROOT, r), 'utf8'))] as const)
    .filter(([, found]) => found.length > 0)
    .map(([r, found]) => `${r}: ${found.join(', ')}`)
  assert.deepEqual(
    offenders,
    [],
    'Keep per-visitor logic in the browser and cache public data; if a route truly must be dynamic, add it to DYNAMIC_ALLOWED with the reason'
  )
})

test('a dynamic route handler on the list sets a CDN cache header', () => {
  const uncached = Object.keys(DYNAMIC_ALLOWED)
    .filter(r => r.endsWith('/route.ts'))
    .filter(r => !/s-maxage=\d+/.test(fs.readFileSync(path.join(ROOT, r), 'utf8')))
  assert.deepEqual(uncached, [], 'A route rendered per request must at least let the CDN cache its response')
})

test('every DYNAMIC_ALLOWED entry still exists and still needs to be there', () => {
  for (const r of Object.keys(DYNAMIC_ALLOWED)) {
    const p = path.join(ROOT, r)
    assert.ok(fs.existsSync(p), `${r} is listed but does not exist`)
    assert.ok(markersIn(fs.readFileSync(p, 'utf8')).length > 0, `${r} is no longer dynamic: remove it from DYNAMIC_ALLOWED`)
  }
})

test('the markers catch each way a route goes dynamic, and ignore comments', () => {
  assert.deepEqual(markersIn("import { cookies } from 'next/headers'\nconst c = cookies()"), [
    'imports next/headers',
    'calls cookies()',
  ])
  assert.deepEqual(markersIn('export default function P({ searchParams }) {}'), ['takes searchParams'])
  assert.deepEqual(markersIn("export const dynamic = 'force-dynamic'"), ["sets dynamic = 'force-dynamic'"])
  assert.deepEqual(markersIn('createPublicClient({ live: true })'), ['reads the public client live'])
  assert.deepEqual(markersIn("useEffect(() => { fetch('/api/related') }, [])"), ['fetches an /api route from public code'])
  // A request header object, a comment, and a weekly window are all fine.
  assert.deepEqual(markersIn("fetch(url, { headers: { a: 'b' } })\n// cookies() would break this\nexport const revalidate = 604800"), [])
})
