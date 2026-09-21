/**
 * Unit tests for collection authorship derivation.
 *   npx tsx --test lib/collections/author.test.ts
 *
 * /admin and the rendered collection page can't be opened by Claude (see
 * CLAUDE.md), so the rules that decide a collection's byline are pinned here.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCollectionAuthors, formatAuthorNames, isLinkable, one } from './author'

const augustine = { name: 'Augustine of Hippo', slug: 'augustine-of-hippo' }
const jerome = { name: 'Jerome', slug: 'jerome' }
const browne = { name: 'Sir Thomas Browne', slug: 'sir-thomas-browne' }

// ── Derivation ───────────────────────────────────────────────────────────────

test('derives the single author of a single-author collection', () => {
  const authors = resolveCollectionAuthors(null, [augustine, augustine, augustine])
  assert.deepEqual(authors, [augustine])
})

test('the Hydriotaphia case: a null override derives rather than showing nothing', () => {
  // The live bug this change exists to fix — collections.author_id was null
  // while every text was Browne's, so the page rendered with no byline at all.
  const authors = resolveCollectionAuthors(null, [browne, browne, browne, browne, browne])
  assert.deepEqual(authors, [browne])
})

test('lists every author of a multi-author collection, in reading order', () => {
  const authors = resolveCollectionAuthors(null, [jerome, augustine, jerome])
  assert.deepEqual(authors, [jerome, augustine])
})

test('returns no authors when the collection has no texts', () => {
  assert.deepEqual(resolveCollectionAuthors(null, []), [])
})

test('an explicit override wins over the texts', () => {
  const compiler = { name: 'Philip Schaff', slug: 'philip-schaff' }
  assert.deepEqual(resolveCollectionAuthors(compiler, [augustine, jerome]), [compiler])
})

test('an override with no usable name falls through to derivation', () => {
  assert.deepEqual(resolveCollectionAuthors({ name: '' }, [augustine]), [augustine])
})

test('distinguishes two authors who share a display name but not a slug', () => {
  const a = { name: 'Gregory', slug: 'gregory-the-great' }
  const b = { name: 'Gregory', slug: 'gregory-of-nyssa' }
  assert.deepEqual(resolveCollectionAuthors(null, [a, b]), [a, b])
})

test('dedupes slugless authors by name', () => {
  assert.deepEqual(
    resolveCollectionAuthors(null, [{ name: 'Unknown (Early Church)' }, { name: 'Unknown (Early Church)' }]),
    [{ name: 'Unknown (Early Church)' }]
  )
})

test('skips texts whose author embed is missing', () => {
  assert.deepEqual(resolveCollectionAuthors(null, [null, augustine, undefined]), [augustine])
})

// ── Supabase embed shapes ────────────────────────────────────────────────────

test('accepts an embedded relation returned as a single-element array', () => {
  assert.deepEqual(resolveCollectionAuthors(null, [[augustine], [jerome]]), [augustine, jerome])
  assert.deepEqual(resolveCollectionAuthors([augustine], []), [augustine])
})

test('one() normalises both embed shapes and empties', () => {
  assert.deepEqual(one(augustine), augustine)
  assert.deepEqual(one([augustine]), augustine)
  assert.equal(one([]), null)
  assert.equal(one(null), null)
  assert.equal(one(undefined), null)
})

test('dashboard-style accumulation keeps an array for every Supabase embed shape', () => {
  const found: typeof augustine[] = []
  for (const embedded of [augustine, [augustine], null, undefined]) {
    const author = one(embedded)
    if (author) found.push(author)
  }

  assert.deepEqual(found, [augustine, augustine])
})

// ── Linkability ──────────────────────────────────────────────────────────────

test('a draft author is named but never linked', () => {
  // Deriving from ALL texts means a published collection can name an author who
  // is still an unreviewed pipeline stub. The attribution is right; the link
  // would 404 (app/authors/[slug]/page.tsx).
  assert.equal(isLinkable({ name: 'Gregory the Great', slug: 'gregory-the-great', draft: true }), false)
  assert.equal(isLinkable({ name: 'Gregory the Great', slug: 'gregory-the-great', draft: false }), true)
  assert.equal(isLinkable(augustine), true)
})

test('an author with no slug is not linkable', () => {
  assert.equal(isLinkable({ name: 'Unknown (Early Church)' }), false)
  assert.equal(isLinkable({ name: 'Unknown (Early Church)', slug: null }), false)
})

// ── Formatting ───────────────────────────────────────────────────────────────

test('formats one, two and three authors', () => {
  assert.equal(formatAuthorNames([augustine]), 'Augustine of Hippo')
  assert.equal(formatAuthorNames([jerome, augustine]), 'Jerome and Augustine of Hippo')
  assert.equal(
    formatAuthorNames([jerome, augustine, browne]),
    'Jerome, Augustine of Hippo and Sir Thomas Browne'
  )
})

test('formats an empty author list as an empty string, not "undefined"', () => {
  assert.equal(formatAuthorNames([]), '')
})
