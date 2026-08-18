/**
 * split-into-chapters.mjs — split one long text (OCR or markdown) into a
 * collection of per-chapter entries.
 *
 * For this corpus (19th/early-20th-c. scholarly editions) chapter structure is
 * almost always recoverable from the text itself: explicit "CHAPTER N" headings,
 * usually with the chapter title on the next line(s). This detects those
 * boundaries deterministically, extracts real titles, reflows each chapter's
 * OCR body into paragraphs, and writes the multi-file output/{slug}/ layout that
 * pipeline-import.mjs already consumes for collections.
 *
 * It does NOT do deep OCR correction (scannos, inline footnotes) — those stay
 * the job of detect-scannos / footnote review at import time. This is about
 * structure: where one chapter ends and the next begins, and what it's called.
 *
 * Usage:
 *   node split-into-chapters.mjs <input.txt> --slug=<slug> --title="…" \
 *     --author="…" --genre="…" [--min-chapters=3] [--dry]
 *
 * --dry prints the detected chapters (number, title, size) without writing.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { deinterleaveFootnotes, stripInlineMarkers } from './footnote-deinterleave.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'output')

// A line that introduces a chapter/section, e.g. "CHAPTER I", "CHAP. 4",
// "CAPUT III", "BOOK II", "SECTION 5", or a markdown "## Chapter 3".
const MARKER_RE =
  /^\s*(?:#{1,3}\s*)?(CHAPTER|CHAP\.?|CAPUT|BOOK|PART|SECTION|LECTURE|DISCOURSE|SERMON)\s+([IVXLCDM]+|\d+)\.?\s*$/i
// Where the chapters end: back-matter markers.
const END_RE = /^\s*(?:#{1,3}\s*)?(INDEX|APPENDIX|APPENDICES|BIBLIOGRAPHY|NOTES|ERRATA|COLOPHON)\b/i

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
function romanToInt(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const u = s.toUpperCase()
  let total = 0
  for (let i = 0; i < u.length; i++) {
    const cur = ROMAN[u[i]] || 0
    const next = ROMAN[u[i + 1]] || 0
    total += cur < next ? -cur : cur
  }
  return total
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'or', 'on', 'for', 'into', 'upon', 'with', 'by', 'from'])
function titleCase(s) {
  const words = s.toLowerCase().split(/\s+/).filter(Boolean)
  return words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// Is this line a chapter title fragment (all-caps heading text, not prose)?
function looksLikeTitleLine(line) {
  const t = line.trim().replace(/\s{2,}/g, ' ')
  if (!t || t.length > 70) return false
  // Mostly uppercase letters, no sentence-ending punctuation, few digits.
  const letters = t.replace(/[^A-Za-z]/g, '')
  if (letters.length < 2) return false
  const upper = t.replace(/[^A-Z]/g, '').length
  return upper / letters.length > 0.85 && !/[.:;?!]$/.test(t)
}

/**
 * Detect chapter boundaries in raw text. Pure — no file IO. Returns the
 * detected chapters (with raw, unreflowed bodies) plus what was skipped, so a
 * caller can preview before writing anything.
 */
