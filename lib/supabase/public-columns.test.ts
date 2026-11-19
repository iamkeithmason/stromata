import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PUBLIC_TEXT_COLUMNS,
  PUBLIC_TEXT_SELECT,
  EDITORIAL_TEXT_COLUMNS,
  INTERNAL_TEXT_COLUMNS,
  PUBLIC_COLLECTION_COLUMNS,
  PUBLIC_COLLECTION_SELECT,
  EDITORIAL_COLLECTION_COLUMNS,
} from './public-columns'

/**
 * These are the tests that matter: an editorial column reaching the public
 * select is the bug that took every text page on the site to 404, because
 * PostgREST refuses the whole request rather than the one column.
 */
test('no editorial text column is exposed to the public select', () => {
  for (const col of EDITORIAL_TEXT_COLUMNS) {
    assert.ok(
      !(PUBLIC_TEXT_COLUMNS as readonly string[]).includes(col),
      `${col} is not granted to anon — including it makes PostgREST refuse the whole query`
    )
  }
})

test('no internal text column (the stored search vector) is exposed to the public select', () => {
  for (const col of INTERNAL_TEXT_COLUMNS) {
    assert.ok(
      !(PUBLIC_TEXT_COLUMNS as readonly string[]).includes(col),
      `${col} is not granted to anon, and every page selecting the public set would download it`
    )
  }
})

test('no editorial collection column is exposed to the public select', () => {
  for (const col of EDITORIAL_COLLECTION_COLUMNS) {
    assert.ok(
      !(PUBLIC_COLLECTION_COLUMNS as readonly string[]).includes(col),
      `${col} is not granted to anon`
    )
  }
})

test('the public select never contains a bare star', () => {
  // `*` is the exact shape that broke: it expands to ungranted columns.
  assert.ok(!PUBLIC_TEXT_SELECT.includes('*'))
  assert.ok(!PUBLIC_COLLECTION_SELECT.includes('*'))
})

test('the select string is a plain comma-separated PostgREST column list', () => {
  for (const select of [PUBLIC_TEXT_SELECT, PUBLIC_COLLECTION_SELECT]) {
    for (const part of select.split(',')) {
      assert.match(part.trim(), /^[a-z_]+$/)
    }
  }
})

test('the columns a text page renders are all present', () => {
  // Derived from app/texts/[slug]/page.tsx. If a page starts reading a new
  // column, it belongs here and in the constant — and must be anon-granted.
  const rendered = [
    'id', 'slug', 'title', 'body', 'summary', 'editorial_introduction',
    'source_attribution', 'provenance_notes', 'translation_notes',
    'accession_number', 'ocr_quality', 'collection_id', 'collection_order',
  ]
  for (const col of rendered) {
    assert.ok(
      (PUBLIC_TEXT_COLUMNS as readonly string[]).includes(col),
      `the text page reads ${col}, so the public select must include it`
    )
  }
})

test('column lists have no duplicates', () => {
  for (const cols of [PUBLIC_TEXT_COLUMNS, PUBLIC_COLLECTION_COLUMNS]) {
    assert.equal(new Set(cols).size, cols.length)
  }
})

/**
 * The drift guard. The page cannot interpolate PUBLIC_TEXT_SELECT — supabase-js
 * parses the select string at the type level and a template substitution makes
 * every field on the row untyped — so the list is spelled out there and checked
 * against the constant here. This is the test that would have caught the
 * original bug: it fails on a bare `*`, and on any editorial column creeping in.
 */
test('the text page select matches the canonical public column list', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile('app/texts/[slug]/page.tsx', 'utf8')

  // Anchor on the backtick select (the page's other two queries use quoted,
  // explicit lists) and take its end AFTER that point — generateMetadata's
  // .eq('slug', slug) appears earlier in the file.
  const start = src.indexOf('.select(`')
  assert.ok(start > -1, 'could not locate the text page select')
  const end = src.indexOf('`)', start)
  assert.ok(end > start, 'could not locate the end of the text page select')
  const select = src.slice(start, end)

  // The column list is everything before the first embed (`name:table(...)`).
  const columnPart = select.slice(0, select.indexOf('author:authors'))
  const columns = columnPart
    .replace('.select(`', '')
    .split(',')
    .map(c => c.trim())
    .filter(c => /^[a-z_]+$/.test(c))

  assert.ok(!columnPart.includes('*'), 'the text page must not select `*` — anon lacks a table-level grant')
  assert.deepEqual(
    [...columns].sort(),
    [...PUBLIC_TEXT_COLUMNS].sort(),
    'the text page column list has drifted from PUBLIC_TEXT_COLUMNS'
  )
})
