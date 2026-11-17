/**
 * Renders the site icon's raster sizes from the SVG that npm run mark:svg
 * writes (lib/brand/mark.ts is the source of truth):
 *
 *   app/favicon.ico     16, 32 and 48px, for browsers and search results
 *   app/apple-icon.png  180px, full-bleed (iOS rounds it itself)
 *
 *   npm run mark:icons [-- --large=<dir>]
 *
 * --large also writes 1024px PNGs (rounded and full-bleed) to <dir>, for use
 * as a workspace or profile icon. Needs Playwright's Chromium. Reads no
 * database and spends no meter.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { markIconSvg } from '../../lib/brand/mark.ts'

const root = process.cwd()
const large = process.argv.find((a) => a.startsWith('--large='))?.slice('--large='.length)

const browser = await chromium.launch()
const page = await browser.newPage()

async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      svg.replace('<svg ', `<svg width="${size}" height="${size}" `) +
      `</body></html>`,
  )
  return page.locator('svg').screenshot({ omitBackground: true })
}

/** An .ico holding PNG entries, which every current browser reads. */
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, at)
    header.writeUInt8(size >= 256 ? 0 : size, at + 1)
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(data.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...entries.map((e) => e.data)])
}

const rounded = markIconSvg()
const bleed = markIconSvg({ rounded: false })

const sizes = [16, 32, 48]
const entries = []
for (const size of sizes) entries.push({ size, data: await png(rounded, size) })
writeFileSync(join(root, 'app', 'favicon.ico'), ico(entries))
writeFileSync(join(root, 'app', 'apple-icon.png'), await png(bleed, 180))
console.log('Wrote app/favicon.ico (16, 32, 48) and app/apple-icon.png (180)')

if (large) {
  mkdirSync(large, { recursive: true })
  writeFileSync(join(large, 'stromata-icon-1024.png'), await png(rounded, 1024))
  writeFileSync(join(large, 'stromata-icon-1024-square.png'), await png(bleed, 1024))
  console.log(`Wrote 1024px icons to ${large}`)
}

await browser.close()
