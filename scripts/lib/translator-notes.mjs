/**
 * translator-notes.mjs — the judgement half of `scripts/backfill-translator-notes.mjs`
 *
 * Card: Import translators' notes into published NPNF/ANF texts. None of the ~400 published texts
 * translated in the Nicene and Ante-Nicene Fathers carries the translators' notes: the fetcher took
 * the text from New Advent, which drops them. CCEL's plain-text export of each volume
 * (`ccel.org/ccel/s/schaff/<vol>/cache/<vol>.txt`) has them: every note is an inline marker `[42]`
 * after the word it glosses, and its definition sits under a rule at the end of the section, numbered
 * uniquely across the volume.
 *
 * The method, all pure and tested here:
 *   1. `volumeFor(source_attribution)` names the CCEL volume (npnf109, anf03, …).
 *   2. `locateSpan` finds the text inside the volume by its first and last words.
 *   3. `placeMarkers` anchors each marker in the span to the same words in our body, by the words
 *      before it (and, when those repeat, after it). A marker that cannot be placed exactly once is
 *      reported unmatched, never guessed.
 *   4. `applyNotes` inserts `[^1]…` and appends the definitions, and `stripNotes` proves the body is
 *      otherwise byte-identical.
 * Words are compared lower-cased and letters-only, so New Advent's punctuation and quotes do not stop
 * a match, while a different sentence does.
 */

const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 }

/** "IV" → 4, "12" → 12, otherwise null. */
export function parseVolumeNumber(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\\?\.$/, '')
  if (/^\d+$/.test(t)) return Number(t)
  if (!/^[ivxlc]+$/.test(t)) return null
  let n = 0
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN[t[i]], next = ROMAN[t[i + 1]] ?? 0
    n += v < next ? -v : v
  }
  return n
}

/**
 * The CCEL volume id a source attribution cites, or null.
 * "ANF, Vol. IV" → anf04; "NPNF, Series II, Vol. VII" / "Second Series, Vol. 7" → npnf207.
 * With no series named, Series I unless Henry Wace (editor of Series II only) is credited.
 */
export function volumeFor(attribution) {
  const a = String(attribution ?? '')
  const vol = /vol(?:ume)?\.?\s*([ivxlc]+|\d+)\b/i.exec(a)
  if (!vol) return null
  const n = parseVolumeNumber(vol[1])
  if (!n) return null
  if (/\bANF\b|Ante-Nicene/i.test(a)) return `anf${String(n).padStart(2, '0')}`
  if (!/\bNPNF\b|Nicene and Post-Nicene/i.test(a)) return null
  const second = /series\s*(II|2)\b|second series/i.test(a) || (!/series\s*(I|1)\b|first series/i.test(a) && /\bWace\b/.test(a))
  return `npnf${second ? 2 : 1}${String(n).padStart(2, '0')}`
}

export function ccelUrl(volume) {
  return `https://ccel.org/ccel/s/schaff/${volume}/cache/${volume}.txt`
}

/**
 * New Advent's NPNF/ANF text is lightly modernised (Kevin Knight's revision): "If thou wert thyself"
 * there reads "if you were yourself", and "desireth" reads "desires". These forms are mapped on both
 * sides before comparison, so the revision matches its source while a different sentence still does not.
 */
const ARCHAIC = {
  thou: 'you', thee: 'you', ye: 'you', thy: 'your', thine: 'your', thyself: 'yourself', yourselves: 'yourself',
  hast: 'have', hath: 'has', art: 'are', wert: 'were', wast: 'was', dost: 'do', doth: 'does', didst: 'did',
  shalt: 'shall', wilt: 'will', canst: 'can', couldst: 'could', wouldst: 'would', shouldst: 'should', mayest: 'may',
  hadst: 'had', knowest: 'know', saith: 'says',
}

