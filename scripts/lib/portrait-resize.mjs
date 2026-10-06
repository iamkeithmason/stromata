/**
 * portrait-resize.mjs — shrink an author portrait to what the site displays.
 *
 * Portraits render inside the LancetArch frame (200:380, a column wide at most),
 * yet the `authors` bucket averaged ~730 KB per image with some near 5 MB,
 * served straight from Supabase Storage to every reader. That is cached egress
 * on the free plan's 5 GB allowance (see CHANGELOG 2026-10-06). Bounding the
 * long edge and re-encoding typically lands at a fraction of the original.
 *
 * Shared by the admin upload route (new portraits) and
 * scripts/shrink-author-portraits.mjs (the existing bucket), so both apply one
 * rule.
 */

import sharp from 'sharp'

// Generous for a 2× display of the arch, with headroom for image_zoom framing.
export const MAX_WIDTH = 800
export const MAX_HEIGHT = 1200
const QUALITY = 80

// Formats worth re-encoding. SVG is vector and GIF may be animated: leave both.
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Returns `{ buffer, contentType, ext }` for the shrunk image, or `null` when
 * the input is not a raster format we handle. Opaque images become JPEG;
 * images with an alpha channel become WebP, so transparency survives.
 */
export async function shrinkPortrait(input, contentType) {
  if (!RASTER.has(contentType)) return null
  const image = sharp(Buffer.from(input)).rotate() // honour EXIF orientation
  const { hasAlpha } = await image.metadata()
  const resized = image.resize({
    width: MAX_WIDTH,
    height: MAX_HEIGHT,
    fit: 'inside',
    withoutEnlargement: true,
  })
  if (hasAlpha) {
    return { buffer: await resized.webp({ quality: QUALITY }).toBuffer(), contentType: 'image/webp', ext: 'webp' }
  }
  return {
    buffer: await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer(),
    contentType: 'image/jpeg',
    ext: 'jpg',
  }
}
