/**
 * Corpus-specific preprocessing applied before the reference parser runs.
 *
 * The 19th-century NPNF/ANF translations in this library contain two reference
 * patterns that bible-passage-reference-parser does not handle out of the box:
 *
 *   1. Roman-numeral chapters/verses — "St. Matt. v. 3" → "Matt. 5:3",
 *      "1 Cor. xiii. 1-3" → "1 Cor. 13:1-3", "Rom. viii." → "Rom. 8".
 *      These are ~2% of references in the corpus, but the parser actively
 *      MISREADS some of them (it treats "v." as a verse marker and returns the
 *      wrong verse), so converting them up front both recovers the reference
 *      and prevents a bad parse.
 *   2. "Apoc." (Apocalypse) as a name for Revelation — "Apoc. 19.16" → "Rev. 19.16".
 *
 * Both edits change string length, so `normalizeScriptureText` returns an index
 * mapper that translates an offset in the normalised text back to the original
 * input. The untouched ~98% of the text maps 1:1; edited spans clamp to the
 * start of the original match, which is enough to anchor inline UI.
 */

export interface NormalizedText {
  /** The preprocessed text, safe to hand to the parser. */
  text: string
  /** Map a character offset in `text` back to an offset in the original input. */
  mapIndex: (index: number) => number
}

// Book tokens the roman-numeral pass will anchor on. Only used to decide that a
// roman numeral is a chapter reference and not stray prose; the token itself is
// preserved as written (the parser resolves e.g. "Phil" and "Cor" precisely).
const ROMAN_BOOK =
  '(?:Gen|Exod?|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kin(?:gs?)?|Chr(?:on)?|Ezra|Neh|Esth|' +
  'Esdr|Tob(?:it)?|J[dt]?th|Judith|Job|Ps(?:alms?)?|Prov|Eccl(?:es)?|Ecclus|Cant|Song|' +
  'Wisd?|Sir|Isa(?:i)?|Jer|Lam|Bar|Ezek|Dan|Hos|Joel|Amos|Obad|Jon(?:ah)?|Mic|Nah|Hab|' +
  'Zeph|Hag|Zech|Zach|Mal|Matt?h?|Mar[k]?|Luke?|Joh[n]?|Acts|Rom|Cor|Gal|Eph|Phil(?:ip)?p?|' +
  'Col|Thess?|Tim|Tit(?:us)?|Philem|Phlm|Heb|Jas|Jam(?:es)?|Pet|Jude|Rev|Apoc)'

// A book reference introduced by a roman-numeral chapter, with an optional
// arabic verse or verse-range. Captures: [1] leading book number, [2] the book
// token (incl. optional "St."), [3] the roman chapter, [5] the verse/range.
const ROMAN_REF = new RegExp(
  '\\b((?:[1-3]|III?|I)\\s+)?' +
    '((?:S(?:t)?\\.?\\s*)?' + ROMAN_BOOK + ')' +
    '\\.?\\s+' +
    '([ivxlcdm]+)\\b' +
    '(\\.?\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?))?',
  'gi'
)

const STRICT_ROMAN = /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

/** Convert a roman-numeral string to its integer value, or null if invalid. */
export function romanToArabic(input: string): number | null {
  const s = input.toLowerCase()
  if (!s || !STRICT_ROMAN.test(s)) return null
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALUES[s[i]]
    const next = ROMAN_VALUES[s[i + 1]]
    if (next && cur < next) {
      total += next - cur
      i++
    } else {
      total += cur
    }
  }
  return total
}

// "Apoc." → "Rev." when it introduces an arabic-numbered reference. (Roman-
// numbered "Apoc." is handled by the roman pass, which also rewrites the book.)
const APOC_REF = /\bApoc\.(?=\s*\d)/gi

interface Edit {
  start: number
  end: number
  replacement: string
}

/**
 * Apply a set of non-overlapping edits to `original`, building the new string
 * and an index mapper. Edits are sorted by position; any edit overlapping one
 * already accepted is dropped (earlier edits win).
 */
function applyEdits(original: string, edits: Edit[]): NormalizedText {
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  const accepted: Edit[] = []
  let lastEnd = -1
  for (const e of sorted) {
    if (e.start < lastEnd) continue // overlaps a previously accepted edit
    accepted.push(e)
    lastEnd = e.end
  }

  // Segments record how spans of the normalised string map back to the original.
  const segments: Array<{ normStart: number; normEnd: number; origStart: number; origEnd: number; edited: boolean }> = []
  let out = ''
  let cursor = 0
  for (const e of accepted) {
    if (e.start > cursor) {
      const normStart = out.length
      out += original.slice(cursor, e.start)
      segments.push({ normStart, normEnd: out.length, origStart: cursor, origEnd: e.start, edited: false })
    }
    const normStart = out.length
    out += e.replacement
    segments.push({ normStart, normEnd: out.length, origStart: e.start, origEnd: e.end, edited: true })
    cursor = e.end
  }
  if (cursor < original.length) {
    const normStart = out.length
    out += original.slice(cursor)
    segments.push({ normStart, normEnd: out.length, origStart: cursor, origEnd: original.length, edited: false })
  }

  const mapIndex = (index: number): number => {
    for (const seg of segments) {
      if (index < seg.normStart) continue
      if (index < seg.normEnd || (index === seg.normEnd && seg === segments[segments.length - 1])) {
        if (seg.edited) return seg.origStart
        return seg.origStart + (index - seg.normStart)
      }
    }
    return original.length
  }

  return { text: out, mapIndex }
}

export function normalizeScriptureText(original: string): NormalizedText {
  if (!original) return { text: original, mapIndex: (i) => i }

  const edits: Edit[] = []

  // Roman-numeral references (added first, so they win any overlap with Apoc).
  for (const m of original.matchAll(ROMAN_REF)) {
    const chapter = romanToArabic(m[3])
    if (chapter == null) continue

    // Single-letter romans are ambiguous with prose ("Ps. v"); only accept them
    // when an explicit verse follows ("Matt. v. 3"). Multi-letter romans (ii, xiv…)
    // are accepted on their own.
    const verse = m[5]
    if (m[3].length === 1 && !verse) continue

    const book = m[2].replace(/\bApoc\b/i, 'Rev')
    const lead = m[1] ?? ''
    const replacement = verse ? `${lead}${book} ${chapter}:${verse.replace(/\s*[-–]\s*/, '-')}` : `${lead}${book} ${chapter}`
    edits.push({ start: m.index, end: m.index + m[0].length, replacement })
  }

  // "Apoc." → "Rev." for arabic-numbered references.
  for (const m of original.matchAll(APOC_REF)) {
    edits.push({ start: m.index, end: m.index + m[0].length, replacement: 'Rev.' })
  }

  return applyEdits(original, edits)
}
