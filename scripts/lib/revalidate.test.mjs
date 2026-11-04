// The script-side half of on-demand revalidation. What matters: it is never
// fatal (the DB write has already happened), it says why when it fails, and it
// sends nothing at all when nothing changed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { revalidateSite, explain } from './revalidate.mjs'

const okFetch = calls => async (url, init) => {
  calls.push({ url, init })
  return { ok: true, status: 200, headers: new Map() }
}

test('posts the changed slugs with the secret to the configured site', async () => {
  const calls = []
  const ok = await revalidateSite(
    { texts: ['a', 'b', 'a'], paths: ['/'] },
    { fetch: okFetch(calls), env: { REVALIDATE_SECRET: 'x', REVALIDATE_URL: 'http://localhost:3000/' }, log: () => {} }
  )
  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://localhost:3000/api/revalidate')
  assert.equal(calls[0].init.headers['x-revalidate-secret'], 'x')
  assert.deepEqual(JSON.parse(calls[0].init.body), { texts: ['a', 'b'], paths: ['/'] })
})

test('sends nothing when nothing changed', async () => {
  const calls = []
  assert.equal(await revalidateSite({ texts: [] }, { fetch: okFetch(calls), env: {}, log: () => {} }), true)
  assert.equal(calls.length, 0)
})

test('without a secret it warns and returns false instead of throwing', async () => {
  const calls = []
  const warnings = []
  const ok = await revalidateSite({ texts: ['a'] }, { fetch: okFetch(calls), env: {}, log: m => warnings.push(m) })
  assert.equal(ok, false)
  assert.equal(calls.length, 0)
  assert.match(warnings[0], /REVALIDATE_SECRET/)
})

test('a network error or refusal is a warning, not a throw', async () => {
  const warnings = []
  const env = { REVALIDATE_SECRET: 'x' }
  const boom = async () => { throw new Error('ECONNREFUSED') }
  assert.equal(await revalidateSite({ texts: ['a'] }, { fetch: boom, env, log: m => warnings.push(m) }), false)
  const refused = async () => ({ ok: false, status: 401, headers: new Map() })
  assert.equal(await revalidateSite({ texts: ['a'] }, { fetch: refused, env, log: m => warnings.push(m) }), false)
  assert.match(warnings.join('\n'), /ECONNREFUSED[\s\S]*401/)
})

test('splits a full-corpus run into batches under the endpoint cap', async () => {
  const calls = []
  const texts = Array.from({ length: 1201 }, (_, i) => `t-${i}`)
  await revalidateSite({ texts, paths: ['/'] }, { fetch: okFetch(calls), env: { REVALIDATE_SECRET: 'x' }, log: () => {} })
  const bodies = calls.map(c => JSON.parse(c.init.body))
  assert.deepEqual(bodies.map(b => b.texts.length), [500, 500, 201])
  assert.deepEqual(bodies.map(b => Boolean(b.paths)), [true, false, false])
})

test('names the Vercel bot challenge when that is what refused it', () => {
  const challenged = { status: 429, headers: new Map([['x-vercel-mitigated', 'challenge']]) }
  assert.match(explain(challenged), /firewall rule/)
  assert.match(explain({ status: 503, headers: new Map() }), /not set in Vercel/)
})
