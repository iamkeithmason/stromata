/**
 * footnote-deinterleave.mjs — pull page-bottom footnotes out of OCR prose.
 *
 * djvu.txt of a typeset book interleaves each page's footnotes into the text
 * stream at the page break, e.g.:
 *
 *     …congregatio — held  to-        <- main text, word split at page edge
 *                                      <- blank
 *     1  Vialor, a current word…       <- footnote block (numbered, small)
 *     2  See also chap. II…
 *                                      <- blank
 *     2                                <- page number (standalone)
 *                                      <- blank
 *     THE CHURCH                       <- running head (all-caps)
 *                                      <- blank
 *     gether under one rule…           <- main text resumes ("to-" + "gether")
 *
 * This detects those page-break regions (a numbered footnote block sitting
 * immediately above a standalone page-number line), lifts the footnotes out,
 * drops the page-number + running-head noise, and lets the split word rejoin.
 * Footnotes are returned separately so the caller can append them as endnotes
 * (default) or drop them — the prose itself comes back clean either way.
 *
 * Heuristic, tuned for the NPNF/Scribner-style scholarly editions this corpus
 * draws on. It is conservative: a block is only treated as footnotes when it
 * starts with a small note number (1–9) and sits directly above a page number.
 */

const isBlank = l => !l.trim()

// A page-break marker: the chrome that separates one page's footnotes from the
// next page's text. Either a standalone page number, OR a running head (the
// book/chapter title in caps) — which OCR often merges with the page number on
// one line, e.g. "CHRIST THE ONLY HEAD OF THE CHURCH 33".
const isPageBreakMarker = l => {
  const t = l.trim().replace(/\s{2,}/g, ' ')
  if (!t) return false
  if (/^\d{1,4}$/.test(t)) return true
  const core = t.replace(/^\d{1,4}\s+/, '').replace(/\s+\d{1,4}$/, '').trim()
  return core.length >= 6 && core.length <= 60 && core === core.toUpperCase() && /[A-Z]/.test(core) && !/[a-z]/.test(core)
}
const isRunningHead = isPageBreakMarker
/**
 * @returns {{ text: string, notes: string[], removedBlocks: number }}
 */
export function deinterleaveFootnotes(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const removed = new Set()
  const notes = []
  let removedBlocks = 0

  const isNoteStart = l => /^\s*[1-9]\d?\s+["“(A-Za-z]/.test(l)
  const isFirstNote = l => /^\s*1\s+["“(A-Za-z]/.test(l)

  for (let i = 0; i < lines.length; i++) {
    if (!isPageBreakMarker(lines[i])) continue

    // Walk up from the page number to the top of the page's footnote stack.
    // Footnotes restart at "1" per page and are separated by single blanks, so
    // collect upward (crossing blanks) until we reach note 1.
    let b = i - 1
    while (b >= 0 && isBlank(lines[b])) b--
    let top = -1
    if (b >= 0) {
      const limit = Math.max(0, b - 45)
      for (let k = b; k >= limit; k--) {
        if (isFirstNote(lines[k])) { top = k; break }
      }
    }

    if (top !== -1) {
      let current = []
      for (let k = top; k <= b; k++) {
        removed.add(k)
        const t = lines[k].trim().replace(/\s{2,}/g, ' ')
        if (!t) continue
        if (isNoteStart(t) && current.length) { notes.push(current.join(' ')); current = [] }
        current.push(t)
      }
      if (current.length) notes.push(current.join(' '))
      removedBlocks++
    }

    // The page number itself, and a running head just below it, are noise.
    removed.add(i)
    let r = i + 1
    while (r < lines.length && isBlank(lines[r])) r++
    if (r < lines.length && isRunningHead(lines[r])) removed.add(r)
  }

  // A chapter's final page has no page-break marker after its footnotes, so the
  // loop above misses them. Handle a footnote block dangling at the very end.
  {
    let b = lines.length - 1
    while (b >= 0 && (removed.has(b) || isBlank(lines[b]))) b--
    let top = -1
    for (let k = b; k >= Math.max(0, b - 45); k--) {
      if (removed.has(k)) break
      if (isFirstNote(lines[k])) { top = k; break }
    }
    if (top !== -1) {
      let current = []
      for (let k = top; k <= b; k++) {
        if (removed.has(k)) continue
        removed.add(k)
        const t = lines[k].trim().replace(/\s{2,}/g, ' ')
        if (!t) continue
        if (isNoteStart(t) && current.length) { notes.push(current.join(' ')); current = [] }
        current.push(t)
      }
      if (current.length) notes.push(current.join(' '))
      removedBlocks++
    }
  }

  const text = lines.filter((_, i) => !removed.has(i)).join('\n')
  return { text, notes, removedBlocks }
}

// Strip inline footnote reference markers: a small digit glued to a word or to
// a word-final period ("pilgrim1", "mother.2"). Conservative — leaves spaced
// numbers (scripture citations like "Matt. 25 : 31") untouched.
export function stripInlineMarkers(text) {
  return text
    .replace(/([A-Za-z])\.([1-9])\b/g, '$1.') // "mother.2" -> "mother."
    .replace(/([A-Za-z]{2,})([1-9])\b/g, '$1') // "pilgrim1" -> "pilgrim"
}
