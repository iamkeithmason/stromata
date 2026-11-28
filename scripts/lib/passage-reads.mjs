// Passage reads: a factual read of one text, made from its body alone.
//
// One definition shared by the drafting script (scripts/generate-passage-reads.ts) and its tests,
// so the prompt, the reply shape and the checks that run on every reply cannot drift apart.
//
// The trial (Notion, Field Notes, "Passage-read trial: ten Stromata texts", 28 Nov 2026) settled
// three rules, all from Keith:
//   1. Haiku, ONE text per call. Batching five texts into one call put Prov 10:24 from the
//      Martyrdom of Ignatius into Augustine's Tractate 117.
//   2. The body only. The read never sees the editorial introduction, note draft or summary, so it
//      is an independent reading, not an echo of the editor.
//   3. Any Scripture reference that is not printed in the text is dropped automatically.
//
// checkRead() is where rule 3 lives, together with the same test applied to everything else a read
// claims is IN the text (quotations, names): a claim the body cannot back is removed and logged in
// `dropped`, never silently kept. It is pure: the caller passes the body's parsed references in, so
// this file needs no TypeScript and tests can feed it fixtures.

/** The model, fixed here so the script, the cost line and the stored row agree. */
export const PASSAGE_READ_MODEL = 'claude-haiku-5-5'

/** List prices per million tokens (prompts up to 100K tokens; the longest text is about 95K). */
export const PASSAGE_READ_PRICES = { input: 0.1, output: 0.5 }

/** The rhetorical moves a read may name. A fixed list so moves can be counted across the library. */
export const MOVES = [
  'exhortation', 'catechesis', 'exegesis', 'harmonisation', 'typology', 'polemic', 'consolation',
  'counsel', 'creed', 'hymn', 'prayer', 'narrative', 'trial dialogue', 'survey', 'programme',
  'enumeration', 'apologetic', 'lament', 'antithesis', 'analogy', 'commemoration', 'testament',
]

export const FLAG_KINDS = ['provenance', 'text_quality', 'other']

/** JSON schema for the reply (structured outputs: every key required, nothing extra). */
export function readSchema(themes) {
  const strings = { type: 'array', items: { type: 'string' } }
  const themeList = { type: 'array', items: { type: 'string', enum: themes } }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['argument', 'questions', 'moves', 'named', 'scripture_cited', 'scripture_uncited',
      'key_terms', 'quotable', 'flags', 'theme_check'],
    properties: {
      argument: { type: 'string' },
      questions: strings,
      moves: { type: 'array', items: { type: 'string', enum: MOVES } },
      named: strings,
      scripture_cited: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['ref'], properties: { ref: { type: 'string' } } },
      },
      scripture_uncited: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['ref', 'quote'],
          properties: { ref: { type: 'string' }, quote: { type: 'string' } },
        },
      },
      key_terms: strings,
      quotable: strings,
      flags: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['kind', 'note'],
          properties: { kind: { type: 'string', enum: FLAG_KINDS }, note: { type: 'string' } },
        },
      },
      theme_check: {
        type: 'object', additionalProperties: false, required: ['fits', 'weak', 'suggested', 'gaps'],
        properties: { fits: themeList, weak: themeList, suggested: themeList, gaps: strings },
      },
    },
  }
}

