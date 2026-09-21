/**
 * Tests for the mount-time tracking guard.
 *
 * The bug being guarded against is silent: `window.umami?.track(...)` when the
 * tracker has not loaded yet drops the event and reports nothing. So the cases
 * here are "tracker arrives late", "tracker never arrives" and "reader leaves
 * while we wait" — the three ways a mount-time event can go missing.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trackWhenReady, type UmamiWindow } from './track-when-ready'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

function recorder() {
  const calls: [string, unknown][] = []
  return { calls, track: (e: string, d?: unknown) => void calls.push([e, d]) }
}

test('fires immediately when the tracker is already up', () => {
  const rec = recorder()
  const win: UmamiWindow = { umami: { track: rec.track } }
  trackWhenReady('text-session-depth', { depth: 1, text: 'a-b' }, { win })
  assert.deepEqual(rec.calls, [['text-session-depth', { depth: 1, text: 'a-b' }]])
})

test('fires once the tracker arrives late', async () => {
  const rec = recorder()
  const win: UmamiWindow = {}
  trackWhenReady('text-session-depth', { depth: 2, text: 'c-d' }, { win, intervalMs: 5, timeoutMs: 500 })
  assert.deepEqual(rec.calls, [], 'must not fire before the tracker exists')

  win.umami = { track: rec.track }
  await tick(40)
  assert.deepEqual(rec.calls, [['text-session-depth', { depth: 2, text: 'c-d' }]])

  // And only once — the interval must stop itself.
  await tick(40)
  assert.equal(rec.calls.length, 1)
})

test('gives up quietly when the tracker never arrives', async () => {
  const win: UmamiWindow = {}
  trackWhenReady('text-session-depth', { depth: 1, text: 'a-b' }, { win, intervalMs: 5, timeoutMs: 20 })
  await tick(60)
  // Arriving after the timeout is too late — the reader has moved on.
  const rec = recorder()
  win.umami = { track: rec.track }
  await tick(30)
  assert.deepEqual(rec.calls, [])
})

test('cancelling stops a pending fire', async () => {
  const rec = recorder()
  const win: UmamiWindow = {}
  const cancel = trackWhenReady('text-session-depth', { depth: 1, text: 'a-b' }, { win, intervalMs: 5, timeoutMs: 500 })
  cancel()
  win.umami = { track: rec.track }
  await tick(40)
  assert.deepEqual(rec.calls, [])
})

test('no window at all is a no-op, not a crash', () => {
  assert.doesNotThrow(() => trackWhenReady('x', {}, { win: undefined as unknown as UmamiWindow }))
})
