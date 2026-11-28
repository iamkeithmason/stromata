// Usage: node scripts/ingestion/staging-tools/stage-babylonian-captivity-1916.mjs <worksofmartinlut02luth_djvu.xml> <out.md> <review.md>
// One-off: the page geometry rules here are tuned to this volume, so it is kept as a record of how
// the staged text was made, not as a general tool (extract-djvu-xml.mjs is that).
// Stage Steinhaeuser's 1916 Babylonian Captivity (Works of Martin Luther, vol. II, Philadelphia
// Edition, pp. 170-293) from the Archive.org djvu XML, using word positions: running heads,
// footnotes and marginal Scripture glosses are told from the text by where they sit.
import fs from 'node:fs'
import { parseDjvuXml } from '../../lib/djvu-layout.mjs'

const [xmlPath, outMd, outReview] = process.argv.slice(2)
const pages = parseDjvuXml(fs.readFileSync(xmlPath, 'utf8'))
const start = pages.findIndex((p) => p.lines.some((l) => /^Willy\s+nilly/.test(l.text)))
const end = pages.findIndex((p, i) => i > start && p.lines.some((l) => /TREATISE\s+ON\s+CHRISTIAN\s+LIBERTY/.test(l.text)))
const review = { margin: [], footnotes: [], headers: [], lowconf: [] }
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? 0 }
const H = (l) => l.y1 - l.y0
const letters = (s) => (s.match(/[A-Za-z]/g) || []).length
const upperShare = (s) => (s.match(/[A-Z]/g) || []).length / Math.max(1, letters(s))

