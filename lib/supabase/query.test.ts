import test from 'node:test'
import assert from 'node:assert/strict'
import { orThrow } from './query'

test('a successful query passes its data straight through', () => {
  const rows = [{ id: '1' }, { id: '2' }]
  assert.deepEqual(orThrow({ data: rows, error: null }, 'the library index'), rows)
})

test('an empty result is NOT an error', () => {
  // The distinction this module exists to draw: nothing found is a real answer,
  // and a page is entitled to render it (or call notFound()).
  assert.deepEqual(orThrow({ data: [], error: null }, 'the library index'), [])
  assert.equal(orThrow({ data: null, error: null }, 'a theme page'), null)
})

test('a query error throws rather than returning an empty result', () => {
  // The 2026-09-21 incident: Supabase answered 522 to everything, `data ?? []`
  // turned that into "0 texts", and a prerender baked it into the build.
  assert.throws(
    () => orThrow({ data: null, error: { message: 'connection timed out' } }, 'the library index'),
    /the library index/,
    'the message must name the surface — it is read off a build log',
  )
})

test('the thrown message carries the code and details when present', () => {
  assert.throws(
    () =>
      orThrow(
        { data: null, error: { message: 'permission denied for table texts', code: '42501', details: 'anon' } },
        'the reader page',
      ),
    (e: Error) =>
      e.message.includes('42501') &&
      e.message.includes('permission denied') &&
      e.message.includes('anon'),
  )
})

test('an HTML gateway error page is summarised, not dumped into the build log', () => {
  // What Supabase actually returned on 2026-09-21: a Cloudflare 522 page, ~7 kB
  // of markup, arriving as `error.message`. Unabridged it drowns the build log.
  const html =
    '<!DOCTYPE html>\n<html lang="en-US">\n<head><title>stromata.supabase.co | 522: Connection timed out</title></head>\n' +
    '<body>' + 'x'.repeat(7000) + '</body></html>'
  let thrown = ''
  try {
    orThrow({ data: null, error: { message: html } }, 'the library index')
  } catch (e) {
    thrown = (e as Error).message
  }
  assert.ok(thrown.includes('the library index'), 'still names the surface')
  assert.ok(thrown.includes('522'), 'keeps the useful part — the page title')
  assert.ok(thrown.includes('unreachable'), 'says what it means')
  assert.ok(!thrown.includes('<body>'), 'does not dump the markup')
  assert.ok(thrown.length < 400, `stays readable, was ${thrown.length} chars`)
})

test('a long plain-text error is truncated but kept', () => {
  const long = 'detail '.repeat(200)
  let thrown = ''
  try {
    orThrow({ data: null, error: { message: long } }, 'a theme page')
  } catch (e) {
    thrown = (e as Error).message
  }
  assert.ok(thrown.includes('detail'), 'keeps the beginning')
  assert.ok(thrown.endsWith('…'), 'marks the truncation')
  assert.ok(thrown.length < 400)
})
