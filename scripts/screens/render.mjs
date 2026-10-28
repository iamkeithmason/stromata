#!/usr/bin/env node
/**
 * Screens reference: render Stromata's key public pages at phone and desktop
 * widths into one dated PDF, so any Claude chat or Claude Code session can see
 * how the site looks before touching the interface (the practice Paideia uses).
 *
 *   npm run screens -- --url=http://localhost:3000      # a local build
 *   npm run screens                                     # production (from a laptop)
 *   npm run screens -- --only=reader --png              # some pages, keep PNGs
 *
 * Flags
 *   --url=<base>     site to render (default https://thestromata.com)
 *   --out=<file>     PDF path (default docs/screens/stromata-screens.pdf)
 *   --only=<text>    render only manifest pages whose name contains <text>
 *   --png            also keep each shot as a JPEG in docs/screens/png/ (gitignored)
 *   --bypass-token=  Vercel automation bypass secret for a protected preview
 *                    (or VERCEL_AUTOMATION_BYPASS_SECRET). Never printed.
 *
 * WHERE TO RUN IT. Vercel's bot checkpoint answers a cloud browser on
 * thestromata.com and on previews with "Failed to verify your browser"; that is
 * platform protection and is not to be bypassed. From a Claude cloud session,
 * render the code itself instead: check out the branch, write a throwaway
 * .env.local with the PUBLIC anon key (Supabase MCP get_publishable_keys) plus
 * dummy ADMIN_* values, run `next dev`, and pass --url=http://localhost:3000.
 * Delete .env.local afterwards. From Keith's laptop, production works directly.
 *
 * METERS. One run renders each manifest page twice (≈30 shots) against the
 * database the site reads: a few MB of Supabase egress, and on production a
 * little Fluid CPU. Run it once per release, not in a loop. Umami, Hotjar and
 * Ko-fi requests are aborted, so a run never lands in the analytics.
 *
 * PAGE OUTPUT. Each shot is its own PDF page, sized to the screenshot plus a
 * caption band, so nothing is shrunk to fit a paper size. Long pages are cut:
 * the top shot stops at about two phone screens or three desktop screens, and
 * the manifest's `shots` capture what matters further down (the reader's
 * end-of-text module, the homepage's recently added).
 */
import { chromium } from 'playwright'
import PDFDocument from 'pdfkit'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const flags = {}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  if (m) flags[m[1]] = m[2] === undefined ? true : m[2]
}
const BASE = String(flags.url || 'https://thestromata.com').replace(/\/$/, '')
const OUT = resolve(ROOT, String(flags.out || 'docs/screens/stromata-screens.pdf'))
const PNG_DIR = join(ROOT, 'docs/screens/png')
const BYPASS = flags['bypass-token'] || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

// Phone at 2× so small type stays legible in the PDF; desktop at 1×.
const VIEWPORTS = [
  { key: 'desktop', label: 'Desktop 1440', width: 1440, height: 900, dpr: 1, mobile: false, topCap: 2700, extra: 1350 },
  { key: 'phone', label: 'Phone 390', width: 390, height: 844, dpr: 2, mobile: true, topCap: 1688, extra: 1266 },
]
const JPEG_QUALITY = 62

const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
const pages = manifest.pages.filter(p => !flags.only || p.name.toLowerCase().includes(String(flags.only).toLowerCase()))
if (pages.length === 0) {
  console.error(`No manifest page matches --only=${flags.only}`)
  process.exit(1)
}

function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: ROOT }).toString().trim() } catch { return 'unknown' }
}

/** One line saying what was rendered: production, a preview, or a local build of a branch. */
function sourceLine() {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    return `a local build of ${git('rev-parse --abbrev-ref HEAD')} at ${git('rev-parse --short HEAD')}, reading the live database`
  }
  return `${BASE} (local checkout at ${git('rev-parse --short HEAD')})`
}

// Furniture that is not part of the design: the Next dev overlay and the
// Hotjar feedback tab (its script is aborted, but hide any leftovers).
const HIDE_CSS = 'nextjs-portal, [id^="_hj"], ._hj_feedback_container { display: none !important; }'

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
  await page.waitForTimeout(400)
}

/** Scroll down to `toY` and back, so lazy images and scroll-revealed content load. */
async function primeScroll(page, toY) {
  await page.evaluate(async (limit) => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.9))
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  }, toY)
  await settle(page)
}

