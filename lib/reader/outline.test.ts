/**
 * Tests for the phone reader's outline (lib/reader/outline.ts). The cases are
 * the three texts the template was designed against: Tertullian's
 * Prescription (44 headed chapters), Chrysostom's Address on Vainglory (no
 * headings; eight editorial sections) and Cyril's Catechetical Lecture XXIII
 * (short, part 24 of 24).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Heading } from '@/lib/headings'
import {
  buildOutline, entryNumber, minutesLeft, positionLabel, readSections, roman, runningLabel,
  sheetLabel, showsRunningHead, unnumbered, windowContents,
} from './outline'

const h = (text: string, level: 1 | 2 | 3 = 2): Heading => ({ level, text, id: text.toLowerCase().replace(/\W+/g, '-') })
const chapters = Array.from({ length: 44 }, (_, i) => h(`Chapter ${i + 1}. Title ${i + 1}`))

test('headings win when there are enough of them, and lose their redundant numbering', () => {
  const o = buildOutline(chapters, [{ label: 'ignored' }, { label: 'also' }], [0, 1])
  assert.equal(o.kind, 'headings')
  assert.equal(o.entries.length, 44)
  assert.equal(o.entries[21].label, 'Title 22')
})

test('only the top heading level is listed when it has two or more entries', () => {
  const o = buildOutline([h('Book I', 2), h('a', 3), h('b', 3), h('Book II', 2), h('c', 3)], [], [])
  assert.deepEqual(o.entries.map(e => e.label), ['Book I', 'Book II'])
})

test('with too few headings, the editor\'s sections become the contents', () => {
  const sections = [{ label: 'Vainglory' }, { label: 'The newborn child' }, { label: 'The soul as a city' }]
  const o = buildOutline([h('Only one')], sections, [0, 1, 2])
  assert.equal(o.kind, 'sections')
  assert.deepEqual(o.entries.map(e => e.id), ['section-1', 'section-2', 'section-3'])
})

test('one section, or none found, is no contents at all', () => {
  assert.equal(buildOutline([], [{ label: 'x' }], [0]).kind, 'none')
  assert.equal(buildOutline([], [], []).kind, 'none')
})

test('readSections keeps only well-formed editorial entries', () => {
  assert.deepEqual(readSections(null), [])
  assert.deepEqual(readSections({ source: 'other', sections: [{ label: 'a', starts_with: 'b' }] }), [])
  assert.deepEqual(
    readSections({ source: 'editorial', sections: [{ label: ' A ', starts_with: 'x y' }, { label: '', starts_with: 'z' }, { label: 'B' }] }),
    [{ label: 'A', anchor: 'x y' }],
  )
})

test('sections count in roman with a section mark, chapters in arabic (Keith, 2 Nov)', () => {
  const sections = buildOutline([], Array.from({ length: 8 }, (_, i) => ({ label: `s${i}` })), [0, 1, 2, 3, 4, 5, 6, 7])
  assert.equal(positionLabel(sections, 1, null), '§ ii of viii')
  assert.equal(entryNumber('sections', 3), 'iv')
  const heads = buildOutline(chapters, [], [])
  assert.equal(positionLabel(heads, 21, null), '22 of 44')
  assert.equal(entryNumber('headings', 3), '4')
})

test('roman numerals', () => {
  assert.deepEqual([1, 4, 9, 10, 14, 40, 44].map(roman), ['i', 'iv', 'ix', 'x', 'xiv', 'xl', 'xliv'])
})

test('before the first entry the position falls back to the collection, then to nothing', () => {
  const o = buildOutline(chapters, [], [])
  const place = { title: 'Catechetical Lectures', part: 24, total: 24 }
  assert.equal(positionLabel(o, -1, place), 'Part 24 of 24')
  assert.equal(positionLabel(o, -1, null), null)
  assert.equal(runningLabel(o, -1, place, 'Lecture XXIII'), 'Catechetical Lectures')
  assert.equal(runningLabel({ kind: 'none', entries: [] }, -1, null, 'Lecture XXIII'), 'Lecture XXIII')
  assert.equal(runningLabel(o, 0, place, 'x'), 'Title 1')
})

test('the trigger names whatever leads the sheet, and never says "Way on"', () => {
  assert.equal(sheetLabel({ hasContents: true, hasNextPart: true, hasReadNext: true }), 'Contents')
  assert.equal(sheetLabel({ hasContents: false, hasNextPart: true, hasReadNext: true }), 'Next part')
  assert.equal(sheetLabel({ hasContents: false, hasNextPart: false, hasReadNext: true }), 'Read next')
  assert.equal(sheetLabel({ hasContents: false, hasNextPart: false, hasReadNext: false }), null)
})

test('short texts get no running head (Keith, 2 Nov)', () => {
  assert.equal(showsRunningHead(5), false)
  assert.equal(showsRunningHead(10), true)
})

test('minutes left never reads zero mid-text', () => {
  assert.equal(minutesLeft(95, 0), 95)
  assert.equal(minutesLeft(95, 0.5), 48)
  assert.equal(minutesLeft(95, 1), 1)
  assert.equal(minutesLeft(95, 2), 1)
})

test('unnumbered strips a leading chapter number but never empties a label', () => {
  assert.equal(unnumbered('Chapter XIV. On heresies'), 'On heresies')
  assert.equal(unnumbered('Lecture 3: Baptism'), 'Baptism')
  assert.equal(unnumbered('Chapter 14'), 'Chapter 14')
  assert.equal(unnumbered('Of prayer'), 'Of prayer')
})

const shape = (rows: ReturnType<typeof windowContents>) =>
  rows.map(r => (r.kind === 'entry' ? String(r.i + 1) : `[${r.from + 1}–${r.to + 1}]`)).join(' ')

test('short contents are listed whole', () => {
  assert.equal(shape(windowContents(8, 3)), '1 2 3 4 5 6 7 8')
})

test('long contents are windowed: first, fold, current ±2, fold', () => {
  assert.equal(shape(windowContents(44, 21)), '1 [2–19] 20 21 22 23 24 [25–44]')
  assert.equal(shape(windowContents(44, -1)), '1 2 3 [4–44]')
  assert.equal(shape(windowContents(44, 43)), '1 [2–41] 42 43 44')
  assert.equal(shape(windowContents(44, 2)), '1 2 3 4 5 [6–44]')
})

test('an expanded fold lists everything', () => {
  assert.equal(windowContents(44, 21, true).length, 44)
})
