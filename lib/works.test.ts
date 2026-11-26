import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWorks,
  corpusLine,
  formatDuration,
  formHeading,
  groupByForm,
  naturalCompare,
  shortReads,
  totals,
  type CollectionMeta,
  type WorkText,
} from './works'
import { GENRES } from './pipeline/vocab'

function text(over: Partial<WorkText> & { slug: string }): WorkText {
  return {
    id: over.slug,
    title: over.slug,
    word_count: 2000, // 10 minutes
    collection_id: null,
    collection_order: null,
    genre: 'Treatise',
    themes: [],
    ...over,
  }
}

const tractates: CollectionMeta = { id: 'c1', title: 'Tractates on the Gospel of John', slug: 'tractates-john', published: true }

test('natural sort puts Tractate 2 before Tractate 10 and 100', () => {
  const titles = ['Tractate 100', 'Tractate 10', 'Tractate 2', 'Tractate 1']
  assert.deepEqual([...titles].sort(naturalCompare), ['Tractate 1', 'Tractate 2', 'Tractate 10', 'Tractate 100'])
})

test('a 124-part collection is one work, its parts in collection order', () => {
  const parts = Array.from({ length: 124 }, (_, i) =>
    text({ slug: `tractate-${i + 1}`, title: `Tractate ${i + 1}`, collection_id: 'c1', collection_order: i + 1, genre: 'Homily' }),
  )
  // Feed them in title order (the old page's lexical order) to prove the sort.
  parts.sort((a, b) => a.title.localeCompare(b.title))
  const works = buildWorks(parts, [tractates])
  assert.equal(works.length, 1)
  const w = works[0]
  assert.equal(w.kind, 'collection')
  if (w.kind !== 'collection') return
  assert.equal(w.parts.length, 124)
  assert.deepEqual(w.parts.slice(0, 3).map(p => p.title), ['Tractate 1', 'Tractate 2', 'Tractate 3'])
  assert.equal(w.parts[123].title, 'Tractate 124')
  assert.equal(w.minutes, 1240)
  assert.equal(w.form, 'Homily')
})

test('parts without collection_order follow, in natural title order', () => {
  const works = buildWorks(
    [
      text({ slug: 'b', title: 'Book 10', collection_id: 'c1' }),
      text({ slug: 'a', title: 'Book 2', collection_id: 'c1' }),
      text({ slug: 'z', title: 'Preface', collection_id: 'c1', collection_order: 1 }),
    ],
    [tractates],
  )
  const w = works[0]
  assert.equal(w.kind, 'collection')
  if (w.kind === 'collection') assert.deepEqual(w.parts.map(p => p.title), ['Preface', 'Book 2', 'Book 10'])
})

test('a text in an unpublished or unknown collection stands alone', () => {
  const works = buildWorks(
    [text({ slug: 'x', collection_id: 'hidden' }), text({ slug: 'y', collection_id: 'missing' })],
    [{ id: 'hidden', title: 'Hidden', slug: 'hidden', published: false }],
  )
  assert.deepEqual(works.map(w => w.kind), ['text', 'text'])
})

test("a collection's form is its parts' most common genre", () => {
  const works = buildWorks(
    [
      text({ slug: 'p1', collection_id: 'c1', collection_order: 1, genre: 'Letter' }),
      text({ slug: 'p2', collection_id: 'c1', collection_order: 2, genre: 'Prayer' }),
      text({ slug: 'p3', collection_id: 'c1', collection_order: 3, genre: 'Prayer' }),
    ],
    [tractates],
  )
  assert.equal(works[0].form, 'Prayer')
})

test('collection themes are the three most frequent across its parts', () => {
  const works = buildWorks(
    [
      text({ slug: 'p1', collection_id: 'c1', themes: ['Prayer', 'Humility'] }),
      text({ slug: 'p2', collection_id: 'c1', themes: ['Prayer', 'Virtue', 'Humility'] }),
      text({ slug: 'p3', collection_id: 'c1', themes: ['Prayer', 'Death'] }),
    ],
    [tractates],
  )
  assert.deepEqual(works[0].themes, ['Prayer', 'Humility', 'Virtue'])
})

test('groups order by number of works, then form name; no-genre last', () => {
  const works = buildWorks(
    [
      text({ slug: 'l1', genre: 'Letter' }),
      text({ slug: 's1', genre: 'Sermon' }),
      text({ slug: 's2', genre: 'Sermon' }),
      text({ slug: 'a1', genre: 'Apology' }),
      text({ slug: 'n1', genre: null }),
      text({ slug: 'n2', genre: null }),
      text({ slug: 'n3', genre: null }),
    ],
    [],
  )
  assert.deepEqual(groupByForm(works).map(g => g.form), ['Sermon', 'Apology', 'Letter', null])
})

test('totals and the corpus line', () => {
  const works = buildWorks(
    [
      text({ slug: 'p1', collection_id: 'c1', word_count: 12000 }),
      text({ slug: 'p2', collection_id: 'c1', word_count: 12000 }),
      text({ slug: 'solo', word_count: 1000 }),
    ],
    [tractates],
  )
  const t = totals(works)
  assert.deepEqual(t, { works: 2, parts: 3, minutes: 125 })
  assert.equal(corpusLine(t), '2 works · 3 parts · about 2 hours of reading')
})

test('the corpus line omits parts when every work is a single text', () => {
  assert.equal(corpusLine({ works: 1, parts: 1, minutes: 125 }), '1 work · about 2 hours of reading')
  assert.equal(corpusLine({ works: 3, parts: 3, minutes: 40 }), '3 works · about 40 minutes of reading')
})

test('formatDuration', () => {
  assert.equal(formatDuration(45), 'about 45 minutes')
  assert.equal(formatDuration(60), 'about 1 hour')
  assert.equal(formatDuration(3600), 'about 60 hours')
})

test('short reads need four works and pick the shortest three under 30 minutes', () => {
  const few = buildWorks([text({ slug: 'a', word_count: 400 }), text({ slug: 'b' }), text({ slug: 'c' })], [])
  assert.deepEqual(shortReads(few), [])

  const works = buildWorks(
    [
      text({ slug: 'long', word_count: 20000 }), // 100 min
      text({ slug: 'twenty-five', word_count: 5000 }), // 25 min
      text({ slug: 'ten-b', title: 'B', word_count: 2000 }),
      text({ slug: 'ten-a', title: 'A', word_count: 1900 }),
      text({ slug: 'five', word_count: 900 }),
      text({ slug: 'thirty', word_count: 6000 }), // exactly 30: not under
      text({ slug: 'unknown', word_count: null }),
      text({ slug: 'part1', collection_id: 'c1', collection_order: 1, word_count: 300 }),
      text({ slug: 'part2', collection_id: 'c1', collection_order: 2, word_count: 100 }),
    ],
    [tractates],
  )
  // part1 (5 min) is the collection's first part; part2 is never offered.
  assert.deepEqual(shortReads(works).map(s => s.slug), ['five', 'part1', 'ten-a'])
})

test('formHeading pluralises every controlled-vocabulary genre', () => {
  for (const g of GENRES) {
    assert.notEqual(formHeading(g, 2), `${g} · 2 works`, `${g} has no plural`)
  }
  assert.equal(formHeading('Homily', 3), 'Homilies · 3 works')
  assert.equal(formHeading('Letter', 1), 'Letters · 1 work')
  assert.equal(formHeading(null, 2), 'Other works · 2 works')
})
