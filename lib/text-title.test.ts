import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPlaceholderAuthor, textPageFallbackDescription, textPageTitle } from './text-title'

test('named authors keep the author-first title', () => {
  assert.equal(textPageTitle('Confessions', 'Augustine of Hippo'), 'Augustine of Hippo — Confessions | The Stromata')
})

test('placeholder and missing authors drop out of the title', () => {
  assert.equal(textPageTitle('The Didache', 'Unknown (Early Church)'), 'The Didache | The Stromata')
  assert.equal(textPageTitle('The Martyrdom of Polycarp', 'Anonymous (Church of Smyrna)'), 'The Martyrdom of Polycarp | The Stromata')
  assert.equal(textPageTitle('Theologia Germanica', 'Anonymous (attributed to a priest of the Teutonic Order, Frankfurt)'), 'Theologia Germanica | The Stromata')
  assert.equal(textPageTitle('A Text', null), 'A Text | The Stromata')
})

test('only a leading Unknown/Anonymous counts, not a name containing the word', () => {
  assert.equal(isPlaceholderAuthor('Unknown (North African, 2nd century)'), true)
  assert.equal(isPlaceholderAuthor('Anonymousness Smith'), false)
  assert.equal(isPlaceholderAuthor('Pseudo-Dionysius'), false)
})

test('the fallback description follows the same rule', () => {
  assert.equal(textPageFallbackDescription('The Didache', 'Unknown (Early Church)'), 'The Didache, freely readable at The Stromata.')
  assert.equal(textPageFallbackDescription('Confessions', 'Augustine of Hippo'), "Augustine of Hippo's Confessions, freely readable at The Stromata.")
})
