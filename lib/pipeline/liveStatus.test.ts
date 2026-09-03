/**
 * Tests for the pure classification helpers behind resolveLiveStatuses — no
 * Supabase, no filesystem. Cases mirror real states found in the corpus while
 * building this (queried directly against production, 2026-09-03):
 *   - a single-text prospect whose local output file's frontmatter slug no
 *     longer matches any database row (national-apostasy-keble → "keble1" on
 *     disk, but the actual imported text lives at "national-apostasy")
 *   - two collections whose container is published but EVERY chapter under it
 *     is still published:false (pastoral-rule-gregory, exposition-orthodox-faith)
 *   - a collection with all-but-one chapter published (de-ecclesia-the-church-hus)
 *
 * Run: npx tsx --test lib/pipeline/*.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { classifySingleText, classifyCollection, UNKNOWN, DRAFT } from './liveStatus'

test('classifySingleText: live when the resolved slug is published', () => {
  const published = new Map([['small-catechism', true]])
  const result = classifySingleText('small-catechism', published)
  assert.deepEqual(result, { status: 'live', href: '/texts/small-catechism' })
})

test('classifySingleText: draft when the resolved slug exists but is unpublished', () => {
  const published = new Map([['some-slug', false]])
  assert.deepEqual(classifySingleText('some-slug', published), DRAFT)
})

test('classifySingleText: unknown when the resolved slug matches no database row (stale local file)', () => {
  // The real case: national-apostasy-keble/keble1.md's frontmatter says
  // slug: "keble1", but nothing in `texts` has that slug — the file drifted
  // from what was actually imported (the real row is "national-apostasy").
  const published = new Map([['national-apostasy', true]])
  assert.deepEqual(classifySingleText('keble1', published), UNKNOWN)
})

test('classifyCollection: live only when every chapter is published', () => {
  const result = classifyCollection('canons-of-aelfric', [true, true])
  assert.deepEqual(result, { status: 'live', href: '/collections/canons-of-aelfric' })
})

test('classifyCollection: draft when the collection wrapper is published but every chapter is not', () => {
  // pastoral-rule-gregory and exposition-orthodox-faith: collections.published
  // = true, but all 4 member texts are published: false in each case. The
  // container flag alone would have falsely reported these as live.
  assert.deepEqual(classifyCollection('pastoral-rule-gregory', [false, false, false, false]), DRAFT)
})

test('classifyCollection: draft when all but one chapter is published', () => {
  // de-ecclesia-the-church-hus: 22 of 23 chapters published, one still draft.
  const flags = [false, ...Array(22).fill(true)]
  assert.deepEqual(classifyCollection('de-ecclesia-the-church-hus', flags), DRAFT)
})

test('classifyCollection: unknown when no chapters were found (no collection row, or an empty one)', () => {
  assert.deepEqual(classifyCollection('some-collection', undefined), UNKNOWN)
  assert.deepEqual(classifyCollection('some-collection', []), UNKNOWN)
})