async function capture(browser, entry, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : undefined,
  })
  await context.route(/umami|hotjar|ko-fi/i, r => r.abort())
  if (entry.prefs) {
    await context.addInitScript((prefs) => {
      try { localStorage.setItem('stromata:reader', JSON.stringify(prefs)) } catch { /* storage blocked */ }
    }, entry.prefs)
  }
  const page = await context.newPage()
  const shots = []
  try {
    const res = await page.goto(BASE + entry.route, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const status = res ? res.status() : 0
    await page.addStyleTag({ content: HIDE_CSS })
    await settle(page)

    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    // Where each extra shot starts, in page coordinates.
    const extras = []
    for (const s of entry.shots || []) {
      const loc = page.locator(s.selector).first()
      const box = await loc.boundingBox().catch(() => null)
      if (!box) { extras.push({ ...s, missing: true }); continue }
      const top = Math.max(0, Math.round(box.y + (await page.evaluate(() => window.scrollY)) - 24))
      extras.push({ ...s, top })
    }
    const deepest = Math.max(Math.min(fullHeight, vp.topCap), ...extras.filter(e => !e.missing).map(e => e.top + vp.extra))
    await primeScroll(page, Math.min(deepest, fullHeight))

    const topHeight = Math.min(fullHeight, vp.topCap)
    shots.push({
      label: 'Top of page',
      status,
      cut: fullHeight > topHeight,
      fullHeight,
      buffer: await page.screenshot({ fullPage: true, type: 'jpeg', quality: JPEG_QUALITY, clip: { x: 0, y: 0, width: vp.width, height: topHeight } }),
      width: vp.width,
      height: topHeight,
    })
    for (const e of extras) {
      if (e.missing) { shots.push({ label: e.label, missing: true }); continue }
      const height = Math.min(vp.extra, fullHeight - e.top)
      shots.push({
        label: e.label,
        status,
        fullHeight,
        buffer: await page.screenshot({ fullPage: true, type: 'jpeg', quality: JPEG_QUALITY, clip: { x: 0, y: e.top, width: vp.width, height } }),
        width: vp.width,
        height,
      })
    }
  } finally {
    await context.close()
  }
  return shots
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  console.log(`Screens reference → ${BASE}`)
  console.log(`${pages.length} pages × ${VIEWPORTS.length} widths. Umami, Hotjar and Ko-fi are aborted.\n`)
  const browser = await chromium.launch()
  const results = []
  for (const entry of pages) {
    for (const vp of VIEWPORTS) {
      let shots
      try {
        shots = await capture(browser, entry, vp)
      } catch (err) {
        shots = [{ label: 'Top of page', error: String(err.message).slice(0, 160) }]
      }
      for (const s of shots) {
        results.push({ entry, vp, shot: s })
        const state = s.error ? `FAILED ${s.error}` : s.missing ? 'selector not found' : `${s.width}×${s.height}${s.cut ? ` of ${s.fullHeight}` : ''}`
        console.log(`  ${vp.key.padEnd(7)} ${entry.name} · ${s.label}: ${state}`)
      }
    }
  }
  await browser.close()

  if (flags.png) {
    mkdirSync(PNG_DIR, { recursive: true })
    for (const { entry, vp, shot } of results) {
      if (!shot.buffer) continue
      writeFileSync(join(PNG_DIR, `${slugify(entry.name)}--${slugify(shot.label)}--${vp.key}.jpg`), shot.buffer)
    }
  }

  await writePdf(results)
  const failed = results.filter(r => r.shot.error || r.shot.missing)
  console.log(`\nWrote ${OUT.replace(ROOT + '/', '')} (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${results.length - failed.length} shots)`)
  if (failed.length) {
    console.log(`${failed.length} shot(s) missing — see above.`)
    process.exitCode = 1
  }
}

function writePdf(results) {
  mkdirSync(dirname(OUT), { recursive: true })
  const BAND = 72
  const MARGIN = 24
  const doc = new PDFDocument({ autoFirstPage: false, info: { Title: 'The Stromata — screens reference', Author: 'npm run screens' } })
  const stream = createWriteStream(OUT)
  doc.pipe(stream)

  const done = results.filter(r => r.shot.buffer)
  const date = new Date().toISOString().slice(0, 10)

  // Cover: what this is, when and from where, and a contents list.
  doc.addPage({ size: [1440 + MARGIN * 2, 900 + MARGIN * 2], margin: MARGIN })
  doc.fontSize(36).fillColor('#1E2D3D').text('The Stromata — screens reference', MARGIN + 24, MARGIN + 32)
  doc.moveDown(0.4).fontSize(16).fillColor('#61697A')
    .text(`Rendered ${date} from ${sourceLine()} · ${done.length} shots, phone (390px) and desktop (1440px)`)
  doc.moveDown(0.3).fontSize(13)
    .text('Each page is one screenshot at its real width. Long pages are cut after about two phone or three desktop screens; extra shots show what matters further down. Regenerate with `npm run screens` after each release.')
  doc.moveDown(1).fontSize(14).fillColor('#1E2D3D')
  let n = 2
  const lines = []
  for (const { entry, vp, shot } of done) {
    lines.push(`${String(n).padStart(2, ' ')}  ${entry.name} — ${shot.label} · ${vp.label}  (${entry.route})`)
    n++
  }
  const half = Math.ceil(lines.length / 2)
  const colY = doc.y
  doc.fontSize(11).text(lines.slice(0, half).join('\n'), MARGIN + 24, colY, { width: 700, lineGap: 3 })
  doc.text(lines.slice(half).join('\n'), MARGIN + 24 + 720, colY, { width: 700, lineGap: 3 })

  for (const { entry, vp, shot } of done) {
    doc.addPage({ size: [shot.width + MARGIN * 2, shot.height + BAND + MARGIN * 2], margin: 0 })
    doc.fontSize(vp.key === 'phone' ? 13 : 18).fillColor('#1E2D3D')
      .text(`${entry.name} — ${shot.label}`, MARGIN, MARGIN, { width: shot.width })
    doc.fontSize(vp.key === 'phone' ? 9 : 11).fillColor('#61697A')
      .text(`${vp.label} · ${entry.route}${shot.cut ? ` · cut at ${shot.height}px of ${shot.fullHeight}px` : ''}`, { width: shot.width })
    if (entry.note) doc.text(entry.note, { width: shot.width, height: BAND - 36, ellipsis: true })
    doc.image(shot.buffer, MARGIN, MARGIN + BAND, { width: shot.width, height: shot.height })
  }
  doc.end()
  return new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject) })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
