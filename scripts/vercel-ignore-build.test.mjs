/**
 * scripts/vercel-ignore-build.sh decides whether Vercel builds a deployment.
 * Exit 0 = skip, exit 1 = build (Vercel's convention).
 *
 * These tests run the real script against throwaway git repositories, because
 * the interesting failures are git-shaped: a rename that smuggles a site file
 * into an ignored folder, a merge commit, a push of several commits, a root
 * commit with no parent. The principle under test is that every doubt BUILDS —
 * a skipped deploy that should have happened is the expensive mistake.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'vercel-ignore-build.sh')

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ignore-build-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'test')
  git(dir, 'config', 'user.email', 'test@example.com')
  return dir
}

function write(dir, file, content = 'x') {
  const full = join(dir, file)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

function commit(dir, message, files) {
  for (const [file, content] of Object.entries(files)) write(dir, file, content)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

/** Run the script; returns its exit code (0 = skip, 1 = build). */
function run(dir, env) {
  const r = spawnSync('bash', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME ?? '/tmp', ...env },
  })
  return { code: r.status, out: r.stdout + r.stderr }
}

const prod = (message = 'Update', extra = {}) => ({
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_MESSAGE: message,
  ...extra,
})

/** A repo with a site file and a first commit, ready for a second commit. */
function baseRepo() {
  const dir = newRepo()
  commit(dir, 'initial', { 'app/page.tsx': 'v1', 'CHANGELOG.md': 'v1' })
  return dir
}

// ── previews ────────────────────────────────────────────────────────────────

test('a preview is skipped unless the commit asks for one', () => {
  const dir = baseRepo()
  assert.equal(run(dir, { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_MESSAGE: 'Fix a thing' }).code, 0)
  assert.equal(run(dir, { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_MESSAGE: 'Try header [preview]' }).code, 1)
  assert.equal(run(dir, { VERCEL_ENV: 'development', VERCEL_GIT_COMMIT_MESSAGE: 'x' }).code, 0)
  rmSync(dir, { recursive: true, force: true })
})

// ── production: what may be skipped ─────────────────────────────────────────

test('production skips a report-only commit (the weekly analytics digest)', () => {
  const dir = baseRepo()
  commit(dir, 'Analytics digest — 2026-10-05', { 'scripts/analytics/reports/2026-10-05.md': 'report' })
  assert.equal(run(dir, prod('Analytics digest')).code, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('production skips a commit touching only docs and run logs', () => {
  const dir = baseRepo()
  commit(dir, 'Log a run', {
    'CHANGELOG.md': 'v2',
    'CLAUDE.md': 'notes',
    'scripts/ingestion/run-log/2026-10-05.md': 'log',
  })
  assert.equal(run(dir, prod()).code, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('production skips a content-pipeline run: queue, staged output and run log', () => {
  const dir = baseRepo()
  commit(dir, 'Weekly content pipeline run', {
    'scripts/ingestion/prospect-queue.json': '{}',
    'scripts/ingestion/output/some-slug/ch-1.md': 'chapter',
    'scripts/ingestion/output/flat-text.md': 'text',
    'scripts/ingestion/run-log/2026-10-05.md': 'log',
    'CHANGELOG.md': 'v2',
  })
  assert.equal(run(dir, prod()).code, 0)
  rmSync(dir, { recursive: true, force: true })
})

// ── production: what must build ─────────────────────────────────────────────

test('production builds when any changed file is a site file', () => {
  const dir = baseRepo()
  commit(dir, 'Real change', { 'app/page.tsx': 'v2' })
  assert.equal(run(dir, prod()).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('production builds a mixed commit: one site file among docs is enough', () => {
  const dir = baseRepo()
  commit(dir, 'Change + changelog', { 'CHANGELOG.md': 'v2', 'lib/thing.ts': 'new' })
  assert.equal(run(dir, prod()).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('production builds for look-alike paths the app actually reads', () => {
  // lib/analytics/dashboard.ts imports scripts/analytics/aggregate.mjs, so a
  // change beside the reports folder is a site change. Same for a sibling dir
  // whose name merely starts with the allowed one.
  for (const file of [
    'scripts/analytics/aggregate.mjs',
    'scripts/analytics/reports-extra/x.md',
    'scripts/ingestion/run-log.md',
    'scripts/ingestion/output-notes/x.md',
    'scripts/ingestion/prospect-queue.json.bak',
    // Code beside the data: an admin route imports split-into-chapters.mjs.
    'scripts/ingestion/split-into-chapters.mjs',
    'scripts/ingestion/config.js',
    'scripts/ingestion/archive-ocr-config.mjs',
    'CHANGELOG.md.bak',
    'docs/CLAUDE.md',
  ]) {
    const dir = baseRepo()
    commit(dir, 'Touch lookalike', { [file]: 'v2' })
    assert.equal(run(dir, prod()).code, 1, `${file} must build`)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('production builds when a site file is renamed INTO an ignored folder', () => {
  // git diff reports a rename as one new path by default, which would look
  // like a harmless report. --no-renames lists the deleted site file too.
  const dir = baseRepo()
  mkdirSync(join(dir, 'scripts/analytics/reports'), { recursive: true })
  renameSync(join(dir, 'app/page.tsx'), join(dir, 'scripts/analytics/reports/page.tsx'))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Move a page into reports')
  assert.equal(run(dir, prod()).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('the force-deploy tag builds even a docs-only commit', () => {
  const dir = baseRepo()
  commit(dir, 'Docs [deploy]', { 'CHANGELOG.md': 'v2' })
  assert.equal(run(dir, prod('Docs [deploy]')).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

// ── production: every doubt builds ──────────────────────────────────────────

test('production builds when there is no parent commit to compare with', () => {
  const dir = newRepo()
  commit(dir, 'root', { 'CHANGELOG.md': 'v1' })
  assert.equal(run(dir, prod()).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('production builds when git cannot diff (not a repository)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ignore-build-norepo-'))
  assert.equal(run(dir, prod()).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('production builds a merge commit that carries site changes', () => {
  // HEAD^ of a merge is the first parent (previous main), so the diff is the
  // whole branch.
  const dir = baseRepo()
  git(dir, 'checkout', '-q', '-b', 'feature')
  commit(dir, 'Site change on branch', { 'app/page.tsx': 'v2' })
  commit(dir, 'Docs on branch', { 'CHANGELOG.md': 'v2' })
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'feature')
  assert.equal(run(dir, prod('Merge pull request #1')).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('a push of several commits cannot hide a site change behind a report-only one', () => {
  // Two commits arrive in one push: a site change, then a digest. HEAD^..HEAD
  // looks harmless; the previous deployed SHA shows the real change.
  const dir = baseRepo()
  const deployed = git(dir, 'rev-parse', 'HEAD')
  commit(dir, 'Site change', { 'app/page.tsx': 'v2' })
  commit(dir, 'Digest', { 'scripts/analytics/reports/r.md': 'r' })
  assert.equal(run(dir, prod('Digest')).code, 0, 'without the previous SHA this is the known blind spot')
  assert.equal(run(dir, prod('Digest', { VERCEL_GIT_PREVIOUS_SHA: deployed })).code, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('an unreachable previous SHA does not break the check', () => {
  const dir = baseRepo()
  commit(dir, 'Digest', { 'scripts/analytics/reports/r.md': 'r' })
  const r = run(dir, prod('Digest', { VERCEL_GIT_PREVIOUS_SHA: 'deadbeef'.repeat(5) }))
  assert.equal(r.code, 0, r.out)
  rmSync(dir, { recursive: true, force: true })
})
