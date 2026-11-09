import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLISHER_MARK, markSvg, markUrl, type MarkCut } from './mark'

test('both cuts are one path on the 0 0 100 100 box', () => {
  for (const cut of ['print', 'small'] as MarkCut[]) {
    assert.match(PUBLISHER_MARK[cut].d, /^M/, `${cut} does not start with a moveto`)
    assert.equal(markUrl(cut), `/mark/${cut}.svg`)
  }
})

test('the print master is curves, not chains of straight lines', () => {
  const d = PUBLISHER_MARK.print.d
  const curves = (d.match(/C/g) ?? []).length
  const lines = (d.match(/L/g) ?? []).length
  assert.ok(curves > lines * 4, `print master has ${curves} curves and ${lines} lines`)
})

test('public/mark matches the module exactly (run npm run mark:svg)', () => {
  for (const cut of ['print', 'small'] as MarkCut[]) {
    const file = join(process.cwd(), 'public', 'mark', `${cut}.svg`)
    assert.ok(existsSync(file), `missing ${file}`)
    assert.equal(readFileSync(file, 'utf8'), markSvg(cut), `${file} is stale`)
  }
})
