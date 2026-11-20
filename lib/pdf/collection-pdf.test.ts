import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blobBaseUrl, collectionPdfPathname, collectionPdfUrl } from './collection-pdf'
import { collectionSlugsIn } from './collection-pdf-schedule'

test('the stored path is fixed by the slug, and safe', () => {
  assert.equal(collectionPdfPathname('the-city-of-god-hippo'), 'collections/the-city-of-god-hippo.pdf')
  assert.equal(collectionPdfPathname('../x y'), 'collections/---x-y.pdf')
})

test('the public URL comes from the store id in the read-write token', () => {
  const env = { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123xyz_secretpart' }
  assert.equal(blobBaseUrl(env), 'https://abc123xyz.public.blob.vercel-storage.com')
  assert.equal(
    collectionPdfUrl('confessions', env),
    'https://abc123xyz.public.blob.vercel-storage.com/collections/confessions.pdf'
  )
})

test('BLOB_PUBLIC_BASE_URL overrides the derivation; no token means no store', () => {
  assert.equal(
    blobBaseUrl({ BLOB_PUBLIC_BASE_URL: 'https://files.example.com/', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' }),
    'https://files.example.com'
  )
  assert.equal(blobBaseUrl({}), null)
  assert.equal(blobBaseUrl({ BLOB_READ_WRITE_TOKEN: 'not-a-token' }), null)
  assert.equal(collectionPdfUrl('confessions', {}), null)
})

test('a rebuild is scheduled for each collection page in a revalidation, once', () => {
  assert.deepEqual(
    collectionSlugsIn(['/', '/texts', '/collections/confessions', '/texts/book-1', '/collections/confessions', '/collections/the-stromata']),
    ['confessions', 'the-stromata']
  )
  // Only the collection page itself: not the index, not a download, not a text.
  assert.deepEqual(collectionSlugsIn(['/collections', '/collections/a/download/pdf', '/texts/collections']), [])
})

test('a text stored path and URL follow the same rule, under texts/', async () => {
  const { textPdfPathname, textPdfUrl } = await import('./text-pdf')
  assert.equal(textPdfPathname('the-didache'), 'texts/the-didache.pdf')
  assert.equal(textPdfPathname('../x y'), 'texts/---x-y.pdf')
  assert.equal(
    textPdfUrl('the-didache', { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123xyz_secretpart' }),
    'https://abc123xyz.public.blob.vercel-storage.com/texts/the-didache.pdf'
  )
  assert.equal(textPdfUrl('the-didache', {}), null)
})

test('CLI revalidation rebuilds the PDFs of the text pages it names, and nothing else', async () => {
  const { textSlugsIn } = await import('./text-pdf-schedule')
  assert.deepEqual(
    textSlugsIn(['/', '/texts', '/texts/book-1', '/collections/confessions', '/texts/book-1', '/texts/book-2']),
    ['book-1', 'book-2']
  )
  assert.deepEqual(textSlugsIn(['/texts/a/download/pdf', '/authors/texts']), [])
})
