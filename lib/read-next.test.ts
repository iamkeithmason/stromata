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