export function detectChapters(raw, opts = {}) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const warnings = []

  // Find all marker lines.
  const markers = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER_RE)
    if (m) markers.push({ line: i, kind: m[1].toUpperCase().replace(/\.$/, ''), roman: m[2], num: romanToInt(m[2]) })
  }
  if (markers.length === 0) return { chapters: [], frontMatterLines: lines.length, backMatterFrom: null, warnings: ['No chapter markers found.'] }

  // Keep the dominant marker kind (e.g. CHAPTER) — ignore stray BOOK/PART noise.
  const counts = {}
  for (const mk of markers) counts[mk.kind] = (counts[mk.kind] || 0) + 1
  const kind = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]

  // Enforce strictly ascending numbering: drop out-of-sequence markers, which
  // are almost always inline cross-references ("as shown in Chapter XVIII")
  // that OCR left on their own line, not real chapter boundaries.
  const chapMarkers = []
  for (const mk of markers.filter(m => m.kind === kind)) {
    if (chapMarkers.length === 0 || mk.num > chapMarkers[chapMarkers.length - 1].num) {
      chapMarkers.push(mk)
    } else {
      warnings.push(`Ignored out-of-sequence ${kind} ${mk.roman} at line ${mk.line + 1} (likely a cross-reference, not a boundary).`)
    }
  }
  // Warn on gaps (a possibly-missed boundary from a garbled heading).
  for (let i = 1; i < chapMarkers.length; i++) {
    if (chapMarkers[i].num !== chapMarkers[i - 1].num + 1) {
      warnings.push(`${kind} numbering skips ${chapMarkers[i - 1].roman} → ${chapMarkers[i].roman} (a boundary may have been missed).`)
    }
  }

  // Back-matter start (INDEX/APPENDIX…) after the last marker.
  let backMatterFrom = null
  for (let i = chapMarkers[chapMarkers.length - 1].line + 1; i < lines.length; i++) {
    if (END_RE.test(lines[i])) { backMatterFrom = i; break }
  }

  const chapters = chapMarkers.map((mk, idx) => {
    const bodyStart = mk.line + 1
    const bodyEnd = idx + 1 < chapMarkers.length ? chapMarkers[idx + 1].line : backMatterFrom ?? lines.length

    // Title = the title-like line(s) after the marker. OCR usually leaves a
    // blank line between the "CHAPTER N" marker and the title, and titles can
    // span two lines, so skip blanks and gather consecutive title-like lines.
    const titleLines = []
    let j = bodyStart
    while (j < bodyEnd && !lines[j].trim()) j++ // skip leading blanks
    while (j < bodyEnd && titleLines.length < 3) {
      const t = lines[j].trim()
      if (!t) {
        // A blank inside the title block: only continue if the next non-blank
        // line is itself title-like (a wrapped title), else the title is done.
        let k = j
        while (k < bodyEnd && !lines[k].trim()) k++
        if (k < bodyEnd && titleLines.length > 0 && looksLikeTitleLine(lines[k])) { j = k; continue }
        break
      }
      if (looksLikeTitleLine(t)) { titleLines.push(t.replace(/\s{2,}/g, ' ')); j++ } else break
    }
    const rawTitle = titleLines.join(' ').trim()
    const title = rawTitle ? titleCase(rawTitle) : `${titleCase(kind)} ${mk.roman}`

    return {
      order: idx + 1,
      number: mk.roman,
      title,
      hadTitle: !!rawTitle,
      rawBody: lines.slice(j, bodyEnd).join('\n'),
    }
  })

  return { chapters, frontMatterLines: chapMarkers[0].line, backMatterFrom, kind, warnings }
}