/** One word as compared: lower-case, apostrophes dropped, archaic forms mapped, -eth/-est/-s stems. */
export function norm(word) {
  let w = word.toLowerCase().replace(/['’]/g, '')
  w = ARCHAIC[w] ?? w
  if (w.length > 5 && /(eth|est)$/.test(w)) w = w.slice(0, -3)
  else if (w.length > 4 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1)
  // "desireth"/"desires" and "lovest"/"love" meet at "desir", "lov".
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

/** Words with their character offsets, normalised for comparison. */
export function tokenize(text) {
  const out = []
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu
  let m
  while ((m = re.exec(text))) out.push({ w: norm(m[0]), start: m.index, end: m.index + m[0].length })
  return out
}

/** The body with link targets blanked (same length, so offsets hold): their URL words are not text. */
export function blankLinkTargets(body) {
  return String(body).replace(/\]\([^)]*\)/g, m => ']' + ' '.repeat(m.length - 1))
}

/**
 * Split a CCEL span into its words and its markers. A marker records how many words precede it,
 * so it can be anchored in another copy of the same words.
 */
export function readMarkers(spanText) {
  spanText = withoutDefinitions(spanText)
  const words = []
  const markers = []
  const re = /\[(\d+)\]|[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu
  let m
  while ((m = re.exec(spanText))) {
    if (m[1]) markers.push({ n: Number(m[1]), after: words.length })
    else words.push(norm(m[0]))
  }
  return { words, markers }
}

/**
 * A span can run across a chapter's closing rule and its block of definitions (`   [57] Acts xxi.
 * 26.`), which are not part of the text: remove the rule lines and every definition paragraph.
 */
export function withoutDefinitions(text) {
  return String(text)
    .replace(/^\s*_{5,}\s*$/gm, '')
    // A definition starts a paragraph; a wrapped line of text can also begin with a marker
    // ("…contradictory.\n   [48] Having yielded…"), and that is text, not a definition.
    .replace(/(^|\n[ \t]*\n)[ \t]{0,6}\[\d+\][ \t][\s\S]*?(?=\n[ \t]*\n|(?![\s\S]))/g, '$1')
}

/** Every definition in a volume: `   [42] text…` up to the next blank line, joined onto one line. */
export function readDefinitions(volumeText) {
  const defs = new Map()
  // `(?![\s\S])` is the end of the text: with the m flag, `$` would stop at the end of the first line.
  // A definition starts a paragraph (after a blank line); a wrapped line of text that happens to
  // begin with a marker is not one.
  const re = /(?:^|\n[ \t]*\n)[ \t]{0,6}\[(\d+)\][ \t]+([\s\S]*?)(?=\n[ \t]*\n|(?![\s\S]))/g
  let m
  while ((m = re.exec(volumeText))) {
    const n = Number(m[1])
    // A block can run straight into the next section's rule with no blank line between.
    if (!defs.has(n)) defs.set(n, m[2].split(/\n\s*_{5,}/)[0].replace(/\s+/g, ' ').trim())
    re.lastIndex = m.index + m[0].length
  }
  return defs
}

function indexOfSeq(hay, needle, from = 0) {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

function allIndicesOfSeq(hay, needle) {
  const out = []
  for (let i = indexOfSeq(hay, needle); i !== -1; i = indexOfSeq(hay, needle, i + 1)) out.push(i)
  return out
}

/**
 * Where the body's text sits in the volume: from its first `k` words to its last `k`. Returns the
 * span of volume text (definitions under the closing rule are not in it), or null if either end is
 * not found exactly once in order.
 */
export function locateSpan(volumeText, body, k = 12) {
  const bodyWords = tokenize(stripMarkdown(body)).map(t => t.w)
  if (bodyWords.length < k * 2) return null
  // Volume words, with markers removed so they do not break the run.
  // Same-length blanks, so word offsets still index volumeText itself.
  const volTokens = tokenize(volumeText.replace(/\[\d+\]/g, m => ' '.repeat(m.length)))
  const volWords = volTokens.map(t => t.w)
  // The body may open or close with New Advent's own furniture ("By St. John Cassian … Chapter 1"),
  // laid out differently in the volume: slide over the first and last `slide` words for the first run
  // of `k` that occurs exactly once (the head) and, after it, in order (the tail).
  const slide = Math.min(200, Math.floor(bodyWords.length / 3))
  let headAt = -1
  for (let off = 0; off <= slide && headAt === -1; off += 2) {
    const hits = allIndicesOfSeq(volWords, bodyWords.slice(off, off + k))
    if (hits.length === 1) headAt = hits[0]
  }
  if (headAt === -1) return null
  let tail = -1
  for (let off = 0; off <= slide && tail === -1; off += 2) {
    const end = bodyWords.length - off
    tail = indexOfSeq(volWords, bodyWords.slice(end - k, end), headAt)
  }
  if (tail === -1) return null
  const head = [headAt]
  const start = volTokens[head[0]].start
  const end = volTokens[tail + k - 1].end
  // Pull the marker that sits right after the last word into the span too.
  const after = /^[^\p{L}\p{N}\n]*\[\d+\]/u.exec(volumeText.slice(end))
  return volumeText.slice(start, end + (after ? after[0].length : 0))
}

/** Markdown furniture that is not in the CCEL text: emphasis, headings, links, list markers. */
export function stripMarkdown(md) {
  return String(md)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, ' ')
}

/**
 * Anchor each marker of the span in the body. Each marker is placed by the `before` words that
 * precede it in the CCEL text; if that run occurs more than once in the body, the `after` words that
 * follow it must match too. Exactly one occurrence, or the marker is unmatched.
 */
export function placeMarkers(spanText, body, { before = 8, after = 4 } = {}) {
  const { words, markers } = readMarkers(spanText)
  const bodyTokens = tokenize(blankLinkTargets(body))
  const bodyWords = bodyTokens.map(t => t.w)
  const placed = []
  const unmatched = []
  for (const mk of markers) {
    const pre = words.slice(Math.max(0, mk.after - before), mk.after)
    const post = words.slice(mk.after, mk.after + after)
    let hits = pre.length ? allIndicesOfSeq(bodyWords, pre) : []
    if (hits.length > 1 && post.length) {
      hits = hits.filter(i => post.every((w, j) => bodyWords[i + pre.length + j] === w))
    }
    if (hits.length === 1 && pre.length >= Math.min(before, 3)) {
      const anchor = bodyTokens[hits[0] + pre.length - 1]
      placed.push({ n: mk.n, at: endOfPunctuation(body, anchor.end) })
      continue
    }
    // The revision sometimes reorders the words before a note ("lovest thou me" → "do you love me")
    // while those after it survive: then the `before`-long run that follows the marker, alone, must
    // occur exactly once, and the note goes after the word preceding it.
    const follow = words.slice(mk.after, mk.after + before)
    const fhits = follow.length === before ? allIndicesOfSeq(bodyWords, follow) : []
    if (fhits.length === 1 && fhits[0] > 0) {
      placed.push({ n: mk.n, at: endOfPunctuation(body, bodyTokens[fhits[0] - 1].end) })
    } else {
      unmatched.push({ n: mk.n, context: pre.slice(-5).join(' '), hits: hits.length })
    }
  }
  return { placed, unmatched, total: markers.length }
}

/** A footnote ref goes after the word and any closing punctuation that follows it. */
function endOfPunctuation(body, i) {
  // Inside a link's text ("[…these](url)"), the note goes after the whole link.
  const link = /^[^\[\]\n]{0,4}\]\([^)]*\)/.exec(body.slice(i))
  if (link) i += link[0].length
  const m = /^[.,;:!?'"’”)\]]*/.exec(body.slice(i))
  return i + (m ? m[0].length : 0)
}

/**
 * A note that is only a Scripture reference ("John xxi. 15-17.", "Rom. viii. 32; John iii. 16.").
 * New Advent already prints these inline, so importing them would repeat what the reader sees:
 * counted separately for Keith to decide.
 */
export function isScriptureOnly(def) {
  const book = "(?:[1-3] ?)?[A-Z][a-z]{1,12}\\.?"
  const ref = `${book} ?[ivxlc]+\\.? ?\\d+(?:[-–,] ?\\d+)*`
  return new RegExp(`^(?:See |Cf\\. |Comp\\. )?${ref}(?:[;,] ?(?:${ref}|[ivxlc]+\\.? ?\\d+(?:[-–,] ?\\d+)*|\\d+(?:[-–] ?\\d+)?))*\\.?$`).test(String(def).trim())
}

/** Garbled or untranscribed Greek in a definition is flagged, never guessed. */
export function looksGarbled(def) {
  return /�|\?{2,}/.test(def)
}

/**
 * Insert `[^1]…[^n]` at the placed positions (in reading order) and append the definitions block.
 * Returns the new body and the definitions used, or throws if a placed marker has no definition.
 */
export function applyNotes(body, placed, definitions) {
  const ordered = [...placed].sort((a, b) => a.at - b.at)
  let out = ''
  let last = 0
  const defLines = []
  ordered.forEach((p, i) => {
    const def = definitions.get(p.n)
    if (!def) throw new Error(`note [${p.n}] has no definition in the volume`)
    out += body.slice(last, p.at) + `[^${i + 1}]`
    last = p.at
    defLines.push(`[^${i + 1}]: ${def}`)
  })
  out += body.slice(last)
  if (!defLines.length) return { body, notes: 0 }
  return { body: `${out.replace(/\s+$/, '')}\n\n${defLines.join('\n')}\n`, notes: defLines.length }
}

/** The body with every `[^n]` reference and definition line removed: must equal the original. */
export function stripNotes(body) {
  return body
    .replace(/\n\n(\[\^\d+\]: .*\n?)+$/, '\n')
    .replace(/\[\^\d+\]/g, '')
}
