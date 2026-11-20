import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The egress guard. On 2026-09-21 Supabase's free-plan egress went over
 * because every listing page selected `texts.body` (29 MB across the corpus)
 * to compute "approx. N min read". Each production build prerendered the
 * theme/era/tradition/location pages and pulled ~220 MB; that day had 29
 * merges plus a preview build per push. Migration 028's `word_count` fixed the
 * cause; this test keeps it fixed.
 *
 * Rule: a public page or route may select `body` only if it is on ALLOWED
 * below — i.e. it genuinely shows the text. Anything else that needs a length
 * uses `word_count`; anything that needs an excerpt uses `summary`.
 *
 * It reads `.select(…)` arguments as written: string/template literals inline,
 * or a `const` in the same file holding one. `select('*')` on `texts` counts as
 * selecting body. It is a source scan, not a type check — deliberately blunt so
 * it cannot be satisfied by accident.
 */

const ROOT = path.resolve(__dirname, '..', '..')

// Files that legitimately ship a text's body. Paths are repo-relative.
// Search is deliberately absent: it filters on body but takes its snippets
// from the text_excerpts function (migration 032).
const ALLOWED = new Set([
  'app/texts/[slug]/page.tsx', // the reader
  'app/texts/[slug]/download/markdown/route.ts',
  'app/collections/[slug]/download/markdown/route.ts',
  // Stored PDFs, built on admin saves and by the backfills, never per request.
  'lib/pdf/collection-pdf.ts',
  'lib/pdf/text-pdf.ts',
])

// Editorial surfaces sit behind Keith's login and are not crawled.
const EXCLUDED_DIRS = ['app/admin', 'app/api/admin']

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

// A quoted string; `n` is the capture-group number its quote character lands
// in, so the closing backreference matches the opening quote.
const string = (n: number) => String.raw`(['"\x60])([\s\S]*?)` + '\\' + n

/** Every select argument in `src`, resolved to its literal text where possible. */
function selectArguments(src: string): string[] {
  const consts = new Map<string, string>()
  for (const m of src.matchAll(new RegExp(String.raw`const\s+(\w+)\s*=\s*` + string(2), 'g'))) {
    consts.set(m[1], m[3])
  }
  // Resolve `${otherConst}` inside a template so `${textSelect}, body` is seen.
  const resolve = (s: string) => s.replace(/\$\{(\w+)\}/g, (_, n) => consts.get(n) ?? '')

  const out: string[] = []
  for (const m of src.matchAll(new RegExp(String.raw`\.select\(\s*` + string(1), 'g'))) {
    out.push(resolve(m[2]))
  }
  for (const m of src.matchAll(/\.select\(\s*(\w+)\s*[,)]/g)) {
    const v = consts.get(m[1])
    if (v !== undefined) out.push(resolve(v))
  }
  return out
}

/** Drop block and line comments, so a documented example is not a finding. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** True when a select argument fetches the body column. */
function selectsBody(arg: string): boolean {
  return /\bbody\b/.test(arg)
}

test('selectArguments sees inline, const and composed selects', () => {
  const src = [
    "a.from('texts').select('id, body')",
    'const base = `id, title`',
    'const withBody = `${base}, body`',
    "b.from('texts').select(withBody).limit(1)",
    "c.from('texts').select(base)",
  ].join('\n')
  const args = selectArguments(src)
  assert.deepEqual(args.map(selectsBody), [true, true, false])
})

test('selectsBody is a whole-word match', () => {
  assert.equal(selectsBody('id, word_count, summary'), false)
  assert.equal(selectsBody('id, somebody_else'), false)
  assert.equal(selectsBody('id,\n  body,\n  title'), true)
  assert.equal(selectsBody('texts(body)'), true)
})

test('no public page or route selects texts.body outside the allowlist', () => {
  const offenders: string[] = []
  const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (EXCLUDED_DIRS.some((d) => rel.startsWith(d + '/'))) continue
    if (ALLOWED.has(rel)) continue
    const src = stripComments(fs.readFileSync(abs, 'utf8'))
    if (selectArguments(src).some(selectsBody)) offenders.push(`${rel}: selects body`)
    if (/from\(\s*['"]texts['"]\s*\)\s*\.select\(\s*['"\x60]\s*\*/.test(src)) {
      offenders.push(`${rel}: select('*') on texts (includes body)`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'Listing pages must not download text bodies (2026-09-21 egress overage). ' +
      'Use word_count for reading time and summary for excerpts.'
  )
})

test('every allowlisted file still exists', () => {
  // A renamed file would otherwise leave a stale exemption behind.
  for (const rel of ALLOWED) assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is gone — drop it from ALLOWED`)
})
