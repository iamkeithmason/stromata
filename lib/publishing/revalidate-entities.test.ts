/**
 * The surface list for the admin editors that save an era, tradition, theme,
 * location or collection. Pure: `entitySurfaces` takes no Supabase and no
 * `next/cache`, the same split `textPaths` and `authorPaths` use.
 *
 * The regression these guard: pages moved from hourly to weekly refresh on
 * 2026-10-04, and these five editors had never called `revalidatePath`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { entitySurfaces } from './revalidate-entities'

test('an era, tradition or theme refreshes only its own page', () => {
  assert.deepEqual(entitySurfaces('era', ['nicene-post-nicene']), {
    paths: ['/eras/nicene-post-nicene'],
    patterns: [],
  })
  assert.deepEqual(entitySurfaces('tradition', ['imperial']).paths, ['/traditions/imperial'])
  assert.deepEqual(entitySurfaces('theme', ['prayer']).paths, ['/themes/prayer'])
})

test('a rename refreshes the old path as well as the new one', () => {
  const { paths } = entitySurfaces('location', ['turkey', 'tuerkiye'])
  assert.ok(paths.includes('/locations/turkey'))
  assert.ok(paths.includes('/locations/tuerkiye'))
})

test('a location also refreshes the author and text pages that print its name', () => {
  const { paths, patterns } = entitySurfaces('location', ['turkey'])
  assert.ok(paths.includes('/locations'))
  assert.deepEqual(patterns.sort(), ['/authors/[slug]', '/texts/[slug]'])
})

test('a collection refreshes the home page, the index, itself and its members', () => {
  const { paths, patterns } = entitySurfaces('collection', ['on-the-priesthood-chrysostom'])
  assert.deepEqual(paths, ['/', '/texts', '/collections/on-the-priesthood-chrysostom'])
  assert.deepEqual(patterns, ['/texts/[slug]'])
})

test('drops nullish and duplicate slugs rather than emitting /eras/undefined', () => {
  const { paths } = entitySurfaces('era', [undefined, null, 'modern', 'modern', ''])
  assert.deepEqual(paths, ['/eras/modern'])
})

test('patterns are dynamic-route patterns, never concrete paths', () => {
  // revalidatePath('/texts/[slug]') without the 'page' type is a no-op that
  // only logs a warning, so a pattern must never end up in `paths`.
  for (const entity of ['era', 'tradition', 'theme', 'location', 'collection'] as const) {
    const { paths, patterns } = entitySurfaces(entity, ['x'])
    assert.ok(paths.every(p => !p.includes('[')), `${entity}: a pattern leaked into paths`)
    assert.ok(patterns.every(p => p.includes('[')), `${entity}: a concrete path is in patterns`)
  }
})
