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
import { entitySurfaces, slugPaths } from './revalidate-entities'

test('an era, tradition or theme refreshes only its own page', () => {
  assert.deepEqual(entitySurfaces('era', ['nicene-post-nicene']), {
    paths: ['/eras/nicene-post-nicene'],
  })
  assert.deepEqual(entitySurfaces('tradition', ['imperial']).paths, ['/traditions/imperial'])
  assert.deepEqual(entitySurfaces('theme', ['prayer']).paths, ['/themes/prayer'])
})

test('a rename refreshes the old path as well as the new one', () => {
  const { paths } = entitySurfaces('location', ['turkey', 'tuerkiye'])
  assert.ok(paths.includes('/locations/turkey'))
  assert.ok(paths.includes('/locations/tuerkiye'))
})

test('a location refreshes its own pages; the author and text pages come from the caller', () => {
  // Those used to be the whole /authors/[slug] and /texts/[slug] routes, which
  // re-rendered the library on crawlers' next pass. locationPaths lists them.
  assert.deepEqual(entitySurfaces('location', ['turkey']).paths, ['/locations', '/locations/turkey'])
})

test('a collection refreshes the home page, the index and itself, never every text page', () => {
  const { paths } = entitySurfaces('collection', ['on-the-priesthood-chrysostom'])
  assert.deepEqual(paths, ['/', '/texts', '/collections/on-the-priesthood-chrysostom'])
})

test('drops nullish and duplicate slugs rather than emitting /eras/undefined', () => {
  const { paths } = entitySurfaces('era', [undefined, null, 'modern', 'modern', ''])
  assert.deepEqual(paths, ['/eras/modern'])
})

test('no surface is a dynamic-route pattern', () => {
  for (const entity of ['era', 'tradition', 'theme', 'location', 'collection'] as const) {
    const { paths } = entitySurfaces(entity, ['x'])
    assert.ok(paths.every(p => !p.includes('[')), `${entity}: a route pattern leaked into paths`)
  }
})

test('slugPaths turns slug rows into concrete paths, dropping blanks and repeats', () => {
  assert.deepEqual(
    slugPaths('/texts', [{ slug: 'a' }, { slug: null }, { slug: '' }, { slug: 'a' }, { slug: 'b' }]),
    ['/texts/a', '/texts/b']
  )
  assert.deepEqual(slugPaths('/authors', []), [])
})
