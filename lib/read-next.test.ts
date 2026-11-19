/**
 *   npx tsx --test lib/read-next.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickReadNext, type ReadNextCandidate, type ReadNextInput } from './read-next'

const c = (id: string, over: Partial<ReadNextCandidate> = {}): ReadNextCandidate => ({
  id, title: `Text ${id}`, slug: `text-${id}`, word_count: 3000,
  collection_id: null, authorId: 'a2', authorName: 'Other', ...over,
})

const base: ReadNextInput = {
  self: { id: 'self', collectionId: null, authorId: 'a1', wordCount: 3000 },
  authorName: 'Augustine',
  genreName: 'Sermon',
  themes: [{ name: 'Prayer', slug: 'prayer' }, { name: 'Humility', slug: 'humility' }],
  sameAuthor: [], sameTheme: [], sameGenre: [],
}

test('returns nothing when there are no candidates', () => {
  assert.deepEqual(pickReadNext(base), [])
})

test('picks one per rule, with the rule as the reason', () => {
  const picks = pickReadNext({
    ...base,
    sameAuthor: [c('1', { authorId: 'a1', authorName: 'Augustine' })],
    sameTheme: [c('2', { themeSlugs: ['humility'] })],
    sameGenre: [c('3')],
  })
  assert.deepEqual(picks.map(p => [p.kind, p.reason, p.slug]), [
    ['author', 'More from Augustine', 'text-1'],
    ['theme', 'On Humility', 'text-2'],
    ['genre', 'Another sermon', 'text-3'],
  ])
})

test('never repeats a text across slots or returns the text itself', () => {
  const shared = c('1', { authorId: 'a1', themeSlugs: ['prayer'] })
  const picks = pickReadNext({
    ...base,
    sameAuthor: [shared, c('self', { authorId: 'a1' })],
    sameTheme: [shared, c('2', { themeSlugs: ['prayer'] })],
    sameGenre: [shared, c('2')],
  })
  const slugs = picks.map(p => p.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  assert.ok(!slugs.includes('text-self'))
  assert.deepEqual(slugs, ['text-1', 'text-2'])
})

test('skips siblings in the same collection and fragments', () => {
  const picks = pickReadNext({
    ...base,
    self: { ...base.self, collectionId: 'col' },
    sameAuthor: [c('1', { collection_id: 'col', authorId: 'a1' }), c('2', { word_count: 120, authorId: 'a1' })],
  })
  assert.deepEqual(picks, [])
})

test('theme slot prefers more shared themes and never the same author', () => {
  const picks = pickReadNext({
    ...base,
    sameTheme: [
      c('1', { themeSlugs: ['prayer'] }),
      c('2', { themeSlugs: ['prayer', 'humility'] }),
      c('3', { themeSlugs: ['prayer', 'humility'], authorId: 'a1' }),
    ],
  })
  assert.equal(picks[0].slug, 'text-2')
  assert.equal(picks[0].reason, 'On Prayer')
})

test('genre slot never offers the same author', () => {
  const picks = pickReadNext({ ...base, sameGenre: [c('1', { authorId: 'a1' })] })
  assert.deepEqual(picks, [])
})

test('is deterministic: closest length, then title', () => {
  const sameAuthor = [
    c('1', { authorId: 'a1', word_count: 9000 }),
    c('2', { authorId: 'a1', word_count: 3100 }),
    c('3', { authorId: 'a1', word_count: 2900, title: 'A' }),
  ]
  const a = pickReadNext({ ...base, sameAuthor })
  const b = pickReadNext({ ...base, sameAuthor: [...sameAuthor].reverse() })
  assert.deepEqual(a, b)
  assert.equal(a[0].slug, 'text-3')
})

test('a text with unknown length is admitted, ranked after known lengths', () => {
  const picks = pickReadNext({
    ...base,
    sameAuthor: [c('1', { authorId: 'a1', word_count: null }), c('2', { authorId: 'a1', word_count: 8000 })],
  })
  assert.equal(picks[0].slug, 'text-2')
  const only = pickReadNext({ ...base, sameAuthor: [c('1', { authorId: 'a1', word_count: null })] })
  assert.equal(only[0].slug, 'text-1')
})

test('the editorial pick leads with its sentence, and the rules fill the rest up to three', () => {
  const picks = pickReadNext({
    ...base,
    editorial: { candidate: c('ed', { title: 'The Didache' }), note: 'The same worship, described from the inside.' },
    sameAuthor: [c('1', { authorId: 'a1', authorName: 'Augustine' })],
    sameTheme: [c('2', { themeSlugs: ['humility'] })],
    sameGenre: [c('3')],
  })
  assert.deepEqual(picks.map(p => [p.kind, p.reason, p.slug]), [
    ['editorial', 'The same worship, described from the inside.', 'text-ed'],
    ['author', 'More from Augustine', 'text-1'],
    ['theme', 'On Humility', 'text-2'],
  ])
})

test('an editorial pick without a sentence gets a plain caption, and is never repeated by a rule', () => {
  const ed = c('ed', { authorId: 'a1' })
  const picks = pickReadNext({ ...base, editorial: { candidate: ed, note: '  ' }, sameAuthor: [ed] })
  assert.deepEqual(picks.map(p => [p.kind, p.reason]), [['editorial', 'The editor’s choice']])
})

test('an editorial pick may be short or a sibling part, but never the text itself', () => {
  const sibling = c('sib', { collection_id: 'col', word_count: 120 })
  const withSibling = pickReadNext({
    ...base,
    self: { ...base.self, collectionId: 'col' },
    editorial: { candidate: sibling, note: null },
  })
  assert.equal(withSibling[0]?.slug, 'text-sib')
  const toSelf = pickReadNext({ ...base, editorial: { candidate: c('self'), note: 'x' } })
  assert.deepEqual(toSelf, [])
})

test('picks carry the cover fields through', () => {
  const [p] = pickReadNext({
    ...base,
    sameGenre: [c('3', { accessionNumber: 41, deathYear: 430, traditionSlug: 'patristic', word_count: 2500 })],
  })
  assert.deepEqual(
    [p.accessionNumber, p.deathYear, p.traditionSlug, p.wordCount],
    [41, 430, 'patristic', 2500],
  )
})
