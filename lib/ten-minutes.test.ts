import { test } from 'node:test'
import assert from 'node:assert/strict'
import { variedRow,
  fitsTenMinutes,
  rankTenMinuteTexts,
  selectForTheme,
  themeChoices,
  type TenMinuteText,
} from './ten-minutes'

function text(over: Partial<TenMinuteText> & { slug: string }): TenMinuteText {
  return {
    id: over.slug,
    title: over.slug,
    word_count: 1500,
    summary: null,
    editorial_introduction: null,
    text_themes: [],
    ...over,
  }
}
const theme = (slug: string) => ({ theme: { name: slug.toUpperCase(), slug } })

test('fits means an estimate of ten minutes or less, above the floor', () => {
  assert.equal(fitsTenMinutes(2000), true) // 10 min exactly
  assert.equal(fitsTenMinutes(2001), false) // rounds up to 15
  assert.equal(fitsTenMinutes(400), true)
  assert.equal(fitsTenMinutes(399), false)
  assert.equal(fitsTenMinutes(null), false)
  assert.equal(fitsTenMinutes(0), false)
})

test('introduced texts lead, then the longer text, then title', () => {
  const ranked = rankTenMinuteTexts([
    text({ slug: 'plain-long', word_count: 1900 }),
    text({ slug: 'intro-short', word_count: 800, editorial_introduction: 'Keith wrote this.' }),
    text({ slug: 'plain-short', word_count: 700 }),
    text({ slug: 'a-plain-long', word_count: 1900 }),
    text({ slug: 'too-long', word_count: 5000 }),
    text({ slug: 'blank-intro', word_count: 1000, editorial_introduction: '   ' }),
  ])
  assert.deepEqual(ranked.map(t => t.slug), [
    'intro-short',
    'a-plain-long',
    'plain-long',
    'blank-intro',
    'plain-short',
  ])
})

test('theme choices need two texts and are ordered by population', () => {
  const ranked = [
    text({ slug: 'a', text_themes: [theme('prayer'), theme('humility')] }),
    text({ slug: 'b', text_themes: [theme('prayer'), theme('humility')] }),
    text({ slug: 'c', text_themes: [theme('prayer'), theme('death')] }),
  ]
  assert.deepEqual(themeChoices(ranked).map(c => [c.slug, c.count]), [
    ['prayer', 3],
    ['humility', 2],
  ])
})

test('selectForTheme filters, and ignores a slug that is not on offer', () => {
  const ranked = [
    text({ slug: 'a', text_themes: [theme('prayer')] }),
    text({ slug: 'b', text_themes: [theme('prayer')] }),
    text({ slug: 'c', text_themes: [theme('death')] }),
  ]
  const choices = themeChoices(ranked)
  assert.deepEqual(selectForTheme(ranked, 'prayer', choices).map(t => t.slug), ['a', 'b'])
  assert.equal(selectForTheme(ranked, 'death', choices).length, 3) // one text: not a choice
  assert.equal(selectForTheme(ranked, 'nonsense', choices).length, 3)
  assert.equal(selectForTheme(ranked, null, choices).length, 3)
})

test('variedRow takes one text per author, in rank order', () => {
  const ranked = [
    { id: 'a1', a: 'augustine' }, { id: 'a2', a: 'augustine' }, { id: 'b1', a: 'basil' },
    { id: 'a3', a: 'augustine' }, { id: 'c1', a: 'cyprian' }, { id: 'd1', a: 'donne' },
  ]
  assert.deepEqual(variedRow(ranked, 4, t => t.a).map(t => t.id), ['a1', 'b1', 'c1', 'd1'])
})

test('variedRow repeats an author only when there are too few authors', () => {
  const ranked = [{ id: 'a1', a: 'x' }, { id: 'a2', a: 'x' }, { id: 'b1', a: 'y' }]
  assert.deepEqual(variedRow(ranked, 3, t => t.a).map(t => t.id), ['a1', 'b1', 'a2'])
})
