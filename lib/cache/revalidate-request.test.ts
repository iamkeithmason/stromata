/**
 * POST /api/revalidate accepts concrete paths from a holder of the secret, and
 * nothing else. The two refusals that matter most: a dynamic-route pattern
 * (which would re-render the whole library) and a missing secret on the server
 * (which must fail closed, not open).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PATHS, parseRevalidateBody, secretMatches } from './revalidate-request'

test('text slugs become reader paths; extra paths pass through', () => {
  assert.deepEqual(parseRevalidateBody({ texts: ['on-prayer', 'on-prayer'], paths: ['/', '/texts/'] }), {
    ok: true,
    paths: ['/texts/on-prayer', '/', '/texts'],
  })
})

test('refuses route patterns, traversal and non-slugs', () => {
  for (const body of [
    { paths: ['/texts/[slug]'] },
    { paths: ['/texts/../admin'] },
    { paths: ['texts'] },
    { paths: ['//evil.example'] },
    { texts: ['Bad Slug'] },
    { texts: ['../x'] },
    { texts: [42] },
  ]) {
    assert.equal(parseRevalidateBody(body).ok, false, JSON.stringify(body))
  }
})

test('refuses an empty request and a non-object body', () => {
  for (const body of [{}, { texts: [] }, null, [], 'x', { texts: 'a' }]) {
    assert.equal(parseRevalidateBody(body).ok, false, JSON.stringify(body))
  }
})

test('caps the number of paths per call', () => {
  const texts = Array.from({ length: MAX_PATHS + 1 }, (_, i) => `t-${i}`)
  assert.equal(parseRevalidateBody({ texts }).ok, false)
  assert.equal(parseRevalidateBody({ texts: texts.slice(1) }).ok, true)
})

test('the secret must match exactly, and an unset one matches nothing', () => {
  assert.equal(secretMatches('s3cret', 's3cret'), true)
  assert.equal(secretMatches('s3cret ', 's3cret'), false)
  assert.equal(secretMatches('', 's3cret'), false)
  assert.equal(secretMatches(null, 's3cret'), false)
  assert.equal(secretMatches('anything', undefined), false)
  assert.equal(secretMatches('', ''), false)
})
