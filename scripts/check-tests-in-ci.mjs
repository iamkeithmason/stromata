#!/usr/bin/env node
/**
 * check-tests-in-ci — every test file in the repo must actually run in CI.
 *
 * A test that never runs in CI is documentation, not a contract. `ci.yml` has
 * claimed that in a comment since it was written, while running one of the
 * repo's seven suites; `test:scripture` named a single file rather than a glob,
 * so a sibling test sat unrun. Neither is visible by reading either file alone.
 *
 * This is the check form of the research-bank convention "a green or quiet
 * signal is evidence only for the claim it tests": a green CI badge is evidence
 * about the tests CI ran, and says nothing about the ones it never invoked.
 *
 * Both sides are DERIVED, never restated here:
 *   found   — every *.test.{ts,tsx,mjs,js} on disk
 *   covered — the files CI's own `npm run` invocations resolve to, by reading
 *             ci.yml for the scripts it runs, package.json for what those
 *             scripts expand to (recursively through `&&` chains), and the
 *             glob arguments after `--test`
 * so adding a suite to CI needs no edit here, and removing one is caught.
 *
 * Deliberate exclusions live in EXCLUDED below, each with a reason. The list is
 * a ratchet: it may shrink, never grow.
 */
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/ci.yml'

/** Test files deliberately not run in CI. Each entry needs a reason. Never add one. */
const EXCLUDED = Object.create(null)

const TEST_GLOB = '**/*.test.{ts,tsx,mjs,js}'
const IGNORE = ['node_modules/**', '.next/**', 'dist/**', 'build/**']

const rel = p => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/')

// ── found: every test file on disk ──────────────────────────────────────────
const found = globSync(TEST_GLOB, { cwd: ROOT, exclude: IGNORE }).map(rel).sort()

// ── covered: what CI actually invokes ───────────────────────────────────────
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const scripts = pkg.scripts || {}

// Script names CI runs, read out of the workflow rather than listed here.
const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8')
const ciScripts = new Set()
for (const m of workflow.matchAll(/npm\s+(?:run\s+(?:--silent\s+)?([\w:-]+)|(test)\b)/g)) {
  ciScripts.add(m[1] || m[2])
}

// Expand a script body to the test-file globs it runs, following `npm run` chains.
function globsFor(name, seen = new Set()) {
  if (seen.has(name) || !scripts[name]) return []
  seen.add(name)
  const body = scripts[name]
  const out = []
  for (const m of body.matchAll(/npm\s+run\s+(?:--silent\s+)?([\w:-]+)/g)) {
    out.push(...globsFor(m[1], seen))
  }
  // Everything after a `--test` flag, up to the next flag or shell separator.
  for (const m of body.matchAll(/--test\s+([^&|;]+)/g)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      if (tok.startsWith('-')) continue
      out.push(tok)
    }
  }
  return out
}

const coveredGlobs = [...ciScripts].flatMap(n => globsFor(n))
const covered = new Set(
  coveredGlobs.flatMap(g => {
    const hits = globSync(g, { cwd: ROOT, exclude: IGNORE }).map(rel)
    // A literal path that matches nothing is a stale reference, not coverage.
    return hits.length ? hits : []
  })
)

// ── report ──────────────────────────────────────────────────────────────────
const unrun = found.filter(f => !covered.has(f) && !(f in EXCLUDED))
const staleExclusions = Object.keys(EXCLUDED).filter(f => !found.includes(f))

if (staleExclusions.length) {
  console.error('Stale entries in EXCLUDED (file no longer exists) — remove them:')
  for (const f of staleExclusions) console.error(`  ${f}`)
}

if (unrun.length) {
  console.error(
    `\n${unrun.length} test file(s) never run in CI — a test CI does not invoke is ` +
      `documentation, not a contract:\n`
  )
  for (const f of unrun) console.error(`  ${f}`)
  console.error(
    `\nFix by adding the suite to an npm script that ${WORKFLOW} runs ` +
      `(check the script uses a glob, not one named file).\n`
  )
}

if (unrun.length || staleExclusions.length) process.exit(1)

console.log(
  `All ${found.length} test files run in CI ` +
    `(via ${[...ciScripts].sort().join(', ')}).`
)
