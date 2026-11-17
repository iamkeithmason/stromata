/**
 * Writes public/mark/<cut>.svg and the site icon (app/icon.svg) from
 * lib/brand/mark.ts, the source of truth for the publisher's mark. Run after
 * changing a path:
 *
 *   npm run mark:svg
 *
 * Then `npm run mark:icons` renders the PNG and .ico sizes from the same SVG.
 * Reads no database and spends no meter.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLISHER_MARK, markIconSvg, markSvg, type MarkCut } from '../../lib/brand/mark'

const dir = join(process.cwd(), 'public', 'mark')
mkdirSync(dir, { recursive: true })
for (const cut of Object.keys(PUBLISHER_MARK) as MarkCut[]) {
  writeFileSync(join(dir, `${cut}.svg`), markSvg(cut))
}
writeFileSync(join(process.cwd(), 'app', 'icon.svg'), markIconSvg())
console.log('Wrote the publisher mark to public/mark/ and the site icon to app/icon.svg')
