import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './backfill-published-at.mjs'

const NOW = Date.parse('2026-09-21T12:00:00Z')

const row = (over = {}) => ({
  id: 'x',
  slug: 'a-text',
  published: true,
  published_at: null,
  created_at: '2026-05-04T09:00:00Z',
  ...over,
})

test('backfills a published pre-era text from created_at', () => {
  const v = classify(row(), NOW)
  assert.equal(v.action, 'backfill')
  assert.equal(v.value, '2026-05-04T09:00:00Z')
})

test('never touches a row that already has a published_at', () => {
  const v = classify(row({ published_at: '2026-09-14T00:00:00Z' }), NOW)
  assert.equal(v.action, 'skip')
})

test('never touches an unpublished row', () => {
  // The whole point of the column is the publish moment; a draft has not had one.
  assert.equal(classify(row({ published: false }), NOW).action, 'skip')
})

test('leaves review-queue-era rows null rather than guessing', () => {
  // The 246 drafts cleared on 21 Sep were created on the 12th. created_at there
  // is a creation date, not a publish date, and writing it would be a fiction.
  const v = classify(row({ created_at: '2026-09-12T10:00:00Z' }), NOW)
  assert.equal(v.action, 'leave')
  assert.match(v.reason, /review-queue era/)
})

test('the era boundary is inclusive of the era, exclusive of what precedes it', () => {
  assert.equal(classify(row({ created_at: '2026-09-01T00:00:00Z' }), NOW).action, 'leave')
  assert.equal(classify(row({ created_at: '2026-08-31T23:59:59Z' }), NOW).action, 'backfill')
})

test('leaves a row whose created_at is unusable', () => {
  assert.equal(classify(row({ created_at: 'not-a-date' }), NOW).action, 'leave')
  assert.equal(classify(row({ created_at: '2027-01-01T00:00:00Z' }), NOW).action, 'leave')
})

test('ignores updated_at entirely', () => {
  // updated_at is bumped corpus-wide by the texts_updated_at trigger every time
  // a maintenance script rewrites a body, so it says nothing about publishing.
  // An identical verdict with and without it is the guard against a future
  // change quietly reintroducing it as a signal.
  const withUpdated = classify(row({ updated_at: '2026-09-21T11:00:00Z' }), NOW)
  const without = classify(row(), NOW)
  assert.deepEqual(withUpdated, without)
})
