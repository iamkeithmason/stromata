import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_THEMES, themeCapError, toggleThemeCapped } from './theme-cap'

const six = ['prayer', 'vocation', 'work', 'justice', 'virtue', 'humility']

test('six themes save; seven are refused with the count', () => {
  assert.equal(MAX_THEMES, 6)
  assert.equal(themeCapError(six), null)
  assert.match(themeCapError([...six, 'obedience']) ?? '', /at most 6 themes; this one has 7/)
})

test('duplicates count once, and a missing list is not an error', () => {
  assert.equal(themeCapError([...six, 'prayer']), null)
  assert.equal(themeCapError(undefined), null)
})

test('toggling adds below the cap, refuses at it, and always removes', () => {
  assert.deepEqual(toggleThemeCapped(['prayer'], 'work'), ['prayer', 'work'])
  assert.deepEqual(toggleThemeCapped(six, 'obedience'), six)
  assert.deepEqual(toggleThemeCapped(six, 'work'), ['prayer', 'vocation', 'justice', 'virtue', 'humility'])
})