export function systemPrompt(themes) {
  return `You are reading one text from The Stromata, a library of public-domain Christian writing. Make a factual read of it: what it argues, what it does, and what it contains. You see the text's body and its catalogue record (title, recorded author, genre, current themes). Nothing else.

Report only what is in this text. Every name, quotation and reference you give must be found in the body you are given.

Fields:
- argument: two sentences, plain English, on what the text argues or does. No praise, no "important".
- questions: one to three questions the text answers.
- moves: what the text does, from the allowed list only.
- named: people and places the text names, as spelled in the text. At most 30, the most significant first.
- scripture_cited: verses the text gives a reference for (a printed citation such as "Isaiah 1:16", "Isa. i. 16" or a bracketed link). Write each as "Book chapter:verse", e.g. "Isa 1:16", "Matt 25:1-13".
- scripture_uncited: verses the text quotes or closely echoes WITHOUT printing a reference. "ref" is your identification ("Book chapter:verse"); "quote" is the exact words from the body, copied character for character, 4 to 25 words.
- key_terms: up to eight terms the text leans on.
- quotable: up to four short lines worth quoting, copied exactly from the body, each under 30 words.
- flags: things an editor should know. "provenance" when the text itself suggests the recorded author, date or title may be wrong or needs a note (a different signature, a narrator who is not the author, a missing part the text refers to). "text_quality" for OCR errors, typos, encoding residue or stray marks, quoting the bad characters exactly. Say nothing you cannot point to in the body. An empty list is fine.
- theme_check: judge the current themes against the text. "fits" and "weak" sort the current themes. "suggested" adds themes from the allowed list that fit better. "gaps" names a main subject the allowed themes cannot express (e.g. "education"), in a word or two each.

Allowed themes: ${themes.join(', ')}.
Allowed moves: ${MOVES.join(', ')}.

Reply with the JSON object only.`
}

/** The user message: the catalogue record, then the body. */
export function promptFor(text) {
  return [
    `Title: ${text.title}`,
    `Recorded author: ${text.author ?? 'not recorded'}`,
    `Genre: ${text.genre ?? 'not recorded'}`,
    `Current themes: ${text.themes?.length ? text.themes.join(', ') : 'none'}`,
    '',
    '--- BODY ---',
    text.body,
    '--- END OF BODY ---',
  ].join('\n')
}

