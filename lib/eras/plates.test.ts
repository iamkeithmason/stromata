import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ERA_PLATES, archPlateCrop, eraArchPlate } from './plates'

test('every era with a default plate has a committed arch derivative', () => {
  for (const slug of Object.keys(DEFAULT_ERA_PLATES)) {
    const src = eraArchPlate(slug)
    assert.ok(src, slug)
    assert.ok(existsSync(join(process.cwd(), 'public', src!)), `${src} is missing`)
  }
})

test('no era, or an unknown one, keeps the vellum arch', () => {
  assert.equal(eraArchPlate(null), null)
  assert.equal(eraArchPlate(undefined), null)
  assert.equal(eraArchPlate('not-an-era'), null)
})

test('the crop is stable for one author and stays in range', () => {
  const a = archPlateCrop('augustine-of-hippo', 'nicene-post-nicene')
  assert.deepEqual(a, archPlateCrop('augustine-of-hippo', 'nicene-post-nicene'))
  for (const seed of ['a', 'bede', 'john-chrysostom', 'gregory-the-great', 'x'.repeat(40)]) {
    const c = archPlateCrop(seed, 'high-medieval')
    assert.ok(c.x >= 8 && c.x <= 92, `x ${c.x}`)
    assert.ok(c.y >= 0 && c.y <= 100, `y ${c.y}`)
    assert.ok(c.zoom >= 1 && c.zoom <= 1.35, `zoom ${c.zoom}`)
  }
})

test('authors of one era do not all share a window', () => {
  const seeds = ['ambrose', 'basil-the-great', 'gregory-of-nyssa', 'jerome', 'john-cassian', 'leo-the-great']
  const xs = new Set(seeds.map(s => Math.round(archPlateCrop(s, 'nicene-post-nicene').x / 10)))
  assert.ok(xs.size >= 4, `only ${xs.size} distinct windows`)
})
