/**
 * Unit tests for the pure surface list in publish-text.ts.
 *   npx tsx --test lib/publishing/publish-text.test.ts
 *
 * Only `textPaths` is covered here: it takes no Supabase and no `next/cache`,
 * and it is the part that silently rots when a new public surface is added.
 * The I/O in `publishText` is exercised against the real database instead.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textPaths } from './publish-text'

const full = {
  slug: 'on-the-priesthood',
  authorSlug: 'john-chrysostom',
  collectionSlug: 'on-the-priesthood-chrysostom',
  themeSlugs: ['ministry', 'vocation'],
  eraSlug: 'nicene-post-nicene',
  traditionSlug: 'imperial',
  locationSlug: 'turkey',
}

test('covers every ISR surface that renders a published text', () => {
  const paths = textPaths(full)
  for (const expected of [
    '/',
    '/texts',
    '/authors',
    '/ten-minutes',
    '/texts/on-the-priesthood',
    '/authors/john-chrysostom',
    '/collections/on-the-priesthood-chrysostom',
    '/themes/ministry',
    '/themes/vocation',
    '/eras/nicene-post-nicene',
    '/traditions/imperial',
    '/locations/turkey',
    '/scripture',
  ]) {
    assert.ok(paths.includes(expected), `missing ${expected}`)
  }
})

test('includes the four surfaces the old inline revalidation missed', () => {
  // The regression this module exists to fix: the collection, era, tradition
  // and location pages are all `revalidate = 3600` and all render published
  // texts, but the inline version in the admin routes never touched them.
  const paths = textPaths(full)
  assert.ok(paths.includes('/collections/on-the-priesthood-chrysostom'))
  assert.ok(paths.includes('/eras/nicene-post-nicene'))
  assert.ok(paths.includes('/traditions/imperial'))
  assert.ok(paths.includes('/locations/turkey'))
})

test('omits optional surfaces rather than emitting /undefined paths', () => {
  const paths = textPaths({ slug: 'standalone' })
  assert.deepEqual(paths, ['/', '/texts', '/authors', '/ten-minutes', '/texts/standalone', '/scripture'])
  assert.ok(!paths.some(p => p.includes('undefined') || p.includes('null')))
})

test('drops nullish and duplicate theme slugs', () => {
  const paths = textPaths({
    slug: 'x',
    themeSlugs: ['prayer', null, 'prayer', undefined, ''],
  })
  assert.equal(paths.filter(p => p === '/themes/prayer').length, 1)
  assert.ok(!paths.some(p => p === '/themes/' || p.includes('null')))
})

test('never repeats a path, so one publish is one revalidation each', () => {
  const paths = textPaths(full)
  assert.equal(new Set(paths).size, paths.length)
})

test('excludes the force-dynamic routes, which have nothing to invalidate', () => {
  const paths = textPaths(full)
  // /rss, /sitemap.xml and /llms.txt are `revalidate = 0`; revalidating them
  // is a no-op that would imply a dependency the app does not have.
  for (const notExpected of ['/rss', '/sitemap.xml', '/llms.txt', '/search', '/locations']) {
    assert.ok(!paths.includes(notExpected), `should not revalidate ${notExpected}`)
  }
})

test('does not fan out to per-reference scripture pages', () => {
  // One text cites up to 200 distinct book+chapter pages; a 122-text publish
  // would be thousands of calls. The index is refreshed, the leaves are not.
  const paths = textPaths(full)
  assert.ok(paths.includes('/scripture'))
  assert.ok(!paths.some(p => p.startsWith('/scripture/')))
})
