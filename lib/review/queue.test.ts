/**
 * Unit tests for the pure review-queue logic.
 *   npx tsx --test lib/review/queue.test.ts
 *
 * /admin/review cannot be opened by Claude (it needs Keith's own login, see
 * CLAUDE.md), so the judgement calls it makes are verified here rather than by
 * loading the page.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  taxonomyWarnings,
  summariseProvenance,
  spotCheck,
  firstPendingIndex,
  pageForIndex,
  clampPage,
  progressOf,
} from './queue'

// ── Taxonomy ─────────────────────────────────────────────────────────────────

test('flags a late author filed under Early Church', () => {
  const w = taxonomyWarnings({
    authorName: 'Thomas Aquinas', traditionSlug: 'early-church', deathYear: 1274,
  })
  assert.ok(w.some(m => m.includes('Early Church') && m.includes('1274')))
})

test('flags a pre-Nicene author filed under Patristic', () => {
  const w = taxonomyWarnings({ authorName: 'Ignatius', traditionSlug: 'patristic', deathYear: 108 })
  assert.ok(w.some(m => m.includes('Patristic')))
})

test('accepts an author who genuinely sits in their tradition', () => {
  assert.deepEqual(
    taxonomyWarnings({ authorName: 'Augustine', traditionSlug: 'patristic', deathYear: 430, themeCount: 3 }),
    []
  )
})

test('does not fight over the 325-340 overlap', () => {
  // Nicaea is a gradual boundary, not a cliff; a death in the 330s is arguably
  // either tradition and must not produce a warning in both directions.
  assert.deepEqual(
    taxonomyWarnings({ authorName: 'X', traditionSlug: 'early-church', deathYear: 335, themeCount: 1 }),
    []
  )
  assert.deepEqual(
    taxonomyWarnings({ authorName: 'X', traditionSlug: 'patristic', deathYear: 335, themeCount: 1 }),
    []
  )
})

test('flags a missing tradition, a missing death year, and no themes', () => {
  const w = taxonomyWarnings({ authorName: 'Anon', traditionSlug: null, deathYear: null, themeCount: 0 })
  assert.ok(w.some(m => m.includes('no tradition')))
  assert.ok(w.some(m => m.includes('no death year')))
  assert.ok(w.some(m => m.includes('no themes')))
})

test('flags a draft author, whose page would publish bio-less', () => {
  const w = taxonomyWarnings({
    authorName: 'Hermas', traditionSlug: 'early-church', deathYear: 150,
    authorIsDraft: true, themeCount: 2,
  })
  assert.ok(w.some(m => m.includes('draft author')))
})

test('a tradition with no implied range is never second-guessed', () => {
  assert.deepEqual(
    taxonomyWarnings({ authorName: 'Luther', traditionSlug: 'lutheran', deathYear: 1546, themeCount: 2 }),
    []
  )
})

// ── Provenance ───────────────────────────────────────────────────────────────

const base = {
  source_attribution: 'Translated by J. B. Lightfoot.',
  provenance_notes: 'From Archive.org, accessed September 2026.',
  translation_notes: 'Lightfoot (1828–1889); public domain.',
  source_url: 'https://archive.org/details/x',
}

test('a single-source collection reports consistent, with the shared values', () => {
  const s = summariseProvenance([
    { ...base, title: 'Book I' },
    { ...base, title: 'Book II' },
  ])
  assert.equal(s.consistent, true)
  assert.equal(s.conflicts.length, 0)
  assert.equal(s.shared.source_attribution, 'Translated by J. B. Lightfoot.')
})

test('a mixed collection reports the conflict and names the texts', () => {
  // This is the case that must be loud: verifying one provenance while a text
  // in the batch came from somewhere else is how a rights problem ships.
  const s = summariseProvenance([
    { ...base, title: 'Book I' },
    { ...base, title: 'Book II', translation_notes: 'Modern translation, rights unclear.' },
  ])
  assert.equal(s.consistent, false)
  const conflict = s.conflicts.find(c => c.field === 'translation_notes')
  assert.ok(conflict, 'translation_notes should conflict')
  assert.equal(conflict!.values.length, 2)
  assert.ok(conflict!.values.some(v => v.titles.includes('Book II')))
  // And the conflicting field must not be presented as a shared value.
  assert.equal(s.shared.translation_notes, null)
})

test('whitespace differences are not treated as a conflict', () => {
  const s = summariseProvenance([
    { ...base, title: 'A' },
    { ...base, title: 'B', source_attribution: '  Translated by J. B. Lightfoot.  ' },
  ])
  assert.equal(s.consistent, true)
})

test('a field missing everywhere is shared-null, not a conflict', () => {
  const s = summariseProvenance([
    { ...base, title: 'A', source_url: null },
    { ...base, title: 'B', source_url: null },
  ])
  assert.equal(s.consistent, true)
  assert.equal(s.shared.source_url, null)
})

test('a field present on some texts and absent on others IS a conflict', () => {
  const s = summariseProvenance([
    { ...base, title: 'A' },
    { ...base, title: 'B', source_url: null },
  ])
  assert.equal(s.consistent, false)
  assert.ok(s.conflicts.some(c => c.field === 'source_url'))
})

// ── Spot check ───────────────────────────────────────────────────────────────

test('short bodies get one window and no middle', () => {
  const { head, middle } = spotCheck('A short body.')
  assert.equal(head, 'A short body.')
  assert.equal(middle, null)
})

test('long bodies get a head and a middle, both cut at word boundaries', () => {
  const body = ('lorem ipsum dolor sit amet '.repeat(200)).trim()
  const { head, middle } = spotCheck(body)
  assert.ok(head.endsWith('…'))
  assert.ok(middle && middle.endsWith('…'))
  // The real guarantee: no window ends mid-word before the ellipsis.
  const headWord = head.slice(0, -1).split(' ').pop()!
  assert.ok(body.includes(headWord), 'head must end on a whole word')
})

test('the middle window does not start mid-word', () => {
  const body = ('alpha bravo charlie delta echo '.repeat(200)).trim()
  const { middle } = spotCheck(body)
  assert.ok(middle)
  const firstWord = middle!.split(' ')[0]
  assert.ok(
    ['alpha', 'bravo', 'charlie', 'delta', 'echo'].includes(firstWord),
    `middle started mid-word: "${firstWord}"`
  )
})

test('an empty or missing body is handled', () => {
  assert.deepEqual(spotCheck(''), { head: '', middle: null })
  assert.deepEqual(spotCheck(null), { head: '', middle: null })
})

// ── Resume and paging ────────────────────────────────────────────────────────

test('resume lands on the first undecided card', () => {
  assert.equal(firstPendingIndex(['approved', 'approved', 'pending', 'held']), 2)
  assert.equal(firstPendingIndex(['approved', 'held', null]), 2, 'null counts as pending')
})

test('resume reports -1 when everything has been decided', () => {
  assert.equal(firstPendingIndex(['approved', 'held', 'approved']), -1)
})

test('paging puts the resume point on the right page', () => {
  // The Tractates are 122 texts; resuming at #45 must open page 3, not page 1.
  assert.equal(pageForIndex(0), 1)
  assert.equal(pageForIndex(19), 1)
  assert.equal(pageForIndex(20), 2)
  assert.equal(pageForIndex(44), 3)
  assert.equal(pageForIndex(-1), 1, 'nothing pending opens at the start')
})

test('a hand-typed ?page= is clamped to a page that exists', () => {
  assert.equal(clampPage('3', 122), 3)
  assert.equal(clampPage('99', 122), 7)   // 122 texts / 20 = 7 pages
  assert.equal(clampPage('0', 122), 1)
  assert.equal(clampPage('-4', 122), 1)
  assert.equal(clampPage('banana', 122), 1)
  assert.equal(clampPage(undefined, 122), 1)
  assert.equal(clampPage('2', 0), 1, 'an empty collection still has page 1')
})

test('progress counts each state once', () => {
  assert.deepEqual(
    progressOf(['approved', 'approved', 'held', 'pending', null]),
    { total: 5, approved: 2, held: 1, pending: 2 }
  )
})
