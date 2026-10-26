/**
 * Unit tests for collection row titles.
 *   npx tsx --test lib/collections/short-titles.test.ts
 *
 * Cases are real collections from the library (26 Oct 2026).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortCollectionTitles as short } from './short-titles'

test('drops the shared work name before a comma', () => {
  assert.deepEqual(
    short(['The Refutation of All Heresies, Book I', 'The Refutation of All Heresies, Book IV', 'The Refutation of All Heresies, Book X']),
    ['Book I', 'Book IV', 'Book X'],
  )
})

test('uses the last separator in the shared head', () => {
  assert.deepEqual(
    short(['Hydriotaphia, Urn Burial: Chapter I', 'Hydriotaphia, Urn Burial: Chapter II', 'Hydriotaphia, Urn Burial: Chapter V']),
    ['Chapter I', 'Chapter II', 'Chapter V'],
  )
})

test('handles a dash separator', () => {
  assert.deepEqual(
    short(['Book of Pastoral Rule — Part I', 'Book of Pastoral Rule — Part II', 'Book of Pastoral Rule — Part III', 'Book of Pastoral Rule — Part IV']),
    ['Part I', 'Part II', 'Part III', 'Part IV'],
  )
})

test('removes the closing bracket when the head ends at an opening one', () => {
  assert.deepEqual(
    short(['The Shepherd of Hermas (Book I)', 'The Shepherd of Hermas (Book II)', 'The Shepherd of Hermas (Book III)']),
    ['Book I', 'Book II', 'Book III'],
  )
})

test('drops a lone trailing full stop', () => {
  assert.deepEqual(
    short(['On the Priesthood. Book I.', 'On the Priesthood. Book II.']),
    ['Book I', 'Book II'],
  )
})

test('keeps a subtitle in brackets after the part', () => {
  assert.deepEqual(
    short(['Divine Institutes, Book I (Of the False Worship of the Gods)', 'Divine Institutes, Book II (Of the Origin of Error)']),
    ['Book I (Of the False Worship of the Gods)', 'Book II (Of the Origin of Error)'],
  )
})

test('leaves titles alone when the shared head is only a word', () => {
  const t = ['Tractate 1 (John 1:1-5)', 'Tractate 2 (John 1:6-14)', 'Tractate 10 (John 2:12-21)']
  assert.deepEqual(short(t), t)
  const d = ['Demonstration 1 (Of Faith)', 'Demonstration 5 (Of Wars)']
  assert.deepEqual(short(d), d)
})

test('leaves unrelated titles alone', () => {
  const t = ['Second Letter to Henry Bullinger', 'Third Letter to Henry Bullinger', 'Letter to Thomas Harding on his Apostasy']
  assert.deepEqual(short(t), t)
})

test('leaves a single title alone', () => {
  assert.deepEqual(short(["On the Lord's Prayer"]), ["On the Lord's Prayer"])
})

test('does not strip when one row would be left empty', () => {
  const t = ['The City of God', 'The City of God, Book II']
  assert.deepEqual(short(t), t)
})
