/**
 *   npx tsx --test lib/featured.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feastKey, isoDay, pickEditorial, type FeaturedCandidate } from './featured'

const t = (id: string, featured_from: string | null, created_at = '2026-01-01T00:00:00Z'): FeaturedCandidate => ({
  id, featured_from, created_at,
})
const today = new Date('2026-11-09T11:00:00Z')

test('feastKey is zero-padded MM-DD in UTC, as authors.feast_day is stored', () => {
  assert.equal(feastKey(new Date('2026-01-07T23:59:00Z')), '01-07')
  assert.equal(feastKey(new Date('2026-11-09T00:00:00Z')), '11-09')
  assert.equal(isoDay(today), '2026-11-09')
})

test('nothing featured and no feast: no pick', () => {
  assert.equal(pickEditorial({ feastTexts: [], featured: [], today }), null)
})

test('the most recently featured text wins', () => {
  const pick = pickEditorial({
    feastTexts: [],
    featured: [t('a', '2026-09-22'), t('b', '2026-11-01'), t('c', '2026-10-01')],
    today,
  })
  assert.deepEqual(pick && [pick.kind, pick.text.id], ['editorial', 'b'])
})

test('a pick whose featured_from is in the future has not begun', () => {
  const pick = pickEditorial({
    feastTexts: [],
    featured: [t('a', '2026-09-22'), t('future', '2026-12-25')],
    today,
  })
  assert.equal(pick?.text.id, 'a')
})

test('a pick starting today has begun', () => {
  assert.equal(pickEditorial({ feastTexts: [], featured: [t('a', '2026-11-09')], today })?.text.id, 'a')
})

test('an undated pick shows, but a dated one outranks it', () => {
  assert.equal(pickEditorial({ feastTexts: [], featured: [t('undated', null)], today })?.text.id, 'undated')
  assert.equal(
    pickEditorial({ feastTexts: [], featured: [t('undated', null), t('dated', '2026-01-01')], today })?.text.id,
    'dated',
  )
})

test('a feast day takes priority over an editorial pick', () => {
  const pick = pickEditorial({
    feastTexts: [t('saint', null)],
    featured: [t('a', '2026-11-01')],
    today,
  })
  assert.deepEqual(pick && [pick.kind, pick.text.id], ['feast', 'saint'])
})

test('several feast-day texts: newest first, then id, never flickering', () => {
  const feastTexts = [t('b', null, '2026-02-01T00:00:00Z'), t('a', null, '2026-02-01T00:00:00Z'), t('old', null, '2025-01-01T00:00:00Z')]
  assert.equal(pickEditorial({ feastTexts, featured: [], today })?.text.id, 'a')
  assert.equal(pickEditorial({ feastTexts: [...feastTexts].reverse(), featured: [], today })?.text.id, 'a')
})
