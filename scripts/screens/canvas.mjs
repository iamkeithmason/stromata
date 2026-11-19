#!/usr/bin/env node
/**
 * Site canvas: the key pages on one zoomable board, linked by real reader clicks.
 *
 *   npm run screens -- --url=http://localhost:3000 --png     # 1. the screenshots
 *   npm run screens:canvas                                   # 2. the canvas
 *
 * The screens PDF shows the site one page at a time. The canvas shows its shape:
 * which page types lead to which, and how many readers actually took each route.
 * Pages join the canvas by carrying `canvas` and `links` in
 * scripts/screens/manifest.json (see scripts/lib/site-canvas.mjs for the shape);
 * each link names the Umami `from` values whose clicks travel along it.
 *
 * Flags
 *   --range=30d       click window: 24h | 7d | 30d | 90d (default 30d)
 *   --no-clicks       draw routes only, without asking Umami
 *   --out=<file>      default docs/screens/canvas/stromata-canvas.html (gitignored)
 *   --fragment        leave out the <html>/<head> skeleton, for publishing as a
 *                     claude.ai artifact (the Artifact tool adds its own)
 *
 * METERS. Umami only: one events-list call plus one event-data call per (event,
 * property) pair the links read (six today). It reads no Supabase and renders
 * nothing; the images come from the last `npm run screens --png`, so a canvas costs nothing beyond
 * the release-day render it reuses. Needs UMAMI_SHARE_URL (as the digest does);
 * without it the canvas still draws, with every line marked "no data".
 *
 * Exits non-zero if the manifest's canvas data is invalid (an unknown `from`
 * value, a link to a page not on the canvas, a click counted on two lines).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { validateCanvas, buildGraph, canvasPages, slugify, propertiesToRead } from '../lib/site-canvas.mjs'
import { renderCanvasHtml } from '../lib/site-canvas-html.mjs'
import { isFromSurface } from '../lib/from-surfaces.mjs'
import { createUmamiClient, rangeToWindow } from '../lib/umami.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const PNG_DIR = join(ROOT, 'docs/screens/png')

const flags = {}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  if (m) flags[m[1]] = m[2] === undefined ? true : m[2]
}
const RANGE = String(flags.range || '30d')
const OUT = resolve(ROOT, String(flags.out || 'docs/screens/canvas/stromata-canvas.html'))
const PERIOD = { '24h': 'in the last 24 hours', '7d': 'in the last 7 days', '30d': 'in the last 30 days', '90d': 'in the last 90 days' }
if (!PERIOD[RANGE]) {
  console.error(`--range must be one of ${Object.keys(PERIOD).join(', ')}`)
  process.exit(1)
}

// The site's own palette (app/globals.css :root, and the reader's dark theme).
const PALETTE = {
  light: {
    paper: '#F5F0E6', 'paper-deep': '#EDE6D6', ink: '#1E2D3D', 'ink-mute': '#61697A', 'ink-faint': '#6E6A5C',
    rule: '#C9BFA8', 'rule-soft': '#DDD3BD', accent: '#2C4A6B', gold: '#C9943A', 'gold-ink': '#8A5F1E',
    'gold-rule': 'rgba(201, 148, 58, 0.45)', shadow: 'rgba(30, 45, 61, 0.35)',
  },
  dark: {
    paper: '#16130F', 'paper-deep': '#1D1914', ink: '#ECE6D8', 'ink-mute': '#A8A08F', 'ink-faint': '#928A79',
    rule: '#3A342B', 'rule-soft': '#2C2720', accent: '#9DB4CE', gold: '#C9943A', 'gold-ink': '#D8AA5C',
    'gold-rule': 'rgba(201, 148, 58, 0.5)', shadow: 'rgba(0, 0, 0, 0.7)',
  },
}

// Facts about the data a reader of the canvas needs, and the code cannot infer.
const NOTES = [
  'Counts are clicks that carried a `from` value, read from Umami. A page type stands for every page of that type: the reader node is any text, the author node any author.',
  'theme-click predates the `from` rule and records its surface as `source` (homepage, featured-lead, text-page), so the lines into the theme page read that property instead.',
  'Until the first release after 2 Nov 2026, every text page also sent text-open on load, with no `from`. That is why text-open shows far more events than the lines account for in any window that reaches back before it.',
]

async function readClicks(pairs) {
  const u = await createUmamiClient()
  const w = rangeToWindow(RANGE)
  const totals = await u.get('websites/{id}/metrics', { ...w, type: 'event' })
  const totalOf = Object.fromEntries((Array.isArray(totals) ? totals : []).map(r => [r.x, r.y]))
  const out = {}
  for (const { event, property } of pairs) {
    const rows = await u.get('websites/{id}/event-data/values', { ...w, eventName: event, propertyName: property })
    const values = {}
    for (const r of Array.isArray(rows) ? rows : []) values[r.value] = (values[r.value] ?? 0) + Number(r.total ?? r.count ?? 0)
    out[event] ??= { total: totalOf[event] ?? 0, by: {} }
    out[event].by[property] = values
  }
  return { range: RANGE, events: out }
}

/** One screen from the top of each shot, sized for the board, as a data URI. */
async function thumbnail(name, mode) {
  const file = join(PNG_DIR, `${slugify(name)}--top-of-page--${mode}.jpg`)
  if (!existsSync(file)) return null
  const spec = mode === 'phone' ? { cropW: 780, cropH: 1688, outW: 460 } : { cropW: 1440, cropH: 900, outW: 800 }
  const meta = await sharp(file).metadata()
  const buf = await sharp(file)
    .extract({ left: 0, top: 0, width: Math.min(spec.cropW, meta.width), height: Math.min(spec.cropH, meta.height) })
    .resize({ width: spec.outW })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer()
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
  const errors = validateCanvas(manifest.pages, isFromSurface)
  if (errors.length) {
    console.error('The manifest\'s canvas data has problems:\n  ' + errors.join('\n  '))
    process.exit(1)
  }
  const pages = canvasPages(manifest.pages)

  let clicks = null
  let clickError = flags['no-clicks'] ? 'not requested' : null
  if (!flags['no-clicks']) {
    try {
      clicks = await readClicks(propertiesToRead(manifest.pages))
    } catch (err) {
      clickError = 'Umami could not be read'
      console.warn(`Umami unavailable, drawing routes only: ${String(err.message).split('\n')[0]}`)
    }
  }
  const graph = buildGraph(manifest.pages, clicks, isFromSurface)

  const images = {}
  const missing = []
  for (const p of pages) {
    const id = slugify(p.name)
    images[id] = {}
    for (const mode of ['phone', 'desktop']) {
      const uri = await thumbnail(p.name, mode)
      if (uri) images[id][mode] = uri
      else missing.push(`${p.name} (${mode})`)
    }
  }

  const rendered = new Date().toISOString().slice(0, 10)
  const html = renderCanvasHtml(graph, images, {
    title: 'Stromata Site Canvas',
    heading: 'Stromata',
    subheading: 'site canvas',
    periodLabel: `${PERIOD[RANGE]} to ${rendered}`,
    rendered,
    clickError,
    notes: NOTES,
    palette: PALETTE,
  }, { fragment: Boolean(flags.fragment) })

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, html)
  console.log(`Wrote ${OUT.replace(ROOT + '/', '')} (${(html.length / 1e6).toFixed(1)} MB)`)
  console.log(`${graph.nodes.length} pages, ${graph.edges.length} lines, clicks ${clicks ? PERIOD[RANGE] : `unavailable (${clickError})`}.`)
  for (const e of graph.edges) {
    console.log(`  ${String(e.count ?? '—').padStart(5)}  ${e.source} → ${e.target}  (${e.event})`)
  }
  if (graph.offCanvas.length) console.log(`Off the canvas: ${graph.offCanvas.map(o => `${o.from} ${o.count}`).join(', ')}`)
  if (graph.unknown.length) console.log(`Outside the vocabulary: ${graph.unknown.map(o => `${o.event}/${o.from} ${o.count}`).join(', ')}`)
  if (missing.length) console.log(`No screenshot for: ${missing.join(', ')}. Run npm run screens -- --png first.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
