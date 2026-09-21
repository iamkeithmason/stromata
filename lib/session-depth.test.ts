/**
 * Tests for the session-depth ledger behind `text-session-depth`.
 *
 * The thing the metric depends on is that each depth fires AT MOST ONCE per
 * session — otherwise count(depth=2) ÷ count(depth=1) is not a conversion rate
 * but a ratio of two inflated counters. So the cases here are the four ways a
 * reader lands on a text page (fresh, click-through, prev/next, back-button)
 * plus the storage failures that would otherwise inflate depth=1.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_TEXTS_KEY,
  readSessionTexts,
  recordTextVisit,
  type SessionStore,
} from './session-depth'

/** An in-memory stand-in for sessionStorage. */
function fakeStore(initial: Record<string, string> = {}): SessionStore {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

test('the first distinct text of a session is depth 1', () => {
  const store = fakeStore()
  assert.equal(recordTextVisit(store, 'pastoral-rule-1'), 1)
  assert.deepEqual(readSessionTexts(store), ['pastoral-rule-1'])
})

test('the second distinct text is depth 2', () => {
  const store = fakeStore()
  recordTextVisit(store, 'pastoral-rule-1')
  assert.equal(recordTextVisit(store, 'on-the-priesthood-1'), 2)
})

test('a reload or back-navigation onto a counted text fires nothing', () => {
  const store = fakeStore()
  assert.equal(recordTextVisit(store, 'pastoral-rule-1'), 1)
  // Reload.
  assert.equal(recordTextVisit(store, 'pastoral-rule-1'), null)
  assert.equal(recordTextVisit(store, 'on-the-priesthood-1'), 2)
  // Back button to the first text.
  assert.equal(recordTextVisit(store, 'pastoral-rule-1'), null)
  // Forward again to the second.
  assert.equal(recordTextVisit(store, 'on-the-priesthood-1'), null)
  assert.deepEqual(readSessionTexts(store), ['pastoral-rule-1', 'on-the-priesthood-1'])
})

test('depth 3 and beyond is recorded but never fired', () => {
  const store = fakeStore()
  recordTextVisit(store, 'a')
  recordTextVisit(store, 'b')
  assert.equal(recordTextVisit(store, 'c'), null)
  assert.equal(recordTextVisit(store, 'd'), null)
  // Still tracked, so a later back-navigation to 'c' stays silent too.
  assert.deepEqual(readSessionTexts(store), ['a', 'b', 'c', 'd'])
  assert.equal(recordTextVisit(store, 'c'), null)
})

test('an empty slug is ignored', () => {
  const store = fakeStore()
  assert.equal(recordTextVisit(store, ''), null)
  assert.deepEqual(readSessionTexts(store), [])
})

test('corrupt or non-array stored values are treated as an empty session', () => {
  assert.deepEqual(readSessionTexts(fakeStore({ [SESSION_TEXTS_KEY]: 'not json' })), [])
  assert.deepEqual(readSessionTexts(fakeStore({ [SESSION_TEXTS_KEY]: '{"a":1}' })), [])
  assert.deepEqual(readSessionTexts(fakeStore({ [SESSION_TEXTS_KEY]: '[1,"a",null]' })), ['a'])
})

test('a throwing store fires nothing rather than inflating depth 1', () => {
  const blocked: SessionStore = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  assert.equal(recordTextVisit(blocked, 'pastoral-rule-1'), null)
  // Every subsequent view is equally silent — no runaway depth=1 stream.
  assert.equal(recordTextVisit(blocked, 'on-the-priesthood-1'), null)
})
