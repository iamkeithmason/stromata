/**
 * Unit tests for the sliding-session arithmetic.
 *   npx tsx --test lib/admin/session.test.ts
 *
 * The renewal threshold is invisible when wrong — a session that never renews
 * looks exactly like one that does, until someone is logged out mid-review a
 * month later. So the arithmetic is pinned here rather than reasoned about.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldRenew,
  expOf,
  sessionCookieOptions,
  SESSION_DAYS,
  RENEW_BELOW_DAYS,
} from './session'

const DAY = 60 * 60 * 24
const now = 1_800_000_000

const expIn = (days: number) => now + days * DAY

test('a freshly issued session is not renewed', () => {
  // 30 days remaining is above the 25-day threshold.
  assert.equal(shouldRenew(expIn(SESSION_DAYS), now), false)
})

test('a session renews once it has aged past the gap', () => {
  // 24 days remaining = 6 days since issue, below the 25-day threshold.
  assert.equal(shouldRenew(expIn(24), now), true)
  assert.equal(shouldRenew(expIn(1), now), true)
})

test('renewal is self-limiting — one write per gap, not per request', () => {
  // This is the property that keeps the review queue's ~900ms autosave from
  // attaching a Set-Cookie to every response. After a renewal the remaining
  // life is SESSION_DAYS, which must sit above the threshold; otherwise every
  // subsequent request would renew again.
  assert.ok(
    SESSION_DAYS > RENEW_BELOW_DAYS,
    'SESSION_DAYS must exceed RENEW_BELOW_DAYS or renewal never settles'
  )
  assert.equal(shouldRenew(expIn(SESSION_DAYS), now), false, 'just-renewed must not renew again')
})

test('the gap is 5 days of use', () => {
  assert.equal(SESSION_DAYS - RENEW_BELOW_DAYS, 5)
})

test('the boundary is exclusive, so exactly-at-threshold does not churn', () => {
  assert.equal(shouldRenew(expIn(RENEW_BELOW_DAYS), now), false)
  assert.equal(shouldRenew(expIn(RENEW_BELOW_DAYS) - 1, now), true)
})

test('an expired token is not renewed', () => {
  // jwtVerify rejects these first, but renewing one would resurrect a dead
  // session rather than sending the user back to the login page.
  assert.equal(shouldRenew(expIn(-1), now), false)
  assert.equal(shouldRenew(now, now), false, 'exactly expired is still expired')
})

test('a token with no usable exp is left alone', () => {
  // Renewing these on every request is exactly what the threshold prevents.
  assert.equal(shouldRenew(undefined, now), false)
  assert.equal(shouldRenew(NaN, now), false)
  assert.equal(shouldRenew(Infinity, now), false)
})

test('expOf reads a numeric exp and ignores anything else', () => {
  assert.equal(expOf({ exp: 123 }), 123)
  assert.equal(expOf({}), undefined)
  assert.equal(expOf({ exp: '123' } as unknown as { exp: number }), undefined)
})

test('the cookie stays httpOnly, lax, and site-wide', () => {
  // The middleware rewrites this cookie on renewal; if these drift, a renewed
  // session silently becomes weaker than the one login issued.
  const options = sessionCookieOptions()
  assert.equal(options.httpOnly, true)
  assert.equal(options.sameSite, 'lax')
  assert.equal(options.path, '/')
  assert.equal(options.maxAge, SESSION_DAYS * DAY)
})
