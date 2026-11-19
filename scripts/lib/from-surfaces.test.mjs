import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FROM_SURFACES, isFromSurface } from './from-surfaces.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('FROM_SURFACES matches the `from` row of the CLAUDE.md property vocabulary', () => {
  const md = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
  const row = md.split('\n').find(l => l.startsWith('| `from` |'))
  assert.ok(row, 'CLAUDE.md has a `from` row in the property vocabulary table')
  // The row's third cell lists the values; the second is prose with no backticks.
  const valueCell = row.split('|')[3]
  const documented = [...valueCell.matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1])
  assert.deepEqual([...documented].sort(), [...FROM_SURFACES].sort())
})

test('isFromSurface accepts recorded surfaces and rejects anything else', () => {
  assert.equal(isFromSurface('read-next'), true)
  assert.equal(isFromSurface('Read next'), false)
  assert.equal(isFromSurface('readnext'), false)
  assert.equal(isFromSurface(undefined), false)
})
