/**
 * Unit tests for the admin Library's parameter handling.
 *   npx tsx --test lib/admin/text-index.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTextIndexParams, searchTerm, pageRange, totalPages, toQueryString, PAGE_SIZE,
} from './text-index'

test('defaults when nothing is supplied', () => {
  const p = parseTextIndexParams({})
  assert.equal(p.q, '')
  assert.equal(p.status, 'all')
  assert.equal(p.intro, 'any')
  assert.equal(p.authorDraft, 'any')
  assert.equal(p.provenance, 'any')
  assert.equal(p.page, 1)
})

test('unknown enum values fall back rather than reaching a query', () => {
  const p = parseTextIndexParams({ status: 'archived', intro: 'maybe', provenance: 'x' })
  assert.equal(p.status, 'all')
  assert.equal(p.intro, 'any')
  assert.equal(p.provenance, 'any')
})

test('page must be a positive integer; arrays take the first value', () => {
  assert.equal(parseTextIndexParams({ page: '0' }).page, 1)
  assert.equal(parseTextIndexParams({ page: '-3' }).page, 1)
  assert.equal(parseTextIndexParams({ page: 'abc' }).page, 1)
  assert.equal(parseTextIndexParams({ page: ['4', '9'] }).page, 4)
})

test('search term is trimmed and capped', () => {
  assert.equal(parseTextIndexParams({ q: '  rule  ' }).q, 'rule')
  assert.equal(parseTextIndexParams({ q: 'a'.repeat(300) }).q.length, 100)
})

test('searchTerm strips characters that would reshape a PostgREST filter', () => {
  assert.equal(searchTerm('a,b)'), 'a b')
  assert.equal(searchTerm('100%_sure\\'), '100 sure')
  assert.equal(searchTerm('title.eq.x),id.neq.0'), 'title.eq.x id.neq.0')
  assert.equal(searchTerm('  Benedict   of  Nursia '), 'Benedict of Nursia')
})

test('pageRange is inclusive and PAGE_SIZE wide', () => {
  assert.deepEqual(pageRange(1), [0, PAGE_SIZE - 1])
  assert.deepEqual(pageRange(3), [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1])
  assert.deepEqual(pageRange(0), [0, PAGE_SIZE - 1])
})

test('totalPages never drops below one', () => {
  assert.equal(totalPages(0), 1)
  assert.equal(totalPages(PAGE_SIZE), 1)
  assert.equal(totalPages(PAGE_SIZE + 1), 2)
})

test('toQueryString omits defaults and round-trips through the parser', () => {
  assert.equal(toQueryString(parseTextIndexParams({})), '')
  const p = parseTextIndexParams({ q: 'rule', status: 'draft', intro: 'no', page: '2' })
  const qs = toQueryString(p)
  const back = parseTextIndexParams(Object.fromEntries(new URLSearchParams(qs)))
  assert.deepEqual(back, p)
  assert.equal(toQueryString(p, { page: 1 }).includes('page'), false)
})