// Clean an OCR/hard-wrapped chapter body: lift page-bottom footnotes out of the
// prose, rejoin words split across page breaks, drop inline markers, reflow into
// paragraphs. Returns the clean body plus the extracted notes (in order).
export function cleanBody(raw, opts = {}) {
  // 1. Pull page-bottom footnotes (and page-number/running-head chrome) out.
  const { text: deinterleaved, notes } = deinterleaveFootnotes(raw)

  // 2. Rejoin words hyphen-split across the removed page break ("to-\n\ngether").
  let text = deinterleaved.replace(/(\w)-\s*\n(?:\s*\n)*\s*(\w)/g, '$1$2')
  // 3. Rejoin ordinary hyphenated line-wraps too.
  text = text.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
  text = text.split('\n').map(l => l.replace(/\s{2,}/g, ' ').trim()).join('\n')
  // 4. Drop inline footnote reference markers ("pilgrim1", "mother.2").
  text = stripInlineMarkers(text)

  const kept = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) { kept.push(''); continue }
    if (/^\d{1,4}$/.test(t)) continue // any stray standalone page number
    if (looksLikeTitleLine(t) && t.length < 45) continue // stray running head
    kept.push(t)
  }

  // 5. Accumulate lines into paragraphs; blank line = break.
  const paras = []
  let buf = []
  for (const line of kept) {
    if (!line) { if (buf.length) { paras.push(buf.join(' ')); buf = [] } continue }
    buf.push(line)
  }
  if (buf.length) paras.push(buf.join(' '))

  const body = paras.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  // Clean each note: drop its leading page-local number, and strip running-head
  // fragments (runs of 2+ all-caps words, e.g. "THE UNITY OF THE CHURCH") that
  // OCR folded into the note when a footnote block spanned a page.
  const cleanNotes = notes
    .map(n =>
      n
        .replace(/^\s*[1-9]\d?\s+/, '')
        .replace(/\s*\b[A-Z]{2,}(?:\s+[A-Z]{2,})+\b\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
  return { body, notes: cleanNotes }
}

function buildFrontmatter(cfg, ch) {
  return `---
title: "${ch.title.replace(/"/g, '\\"')}"
slug: "${ch.slug}"
author: "${cfg.author || ''}"
genre: "${cfg.genre || ''}"
themes: []  # TODO — choose 2–6 theme slugs from the controlled vocabulary
collection: "${cfg.slug}"
collection_order: ${ch.order}
source_attribution: "${cfg.sourceAttribution || ''}"
provenance_notes: "${cfg.provenanceNotes || ''}"
translation_notes: "${cfg.translationNotes || ''}"
ocr_quality: "medium"
published: false
copyright_safe: true
note_draft: ""
---

<!-- EDITORIAL INTRO — 2–4 sentences on what this chapter covers. -->

`
}

/** Full run: detect, clean, and write per-chapter files. */
export function splitToFiles(raw, cfg, opts = {}) {
  const minChapters = opts.minChapters ?? 3
  const { chapters, frontMatterLines, backMatterFrom, kind, warnings } = detectChapters(raw, opts)

  if (chapters.length < minChapters) {
    return { written: 0, chapters, warnings: [...warnings, `Only ${chapters.length} ${kind || 'chapter'}(s) detected (min ${minChapters}); not splitting.`], skipped: true }
  }

  const dir = path.join(OUTPUT_DIR, cfg.slug)
  const manifest = chapters.map(ch => {
    const numSlug = String(ch.order).padStart(2, '0')
    const titleSlug = ch.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    ch.slug = `${cfg.slug}-${numSlug}-${titleSlug}`
    const { body, notes } = cleanBody(ch.rawBody, opts)
    ch.words = body.split(/\s+/).filter(Boolean).length
    ch.noteCount = notes.length
    // Footnotes preserved as sequential endnotes by default (out of the prose,
    // nothing lost); pass footnotes:'drop' to omit them.
    ch.cleanBody =
      notes.length && opts.footnotes !== 'drop'
        ? `${body}\n\n---\n\n### Notes\n\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
        : body
    return ch
  })

  if (!opts.dry) {
    fs.mkdirSync(dir, { recursive: true })
    for (const ch of manifest) {
      fs.writeFileSync(path.join(dir, `${ch.slug}.md`), buildFrontmatter(cfg, ch) + ch.cleanBody + '\n', 'utf8')
    }
  }

  return {
    written: opts.dry ? 0 : manifest.length,
    dir,
    chapters: manifest,
    frontMatterLines,
    backMatterFrom,
    kind,
    warnings,
  }
}

// --- CLI ---
function parseArgs(argv) {
  const opts = {}
  const positional = []
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=')
      opts[k] = v.length ? v.join('=') : true
    } else positional.push(a)
  }
  return { opts, positional }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { opts, positional } = parseArgs(process.argv.slice(2))
  const input = positional[0]
  if (!input || !opts.slug) {
    console.error('Usage: node split-into-chapters.mjs <input.txt> --slug=<slug> --title="…" --author="…" --genre="…" [--min-chapters=3] [--dry]')
    process.exit(1)
  }
  const raw = fs.readFileSync(input, 'utf8')
  const cfg = {
    slug: opts.slug,
    title: opts.title || opts.slug,
    author: opts.author || '',
    genre: opts.genre || '',
    sourceAttribution: opts['source-attribution'] || '',
    provenanceNotes: opts['provenance-notes'] || '',
    translationNotes: opts['translation-notes'] || '',
  }
  const res = splitToFiles(raw, cfg, {
    dry: !!opts.dry,
    minChapters: opts['min-chapters'] ? Number(opts['min-chapters']) : 3,
  })

  console.log(`\nDetected ${res.chapters.length} ${res.kind || 'chapter'}(s); front matter = ${res.frontMatterLines} lines${res.backMatterFrom ? `; back matter from line ${res.backMatterFrom}` : ''}`)
  for (const ch of res.chapters) {
    console.log(`  ${String(ch.order).padStart(2)}. ${ch.number.padEnd(6)} ${ch.title}${ch.words ? `  (${ch.words} words${ch.noteCount ? `, ${ch.noteCount} notes` : ''})` : ''}${ch.hadTitle ? '' : '  [no title found]'}`)
  }
  if (res.warnings.length) console.log('\nWarnings:\n' + res.warnings.map(w => '  ⚠ ' + w).join('\n'))
  if (res.skipped) console.log('\nSkipped (below min-chapters).')
  else if (!opts.dry) console.log(`\n✓ Wrote ${res.written} files → ${res.dir}`)
  else console.log('\n(dry run — no files written)')
}
