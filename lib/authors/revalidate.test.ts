import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorPaths } from './revalidate'

test('always revalidates the two index surfaces', () => {
  assert.deepEqual(authorPaths([], []), ['/', '/authors'])
})

test('includes the author page', () => {
  assert.ok(authorPaths(['john-wycliffe']).includes('/authors/john-wycliffe'))
})

test('includes every text of theirs — AuthorAside draws the portrait there', () => {
  const paths = authorPaths(['john-wycliffe'], ['a-short-rule-of-life', 'on-the-eucharist'])
  assert.ok(paths.includes('/texts/a-short-rule-of-life'))
  assert.ok(paths.includes('/texts/on-the-eucharist'))
})

test('a renamed author clears the old path as well as the new', () => {
  const paths = authorPaths(['wycliffe-new', 'wycliffe-old'])
  assert.ok(paths.includes('/authors/wycliffe-new'))
  assert.ok(paths.includes('/authors/wycliffe-old'))
})

test('an unchanged slug is not revalidated twice', () => {
  const paths = authorPaths(['same', 'same'])
  assert.equal(paths.filter(p => p === '/authors/same').length, 1)
})

test('nullish slugs never become /authors/null', () => {
  const paths = authorPaths([null, undefined, ''], [null, undefined, ''])
  assert.deepEqual(paths, ['/', '/authors'])
})
