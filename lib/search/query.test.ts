import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentWords, labelMatches, needsWordPass, mergeResults, allFailed, snippetFocus } from './query'
import { findBodyMatches } from './body-matches'

test('contentWords drops stop words, punctuation and duplicates', () => {
  assert.deepEqual(contentWords('On the Providence of God'), ['providence', 'god'])
  assert.deepEqual(contentWords('De Providentia Dei)'), ['de', 'providentia', 'dei'])
  assert.deepEqual(contentWords('george   herbert, George'), ['george', 'herbert'])
  assert.deepEqual(contentWords('the of a'), [])
})

test('labelMatches keeps the whole-phrase match and adds any-word matching for short labels', () => {
  assert.equal(labelMatches('Providence', 'on the providence of god'), true, 'the reported failure of 9 Nov 2026')
  assert.equal(labelMatches('Prayer', 'prayer'), true, 'single words behave as before')
  assert.equal(labelMatches('Spiritual Warfare', 'spiritual warfare'), true)
  assert.equal(labelMatches('Prayer', 'pray'), true, 'a substring still matches, as ilike did')
  assert.equal(labelMatches('Patristic', 'on the providence of god'), false)
  assert.equal(labelMatches('Christology', 'of'), false, 'a stop word alone matches nothing')
  assert.equal(labelMatches('Ecumenical', 'de providentia'), false, 'two-letter words do not match labels')
})

test('needsWordPass only for two or more content words', () => {
  assert.equal(needsWordPass('aquinas'), false)
  assert.equal(needsWordPass('the aquinas'), false)
  assert.equal(needsWordPass('herbert george'), true)
})

const t = (id: string, title: string) => ({ id, title })

test('mergeResults puts metadata matches first by title, then body matches in the order given', () => {
  const { texts, bodyMatchIds } = mergeResults(
    [[t('b', 'Beta'), t('a', 'Alpha')], [t('a', 'Alpha')]],
    [t('z', 'Zeta, best body match'), t('a', 'Alpha'), t('m', 'Mu')]
  )
  assert.deepEqual(texts.map((x) => x.id), ['a', 'b', 'z', 'm'])
  assert.deepEqual([...bodyMatchIds], ['z', 'm'], 'a text matched by title is not marked as a body match')
})

test('mergeResults caps the list and forgets body matches that fell off it', () => {
  const meta = Array.from({ length: 19 }, (_, i) => t(`m${i}`, `T${String(i).padStart(2, '0')}`))
  const { texts, bodyMatchIds } = mergeResults([meta], [t('b1', 'First body'), t('b2', 'Second body')])
  assert.equal(texts.length, 20)
  assert.equal(texts[19].id, 'b1', 'the best-ranked body match keeps the last place')
  assert.deepEqual([...bodyMatchIds], ['b1'])
})

test('allFailed is true only when every query failed', () => {
  assert.equal(allFailed([{ error: new Error('x') }, { error: 'y' }]), true)
  assert.equal(allFailed([{ error: new Error('x') }, { error: null }]), false)
  assert.equal(allFailed([]), false)
})

test('snippetFocus centres on the phrase, else the first word the text contains', () => {
  assert.equal(snippetFocus('He wrote of usury at length', 'usury'), 'usury')
  assert.equal(snippetFocus('the providence of the Lord', 'on the providence of god'), 'providence')
  assert.equal(snippetFocus('nothing here', 'alms'), 'alms')
})

// ── Body matches: ranked first, the old substring search as the fallback ──

const ok = <T,>(data: T) => Promise.resolve({ data, error: null })
const fail = (message: string) => Promise.resolve({ data: null, error: { message } })
const hit = (id: string, rank: number) => ({ id, rank, excerpt: `…${id}…`, has_before: true, has_after: false })

test('ranked results come back in relevance order, with their excerpts', async () => {
  const r = await findBodyMatches({
    ranked: () => ok([hit('b', 3), hit('a', 1)]),
    fetchByIds: () => ok([t('a', 'Alpha'), t('b', 'Beta')]),
    substring: () => { throw new Error('the fallback must not run') },
  })
  assert.equal(r.source, 'ranked')
  assert.deepEqual(r.rows.map((x) => x.id), ['b', 'a'])
  assert.equal(r.excerpts?.get('b')?.excerpt, '…b…')
  assert.equal(r.error, null)
})

test('when the search function is missing or errors, the old substring search runs', async () => {
  const r = await findBodyMatches({
    ranked: () => fail('function search_texts_body does not exist'),
    fetchByIds: () => { throw new Error('must not fetch by ids') },
    substring: () => ok([t('a', 'Alpha')]),
  })
  assert.equal(r.source, 'substring')
  assert.deepEqual(r.rows.map((x) => x.id), ['a'])
  assert.equal(r.excerpts, null, 'the page then fetches excerpts the old way')
  assert.equal(r.error, null)
})

test('when fetching the ranked rows fails, the substring search runs instead', async () => {
  const r = await findBodyMatches({
    ranked: () => ok([hit('a', 1)]),
    fetchByIds: () => fail('timeout'),
    substring: () => ok([t('a', 'Alpha')]),
  })
  assert.equal(r.source, 'substring')
})

test('a ranked search with no hits is a real empty answer, not a failure', async () => {
  const r = await findBodyMatches({
    ranked: () => ok([]),
    fetchByIds: () => { throw new Error('nothing to fetch') },
    substring: () => { throw new Error('the fallback must not run') },
  })
  assert.deepEqual(r.rows, [])
  assert.equal(r.error, null)
})

test('when both body searches fail, the error is reported, never an empty success', async () => {
  const r = await findBodyMatches({
    ranked: () => fail('down'),
    fetchByIds: () => fail('down'),
    substring: () => fail('down'),
  })
  assert.deepEqual(r.rows, [])
  assert.notEqual(r.error, null)
})
