import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatesFor, validatePick, parseReply, samePick, cleanPick, promptFor, NOTE_MAX } from './begin-with.mjs'

const texts = [
  { slug: 'conf-1', title: 'Confessions, Book I', word_count: 8000, genre: 'Confession', summary: '', collection_id: 'c1' },
  { slug: 'conf-2', title: 'Confessions, Book II', word_count: 6000, genre: 'Confession', summary: '', collection_id: 'c1' },
  { slug: 'letter-54', title: 'Letter 54', word_count: 4000, genre: 'Letter', summary: 'On customs.', collection_id: null },
  { slug: 'hidden-part', title: 'Hidden part', word_count: 100, genre: 'Letter', summary: '', collection_id: 'c2' },
]
const collections = [
  { id: 'c1', slug: 'confessions', title: 'Confessions', description: 'His life, addressed to God.', published: true },
  { id: 'c2', slug: 'hidden', title: 'Hidden', description: '', published: false },
]

test('candidates are works: a published collection is one, its parts are not', () => {
  const c = candidatesFor(texts, collections)
  assert.deepEqual(c.map((x) => `${x.kind}:${x.slug}`), ['collection:confessions', 'text:hidden-part', 'text:letter-54'])
  assert.equal(c[0].parts, 2)
  assert.equal(c[0].words, 14000)
})

test('a pick must name one of the works, by kind, with a short note', () => {
  const c = candidatesFor(texts, collections)
  assert.deepEqual(validatePick({ kind: 'collection', slug: 'confessions', note: 'His own story, told to God.' }, c), [])
  assert.match(validatePick({ kind: 'text', slug: 'conf-1', note: 'x' }, c)[0], /not one of/)
  assert.match(validatePick({ kind: 'text', slug: 'confessions', note: 'x' }, c)[0], /not one of/)
  assert.match(validatePick({ kind: 'collection', slug: 'confessions', note: ' ' }, c)[0], /note is missing/)
  assert.match(validatePick({ kind: 'collection', slug: 'confessions', note: 'x'.repeat(NOTE_MAX + 1) }, c)[0], /at most/)
  assert.deepEqual(validatePick(null, c), ['No pick.'])
})

test('the reply parser finds the JSON inside prose and rejects junk', () => {
  assert.deepEqual(parseReply('Here: {"kind":"text","slug":"a","note":"b"} done'), { kind: 'text', slug: 'a', note: 'b' })
  assert.equal(parseReply('no json'), null)
  assert.equal(parseReply('{broken'), null)
  assert.equal(parseReply(undefined), null)
})

test('samePick ignores whitespace; cleanPick keeps three keys', () => {
  assert.ok(samePick({ kind: 'text', slug: 'a', note: ' Hi  there ' }, { kind: 'text', slug: 'a', note: 'Hi there' }))
  assert.ok(!samePick({ kind: 'text', slug: 'a', note: 'x' }, null))
  assert.ok(samePick(null, null))
  assert.deepEqual(Object.keys(cleanPick({ kind: 'text', slug: 'a', note: 'n', extra: 1 })), ['kind', 'slug', 'note'])
})

test('the prompt lists every work with its slug', () => {
  const p = promptFor({ name: 'Augustine', death_year: 430 }, candidatesFor(texts, collections))
  assert.match(p, /\[collection\] confessions \| Confessions/)
  assert.match(p, /\[text\] letter-54 \| Letter 54 \| Letter \| about 20 min — On customs\./)
})
