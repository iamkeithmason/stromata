/**
 * Writes public/ornaments/<slug>.svg from lib/genres/ornaments.ts, the source of
 * truth for the genre ornaments. Run after changing a path:
 *
 *   npm run ornaments:svg
 *
 * Removes files for genres that no longer have an ornament. Reads no database
 * and spends no meter.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERBAL_ORNAMENTS, ornamentSlug, ornamentSvg } from '../../lib/genres/ornaments'

const dir = join(process.cwd(), 'public', 'ornaments')
mkdirSync(dir, { recursive: true })

const wanted = new Set<string>()
for (const [genre, o] of Object.entries(HERBAL_ORNAMENTS)) {
  const file = `${ornamentSlug(genre)}.svg`
  wanted.add(file)
  writeFileSync(join(dir, file), ornamentSvg(o))
}
for (const file of readdirSync(dir)) {
  if (file.endsWith('.svg') && !wanted.has(file)) rmSync(join(dir, file))
}
console.log(`Wrote ${wanted.size} ornaments to public/ornaments/`)
