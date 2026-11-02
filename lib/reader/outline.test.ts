import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractHeadings } from '@/lib/headings'
import {
  buildOutline,
  contentsRows,
  leads,
  minutesLeft,
  navLabel,
  positionLabel,
  unnumbered,
  wherePhrase,
  type CollectionPosition,
  type SectionsDoc,
} from './outline'

const SECTIONS: SectionsDoc = {
  source: 'editorial',
  sections: [
    { label: 'Vainglory', starts_with: 'Has any man done what I' },
    { label: 'The newborn child', starts_with: 'The man-child has lately been born.' },
  ],
}

const CYRIL: CollectionPosition = {
  title: 'Catechetical Lectures', slug: 'catechetical-lectures', part: 24, total: 24,
  prev: { slug: 'lecture-xxii', title: 'Lecture XXII' }, next: null,
}

test('a text with three headings uses them, and ignores any sections', () => {
  const outline = buildOutline(extractHeadings('## Chapter 1. Introductory\n\n## Chapter 2. On truth\n\n## Chapter 3. End'), SECTIONS)
  assert.equal(outline.kind, 'headings')
  assert.deepEqual(outline.entries.map(e => e.label), ['Introductory', 'On truth', 'End'])
  assert.deepEqual(outline.entries[0].target, { type: 'id', id: 'chapter-1-introductory' })
})

test('without enough headings, approved sections are used; without either, nothing', () => {
  const withSections = buildOutline(extractHeadings('# Dedication'), SECTIONS)
  assert.equal(withSections.kind, 'sections')
  assert.deepEqual(withSections.entries[1].target, { type: 'anchor', startsWith: 'The man-child has lately been born.' })
  assert.deepEqual(buildOutline([], null), { kind: 'none', entries: [] })
  assert.equal(buildOutline([], { source: 'editorial', sections: [SECTIONS!.sections[0]] }).kind, 'none', 'one section is not a contents list')
})

test('chapter numbers come off labels, but a bare number stays', () => {
  assert.equal(unnumbered('Chapter 14. Curiosity Ought Not Range'), 'Curiosity Ought Not Range')
  assert.equal(unnumbered('Book IV The Fall'), 'The Fall')
  assert.equal(unnumbered('Chapter 1.'), 'Chapter 1.')
  assert.equal(unnumbered('The soul as a city'), 'The soul as a city')
})

test('position: § for sections, plain numbers for headings, the part as fallback', () => {
  assert.equal(positionLabel('sections', 1, 8, null), '§ 2 of 8')
  assert.equal(positionLabel('headings', 21, 44, null), '22 of 44')
  assert.equal(positionLabel('none', -1, 0, CYRIL), 'Part 24 of 24')
  assert.equal(positionLabel('sections', -1, 8, null), null, 'before the first section, no position')
})

test('the label names what leads the sheet', () => {
  const contents = buildOutline([], SECTIONS)
  assert.equal(navLabel(contents, null), 'Contents')
  assert.equal(navLabel({ kind: 'none', entries: [] }, { ...CYRIL, next: { slug: 'x', title: 'X' } }), 'Next part')
  assert.equal(navLabel({ kind: 'none', entries: [] }, CYRIL), 'Read next')
})

test('long contents are windowed round the current entry; short ones are not', () => {
  assert.equal(contentsRows(8, 5, false).length, 8)
  assert.deepEqual(contentsRows(44, 21, false), [
    { kind: 'entry', index: 0 },
    { kind: 'fold', from: 1, to: 18 },
    { kind: 'entry', index: 19 }, { kind: 'entry', index: 20 }, { kind: 'entry', index: 21 },
    { kind: 'entry', index: 22 }, { kind: 'entry', index: 23 },
    { kind: 'fold', from: 24, to: 43 },
  ])
  // Before the first heading, the window still shows a few entries.
  assert.deepEqual(contentsRows(44, -1, false).slice(0, 4), [
    { kind: 'entry', index: 0 }, { kind: 'entry', index: 1 }, { kind: 'entry', index: 2 }, { kind: 'entry', index: 3 },
  ])
  assert.equal(contentsRows(44, 21, true).length, 44)
})

test('in a collection the next part leads, above the editor\'s pick; at most three, no repeats', () => {
  const picks = [
    { slug: 'basil', title: 'Address to Young Men', kind: 'editorial' },
    { slug: 'priesthood-3', title: 'On the Priesthood III', kind: 'author' },
    { slug: 'conference-17', title: 'Conference 17', kind: 'theme' },
  ]
  const next = { ...CYRIL, next: { slug: 'basil', title: 'Address to Young Men' } }
  assert.deepEqual(leads(next, picks).map(l => [l.kicker, l.slug, l.pick]), [
    ['next-part', 'basil', 'next-part'],
    ['or', 'priesthood-3', 'author'],
    ['or', 'conference-17', 'theme'],
  ])
  assert.deepEqual(leads(null, picks).map(l => l.kicker), ['read-next', 'or', 'or'])
  assert.deepEqual(leads(CYRIL, []), [])
})

test('progress in words and minutes', () => {
  assert.equal(wherePhrase(0.05), 'Just begun')
  assert.equal(wherePhrase(0.2), 'About a fifth of the way through')
  assert.equal(wherePhrase(0.9), 'Near the end')
  assert.equal(minutesLeft(65, 0.2), 52)
  assert.equal(minutesLeft(65, 1), 1)
  assert.equal(minutesLeft(65, -0.3), 65)
})
