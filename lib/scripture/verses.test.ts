/**
 * Tests for KJV verse resolution. Run: npx tsx --test lib/scripture/verses.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getVerseText, resolveVerseText } from './verses'
import { parseReferences } from './parse'
import type { ScriptureRef } from './types'

const ref = (over: Partial<ScriptureRef>): ScriptureRef => ({
  osis: 'John.3.16', book: 'John', bookName: 'John', chapter: 3, verse: 16, verseEnd: null,
  raw: '', index: 0, endIndex: 0, ...over,
})

test('getVerseText returns KJV text for a known verse', () => {
  assert.match(getVerseText('John.3.16') ?? '', /For God so loved the world/)
})

test('getVerseText returns null for an unknown key', () => {
  assert.equal(getVerseText('John.99.99'), null)
})

test('resolveVerseText handles a single verse', () => {
  const r = resolveVerseText(ref({}))
  assert.equal(r?.reference, 'John 3:16')
  assert.match(r?.text ?? '', /whosoever believeth in him/)
})

test('resolveVerseText joins a same-chapter range and labels it', () => {
  const r = resolveVerseText(ref({ book: 'Rom', bookName: 'Romans', chapter: 8, verse: 28, verseEnd: 30, osis: 'Rom.8.28-Rom.8.30' }))
  assert.equal(r?.reference, 'Romans 8:28-30')
  assert.match(r?.text ?? '', /work together for good/)      // v28
  assert.match(r?.text ?? '', /predestinate/)                 // v29/30
})

test('resolveVerseText returns null for a whole-chapter reference', () => {
  assert.equal(resolveVerseText(ref({ verse: null, verseEnd: null, osis: 'John.3' })), null)
})

test('resolveVerseText returns null for apocrypha (not in KJV bundle)', () => {
  assert.equal(resolveVerseText(ref({ book: 'Sir', bookName: 'Sirach', chapter: 3, verse: 2, osis: 'Sir.3.2' })), null)
})

test('end-to-end: parse a reference then resolve its KJV text', () => {
  const [parsed] = parseReferences('as it says, Philippians 4:13, therefore')
  const r = resolveVerseText(parsed)
  assert.equal(r?.reference, 'Philippians 4:13')
  assert.match(r?.text ?? '', /I can do all things through Christ/)
})
