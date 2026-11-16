/**
 * Writes public/mark/<cut>.svg from lib/brand/mark.ts, the source of truth for
 * the publisher's mark. Run after changing a path:
 *
 *   npm run mark:svg
 *
 * Reads no database and spends no meter.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLISHER_MARK, markSvg, type MarkCut } from '../../lib/brand/mark'

const dir = join(process.cwd(), 'public', 'mark')
mkdirSync(dir, { recursive: true })
for (const cut of Object.keys(PUBLISHER_MARK) as MarkCut[]) {
  writeFileSync(join(dir, `${cut}.svg`), markSvg(cut))
}
console.log('Wrote the publisher mark to public/mark/')
