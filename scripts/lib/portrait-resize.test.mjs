import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { shrinkPortrait, MAX_WIDTH, MAX_HEIGHT } from './portrait-resize.mjs'

// Noise compresses badly, like a photographic scan, so sizes are realistic.
async function noise(width, height, channels, format) {
  const raw = Buffer.alloc(width * height * channels)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24
  const img = sharp(raw, { raw: { width, height, channels } })
  return format === 'png' ? img.png().toBuffer() : img.jpeg({ quality: 95 }).toBuffer()
}

test('a large opaque scan is bounded and re-encoded as a smaller JPEG', async () => {
  const input = await noise(2400, 3600, 3, 'jpeg')
  const out = await shrinkPortrait(input, 'image/jpeg')
  const meta = await sharp(out.buffer).metadata()
  assert.equal(out.contentType, 'image/jpeg')
  assert.equal(out.ext, 'jpg')
  assert.ok(meta.width <= MAX_WIDTH && meta.height <= MAX_HEIGHT, `${meta.width}×${meta.height}`)
  assert.ok(out.buffer.length < input.length / 4, `${input.length} → ${out.buffer.length}`)
})

test('an opaque PNG becomes JPEG', async () => {
  const out = await shrinkPortrait(await noise(1600, 2000, 3, 'png'), 'image/png')
  assert.equal(out.contentType, 'image/jpeg')
})

test('transparency survives as WebP', async () => {
  const out = await shrinkPortrait(await noise(1600, 2000, 4, 'png'), 'image/png')
  assert.equal(out.contentType, 'image/webp')
  assert.equal((await sharp(out.buffer).metadata()).hasAlpha, true)
})

test('a small image is never enlarged', async () => {
  const out = await shrinkPortrait(await noise(300, 500, 3, 'jpeg'), 'image/jpeg')
  const meta = await sharp(out.buffer).metadata()
  assert.equal(meta.width, 300)
  assert.equal(meta.height, 500)
})

test('SVG and GIF are left alone', async () => {
  assert.equal(await shrinkPortrait(Buffer.from('<svg/>'), 'image/svg+xml'), null)
  assert.equal(await shrinkPortrait(Buffer.from('GIF89a'), 'image/gif'), null)
})