const out = [] // { kind: 'line'|'heading'|'verse', text, indent, page }
for (let p = start; p < end; p++) {
  const page = pages[p]
  const full = page.lines.filter((l) => H(l) >= 46 && l.text.length > 45)
  if (!full.length) continue
  const left = median(full.map((l) => l.x0).filter((x) => x < median(full.map((l) => l.x0)) + 40))
  const right = median(full.map((l) => l.x1))
  let seenBody = false
  let inNotes = false
  const bodyH = median(full.map(H))
  let prevY1 = null
  let skipping = p === start
  page.lines.forEach((l, i) => {
    const text = l.text.trim()
    const gap = prevY1 == null ? 0 : l.y0 - prevY1
    prevY1 = l.y1
    // The title page: the title and date are the record's own; keep the salutation as a block.
    if (skipping) {
      if (/^Willy\s+nilly/.test(text)) skipping = false
      else { if (!/BABYLONIAN|CHURCH|^1520$/.test(text)) out.push({ kind: 'salute', text, page: p }); return }
    }
    // running head: top line with a page number at either end
    if (p !== start && l.y0 < 230 && l.words.length <= 9) { review.headers.push(`[${p}] ${text}`); return }
    if (/Douay\s+Version\s+h\|is|29S\|'ff/.test(text)) { review.footnotes.push(`[${p}] ${text}`); return }
    if (i === 0 && p !== start && l.words.length <= 9 && (/^(\S{2,3}\s+.+|.+\s+\S{2,3})$/.test(text) || /Babylonian\s+Captivity|Sacrament\s+of|Preface|Conclusion|Baptism|Penance|Confirmation|Marriage|Ordination|Unction/.test(text))) { review.headers.push(`[${p}] ${text}`); return }
    if (letters(text) < 2) { review.headers.push(`[${p}] (speck) ${text}`); return }
    if (/^\(\d{3}\)$/.test(text) || /^\S{1,4}$/.test(text) && l.y0 > page.height * 0.85) { review.headers.push(`[${p}] ${text}`); return }
    // Footnotes: set smaller than the text, below a wider gap than the leading. Everything after the
    // first one on the page is notes.
    const small = H(l) < bodyH * 0.8 && upperShare(text) < 0.7
    const marked = /^[\^'"*■•§†»\d]/.test(text)
    const noteStart = seenBody && H(l) < bodyH * 0.84 && upperShare(text) < 0.7 && (marked ? l.x0 < right - 400 && (gap > 28 || small) : l.x0 - left < 90 && gap > 28)
    if (inNotes || noteStart) { inNotes = true; review.footnotes.push(`[${p}] ${text}`); return }
    // Section headings: display capitals set in from the left of the text block.
    if ((upperShare(text) > 0.85 && letters(text) >= 5 && l.x0 - left > 150 && !/[a-z]/.test(text)) || /^THE\s+SACRAMENT\s+OF\s+[A-Z]/.test(text)) { out.push({ kind: 'heading', text, page: p }); return }
    // marginal glosses: words outside the text block
    const keep = []
    for (const w of l.words) {
      if (w.x0 > right - 12 || w.x1 < left + 12) review.margin.push(`[${p}] ${w.text}  (in: ${text.slice(0, 50)})`)
      else keep.push(w)
    }
    if (!keep.length) return
    const t = keep.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
    const low = keep.filter((w) => w.conf != null && w.conf < 20)
    if (low.length) review.lowconf.push(`[${p}] ${low.map((w) => w.text).join(', ')}  (in: ${t.slice(0, 60)})`)
    const x0 = Math.min(...keep.map((w) => w.x0))
    const x1 = Math.max(...keep.map((w) => w.x1))
    const off = x0 - left
    const centred = off > 120 && right - x1 > 100
    if (centred && upperShare(t) > 0.8 && letters(t) >= 5) { out.push({ kind: 'heading', text: t, page: p }); return }
    seenBody = true
    out.push({ kind: 'line', text: t, off, page: p, centred, wide: x1 > right - 150 })
  })
}

// Words printed with a hyphen inside a line: a line-end hyphen between their halves is kept.
const all = out.map((o) => o.text).join(' ')
const hyphenated = new Set([...all.matchAll(/\b([A-Za-z]+-[A-Za-z]+)\b/g)].map((m) => m[1].toLowerCase()))

const paras = []
let cur = null
let prevHyphen = false
const salute = out.filter((o) => o.kind === 'salute').map((o) => o.text)
for (const o of out) {
  if (o.kind === 'salute') continue
  if (o.kind === 'heading') { if (cur) paras.push(cur); paras.push({ heading: o.text }); cur = null; prevHyphen = false; continue }
  // Verse: short lines set well in from the left, not the tail of a hyphenated word.
  if (!prevHyphen && o.off > 200 && !o.wide) {
    if (cur && !cur.verse) { paras.push(cur); cur = null }
    cur ??= { text: '', verse: true }
    cur.text += (cur.text ? '  \n' : '') + o.text
    continue
  }
  if (cur?.verse) { paras.push(cur); cur = null }
  const indent = !prevHyphen && o.off > 30 && o.off < 120
  if (!cur || indent) { if (cur) paras.push(cur); cur = { text: '' } }
  if (prevHyphen) {
    const tailWord = cur.text.match(/([A-Za-z]+)-$/)?.[1] ?? ''
    const headWord = o.text.match(/^([A-Za-z]+)/)?.[1] ?? ''
    const keepHyphen = hyphenated.has(`${tailWord}-${headWord}`.toLowerCase())
    cur.text = keepHyphen ? cur.text + o.text : cur.text.slice(0, -1) + o.text
  } else cur.text += (cur.text ? ' ' : '') + o.text
  prevHyphen = /[A-Za-z]-$/.test(o.text) && !/--$/.test(o.text)
}
if (cur) paras.push(cur)

const fix = (s) => s
  .replace(/\s*q\^+/g, '')
  .replace(/\^+/g, '')
  .replace(/([a-z])[HUK]([a-z])/g, '$1li$2') // OCR reads "li" as "H", "U" or "K": pubHshed, reaUze, multipKed
  .replace(/([a-z])3r([a-z])/g, '$1y$2') // "y" read as "3r": ever3rwhere, la3rmen
  .replace(/([a-z])3d([a-z])/g, '$1yi$2') // "yi" read as "3d": sa3dng
  .replace(/([a-z])3([a-z])/g, '$1y$2')
  .replace(/(\w)\/(?=\s|$)/g, '$1') // footnote marker read as "/"
  .replace(/([a-z])\*(?=[\s,.;:]|$)/g, '$1') // footnote marker "*"
  .replace(/([,.;:])'(?=\s|$)/g, '$1') // footnote marker after punctuation
  .replace(/''/g, '"')
  .replace(/([,.;:])[i1](?=\s)/g, '$1') // footnote "1" glued to punctuation: "said,i the"
  .replace(/\b([il]) (Cor|Corinthians|Tim|Timothy|Pet|Peter|John|Kings|Thess|Sam|Samuel|Chron)\b/g, '1 $2')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/\s{2,}/g, ' ')
  .trim()

const title = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|The|And|In)\b/g, (m, w, i) => (i === 0 ? m : m.toLowerCase()))
const saluteMd = salute.length ? salute.map(fix).join('  \n') + '\n\n' : ''
const body = saluteMd + paras.map((p) => (p.heading ? `## ${title(fix(p.heading))}` : p.verse ? p.text.split('  \n').map(fix).join('  \n') : fix(p.text))).join('\n\n')
for (const p of paras) if (p.verse) console.log('VERSE:', p.text.replace(/\s*\n/g, ' / ').slice(0, 160))
fs.writeFileSync(outMd, body + '\n')
const sect = (h, xs) => `## ${h} (${xs.length})\n\n${xs.map((x) => `- ${x}`).join('\n')}\n`
fs.writeFileSync(outReview, [
  `# Review: Babylonian Captivity, 1916 (leaves ${start}-${end - 1})`, '',
  sect('Words in the margin, dropped (marginal Scripture references and glosses)', review.margin),
  sect('Footnote lines, dropped (reading edition)', review.footnotes),
  sect('Running heads and page numbers, dropped', review.headers),
  sect('Words the scanner was unsure of', review.lowconf),
].join('\n'))
console.log(`leaves ${start}-${end - 1}; ${paras.length} paragraphs; ${(body.match(/\S+/g) || []).length} words; margin ${review.margin.length}, notes ${review.footnotes.length}, heads ${review.headers.length}, low-conf ${review.lowconf.length}`)
