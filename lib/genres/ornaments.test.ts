import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { HERBAL_ORNAMENTS, ornamentFor, ornamentSlug, ornamentSvg, ornamentUrl } from './ornaments'

const dir = join(process.cwd(), 'public', 'ornaments')

// The genres in CLAUDE.md's controlled vocabulary that have an ornament. Chronicle
// (migration 042) has none yet and falls back to the hairline rule; add it here
// with its ornament.
const GENRES = [
  'Homily', 'Sermon', 'Letter', 'Treatise', 'Essay', 'Meditation', 'Rule', 'Prayer', 'Catechesis',
  'Commentary', 'Dialogue', 'Hymn', 'Poem', 'Confession', 'Hagiography', 'Apology', 'Exegesis',
]

test('every controlled-vocabulary genre has an ornament with a recorded source', () => {
  for (const g of GENRES) {
    const o = HERBAL_ORNAMENTS[g]
    assert.ok(o, `${g} has no ornament`)
    assert.ok(o.source.trim().length > 0, `${g} has no source`)
    assert.match(o.d, /^M/, `${g} path does not start with a moveto`)
  }
})

test('public/ornaments matches the module exactly (run npm run ornaments:svg)', () => {
  for (const [genre, o] of Object.entries(HERBAL_ORNAMENTS)) {
    const file = join(dir, `${ornamentSlug(genre)}.svg`)
    assert.ok(existsSync(file), `missing ${file}`)
    assert.equal(readFileSync(file, 'utf8'), ornamentSvg(o), `${file} is stale`)
  }
  const expected = new Set(Object.keys(HERBAL_ORNAMENTS).map(g => `${ornamentSlug(g)}.svg`))
  for (const f of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    assert.ok(expected.has(f), `public/ornaments/${f} has no ornament in the module`)
  }
})

test('lookups', () => {
  assert.equal(ornamentSlug('Sermon'), 'sermon')
  assert.equal(ornamentUrl('Sermon'), '/ornaments/sermon.svg')
  assert.equal(ornamentUrl('Chronicle'), null)
  assert.equal(ornamentUrl(null), null)
  assert.equal(ornamentFor(undefined), null)
})