/** Parse a reply that should hold one JSON object; null when it does not. */
export function parseReply(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

/** Lower-case, unify quotes, drop markdown emphasis and punctuation, collapse spaces. */
export function normalise(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/\[(\d+|[a-z])\]/g, ' ') // footnote markers
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the words of `phrase` appear, in order and together, in the normalised body. */
export function appearsIn(normBody, phrase) {
  const p = normalise(phrase)
  return p.length > 0 && ` ${normBody} `.includes(` ${p} `)
}

/** A name is in the body if the whole name is, or failing that every word of 3+ letters is. */
function nameIn(normBody, name) {
  if (appearsIn(normBody, name)) return true
  const words = normalise(name).split(' ').filter((w) => w.length >= 3 && !['the', 'and', 'of'].includes(w))
  return words.length > 0 && words.every((w) => ` ${normBody} `.includes(` ${w} `))
}

/** Two parsed refs point at overlapping verses of the same chapter. */
function overlaps(a, b) {
  if (a.book !== b.book || a.chapter !== b.chapter) return false
  if (a.verse == null || b.verse == null) return true // a whole chapter covers any verse in it
  const aEnd = a.verseEnd ?? a.verse
  const bEnd = b.verseEnd ?? b.verse
  return a.verse <= bEnd && b.verse <= aEnd
}

function strList(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
}

/**
 * Check a read against the body it was made from.
 *
 * body:       the text's markdown body
 * bodyRefs:   parseReferences(body), the references actually printed in it
 * parseRefs:  the same parser, to read the model's own "Book c:v" strings
 * themes:     the allowed theme slugs
 *
 * Returns { read, dropped, problems }. `problems` is non-empty only when the reply is unusable
 * (not an object, no argument); a usable reply is cleaned, never refused, and each removal is
 * recorded in `dropped` as { field, value, reason }.
 */
export function checkRead(reply, { body, bodyRefs, parseRefs, themes }) {
  const problems = []
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { read: null, dropped: [], problems: ['Reply is not a JSON object.'] }
  const argument = typeof reply.argument === 'string' ? reply.argument.trim() : ''
  if (!argument) problems.push('argument is missing.')

  const normBody = normalise(body)
  const dropped = []
  const drop = (field, value, reason) => dropped.push({ field, value, reason })
  const themeSet = new Set(themes)

  // Scripture with a reference: keep only what matches a reference printed in the body.
  const cited = []
  const seen = new Set()
  for (const item of Array.isArray(reply.scripture_cited) ? reply.scripture_cited : []) {
    const ref = typeof item === 'string' ? item : item?.ref
    if (typeof ref !== 'string' || !ref.trim()) continue
    const parsed = parseRefs(ref)
    if (!parsed.length) { drop('scripture_cited', ref, 'not a reference the parser can read'); continue }
    if (!parsed.every((p) => bodyRefs.some((b) => overlaps(p, b)))) { drop('scripture_cited', ref, 'no such reference is printed in the text'); continue }
    const key = parsed.map((p) => p.osis).join(';')
    if (seen.has(key)) continue
    seen.add(key)
    cited.push({ ref: ref.trim(), osis: key })
  }

  // Scripture without a reference: the quoted words must be printed in the body. If the reference
  // turns out to be printed after all, it belongs with the cited ones.
  const uncited = []
  for (const item of Array.isArray(reply.scripture_uncited) ? reply.scripture_uncited : []) {
    const ref = typeof item?.ref === 'string' ? item.ref.trim() : ''
    const quote = typeof item?.quote === 'string' ? item.quote.trim() : ''
    if (!ref) continue
    const parsed = parseRefs(ref)
    if (!parsed.length) { drop('scripture_uncited', ref, 'not a reference the parser can read'); continue }
    if (!quote || !appearsIn(normBody, quote)) { drop('scripture_uncited', `${ref}: "${quote}"`, 'the quoted words are not in the text'); continue }
    const key = parsed.map((p) => p.osis).join(';')
    if (seen.has(key)) continue
    seen.add(key)
    if (parsed.every((p) => bodyRefs.some((b) => overlaps(p, b)))) cited.push({ ref, osis: key })
    else uncited.push({ ref, osis: key, quote })
  }

  const quotable = []
  for (const q of strList(reply.quotable)) {
    if (appearsIn(normBody, q)) quotable.push(q)
    else drop('quotable', q, 'not found word for word in the text')
  }

  const named = []
  for (const n of strList(reply.named)) {
    if (nameIn(normBody, n)) named.push(n)
    else drop('named', n, 'name not found in the text')
  }

  const themeField = (v, field) => {
    const out = []
    for (const t of strList(v)) {
      if (themeSet.has(t)) out.push(t)
      else drop(`theme_check.${field}`, t, 'not in the theme vocabulary')
    }
    return out
  }
  const tc = reply.theme_check && typeof reply.theme_check === 'object' ? reply.theme_check : {}

  const flags = (Array.isArray(reply.flags) ? reply.flags : [])
    .filter((f) => f && typeof f.note === 'string' && f.note.trim())
    .map((f) => ({ kind: FLAG_KINDS.includes(f.kind) ? f.kind : 'other', note: f.note.trim() }))

  const moves = []
  for (const m of strList(reply.moves)) {
    if (MOVES.includes(m)) moves.push(m)
    else drop('moves', m, 'not in the moves vocabulary')
  }

  const read = {
    argument,
    questions: strList(reply.questions).slice(0, 3),
    moves,
    named: named.slice(0, 30),
    scripture_cited: cited,
    scripture_uncited: uncited,
    key_terms: strList(reply.key_terms).slice(0, 8),
    quotable: quotable.slice(0, 4),
    flags,
    theme_check: {
      fits: themeField(tc.fits, 'fits'),
      weak: themeField(tc.weak, 'weak'),
      suggested: themeField(tc.suggested, 'suggested'),
      gaps: strList(tc.gaps),
    },
  }
  return { read, dropped, problems }
}

/** Cost in US dollars from token counts. */
export function costOf(inputTokens, outputTokens, prices = PASSAGE_READ_PRICES) {
  return (inputTokens * prices.input + outputTokens * prices.output) / 1e6
}
