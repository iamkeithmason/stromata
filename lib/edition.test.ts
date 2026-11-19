import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostLabel, isBareUrl } from './edition'

test('a bare archive.org URL is recognised and labelled by its host', () => {
  const url = 'https://archive.org/details/selectenglishwork03wycl/page/n25/mode/2up'
  assert.equal(isBareUrl(url), true)
  assert.equal(hostLabel(url), 'archive.org')
})

test('www. is dropped from the label', () => {
  assert.equal(hostLabel('https://www.newadvent.org/fathers/3304.htm'), 'newadvent.org')
})

test('a prose attribution that mentions a URL is not a bare URL', () => {
  assert.equal(isBareUrl('Translated by James Barmby (NPNF Series II, Vol. XII).'), false)
  assert.equal(isBareUrl('Text sourced from https://example.org, 2026'), false)
})

test('an unparseable value falls back to itself', () => {
  assert.equal(hostLabel('not a url'), 'not a url')
})
