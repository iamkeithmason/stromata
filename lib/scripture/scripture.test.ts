/**
 * Tests for the scripture reference parser. Exercises the reference forms that
 * actually appear in the corpus — colon and dot separators, verse ranges,
 * whole-chapter citations, apocrypha, roman numerals, "Apoc." — plus the
 * false-positive guards (bare book names, non-biblical noise) and the
 * original-text offset mapping.
 *
 * Run: npx tsx --test lib/scripture/scripture.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseReferences, parseReferenceQuery } from './parse'
import { romanToArabic, normalizeScriptureText } from './normalize'
import { displayBookName } from './books'

test('parses arabic references with both colon and dot separators', () => {
  const refs = parseReferences('As it says in John 3:16 and also Prov. 22.28.')
  const osis = refs.map((r) => r.osis)
  assert.deepEqual(osis, ['John.3.16', 'Prov.22.28'])
  assert.equal(refs[0].book, 'John')
  assert.equal(refs[0].chapter, 3)
  assert.equal(refs[0].verse, 16)
  assert.equal(refs[0].verseEnd, null)
})

test('captures a same-chapter verse range with verseEnd', () => {
  const [ref] = parseReferences('See Rom. 8:28-30 on this.')
  assert.equal(ref.book, 'Rom')
  assert.equal(ref.chapter, 8)
  assert.equal(ref.verse, 28)
  assert.equal(ref.verseEnd, 30)
})

test('treats a whole-chapter citation as verse null', () => {
  const [ref] = parseReferences('The whole of Gen 1 concerns creation.')
  assert.equal(ref.book, 'Gen')
  assert.equal(ref.chapter, 1)
  assert.equal(ref.verse, null)
  assert.equal(ref.verseEnd, null)
})

test('resolves apocryphal books the Fathers cite', () => {
  const refs = parseReferences('Compare Ecclus. 3:2 with Wisd. 7:1.')
  assert.deepEqual(refs.map((r) => r.book), ['Sir', 'Wis'])
  assert.equal(refs[0].bookName, 'Sirach')
  assert.equal(refs[1].bookName, 'Wisdom of Solomon')
})

test('converts roman-numeral chapters (with an arabic verse)', () => {
  const [ref] = parseReferences('Blessed are the poor: St. Matt. v. 3.')
  assert.equal(ref.book, 'Matt')
  assert.equal(ref.chapter, 5)
  assert.equal(ref.verse, 3)
})

test('converts a roman chapter with a verse range', () => {
  const [ref] = parseReferences('On love, 1 Cor. xiii. 1-3.')
  assert.equal(ref.book, '1Cor')
  assert.equal(ref.chapter, 13)
  assert.equal(ref.verse, 1)
  assert.equal(ref.verseEnd, 3)
})

test('converts a roman chapter with no verse to a whole-chapter ref', () => {
  const [ref] = parseReferences('As in Rom. viii. throughout.')
  assert.equal(ref.book, 'Rom')
  assert.equal(ref.chapter, 8)
  assert.equal(ref.verse, null)
})

test('rewrites "Apoc." to Revelation', () => {
  const [ref] = parseReferences('And Apoc. 19.16 declares it.')
  assert.equal(ref.book, 'Rev')
  assert.equal(ref.chapter, 19)
  assert.equal(ref.verse, 16)
})

test('does not match bare book names (ordinary English words)', () => {
  const refs = parseReferences('The evangelist John and Mark saw Job about the Acts of the Kings.')
  assert.equal(refs.length, 0)
})

test('ignores non-biblical numbered noise', () => {
  const refs = parseReferences('See Vol. 2, Damascus c. 730, and Catechesi 37.')
  assert.equal(refs.length, 0)
})

test('does not convert a lone single-letter roman with no verse', () => {
  // "Ps. v" alone is too ambiguous to treat as chapter 5.
  const refs = parseReferences('He sang Ps. v and departed.')
  assert.equal(refs.length, 0)
})

test('offsets point into the ORIGINAL text for an untouched reference', () => {
  const text = 'Quoting John 3:16 here.'
  const [ref] = parseReferences(text)
  assert.equal(text.slice(ref.index, ref.endIndex), 'John 3:16')
})

test('offsets map back to the original citation span for a rewritten roman reference', () => {
  const text = 'Note St. Matt. v. 3 closely.'
  const [ref] = parseReferences(text)
  // The rewritten match ("Matt. 5:3") differs in length from the source, so the
  // offsets are mapped back to the original span, which the parser captures
  // including the "St." honorific.
  assert.equal(text.slice(ref.index, ref.endIndex), 'St. Matt. v. 3')
})

test('returns every occurrence, in document order', () => {
  const refs = parseReferences('We read John 3:16, then Rom 8:1, then John 3:16 again.')
  assert.equal(refs.length, 3)
  assert.deepEqual(refs.map((r) => r.osis), ['John.3.16', 'Rom.8.1', 'John.3.16'])
  assert.ok(refs[0].index < refs[1].index && refs[1].index < refs[2].index)
})

test('parseReferenceQuery reads a typed lookup', () => {
  const q = parseReferenceQuery('Romans 8:28')
  assert.equal(q?.book, 'Rom')
  assert.equal(q?.chapter, 8)
  assert.equal(q?.verse, 28)
})

test('parseReferenceQuery returns null for unparseable input', () => {
  assert.equal(parseReferenceQuery('the good life'), null)
})

test('romanToArabic handles valid numerals and rejects junk', () => {
  assert.equal(romanToArabic('xiv'), 14)
  assert.equal(romanToArabic('cxix'), 119)
  assert.equal(romanToArabic('iv'), 4)
  assert.equal(romanToArabic('ill'), null)
  assert.equal(romanToArabic(''), null)
})

test('displayBookName falls back readably for unmapped ids', () => {
  assert.equal(displayBookName('1Cor'), '1 Corinthians')
  assert.equal(displayBookName('John'), 'John')
})

test('normalizeScriptureText leaves untouched text identical', () => {
  const src = 'Plain prose with no references at all.'
  assert.equal(normalizeScriptureText(src).text, src)
})
