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

/** People in a read: who they are to the text, and whether the body names them or the reader knew them. */
export const PEOPLE_ROLES = ['author', 'subject', 'addressee', 'mentioned']
export const PEOPLE_BASES = ['stated', 'recognised']
export const WORK_RELATIONS = ['quoted', 'concerned']

/** Texts longer than this get a read per section as well as the whole-text read (the brief: ~10,000). */
export const SECTION_THRESHOLD_WORDS = 10000

/** JSON schema for the reply (structured outputs: every key required, nothing extra). */
export function readSchema(themes) {
  const strings = { type: 'array', items: { type: 'string' } }
  const themeList = { type: 'array', items: { type: 'string', enum: themes } }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['form', 'summary', 'argument', 'questions', 'moves', 'people', 'works', 'period', 'named',
      'scripture_cited', 'scripture_uncited', 'key_terms', 'quotable', 'flags', 'themes', 'theme_check'],
    properties: {
      form: { type: 'string' },
      summary: { type: 'string' },
      argument: { type: 'string' },
      people: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'role', 'basis'],
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: PEOPLE_ROLES },
            basis: { type: 'string', enum: PEOPLE_BASES },
          },
        },
      },
      works: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['title', 'relation'],
          properties: { title: { type: 'string' }, relation: { type: 'string', enum: WORK_RELATIONS } },
        },
      },
      period: { type: 'string' },
      themes: themeList,
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
- form: what kind of text this is, in a few words (e.g. "sermon on a Gospel text", "letter of counsel to a widow", "pastoral handbook, third of four parts").
- summary: one plain sentence, under 30 words, saying what the text is and does.
- argument: two sentences, plain English, on what the text argues or does. No praise, no "important".
- questions: one to three questions the text answers.
- moves: what the text does, from the allowed list only.
- people: the author and the people the text is about or addressed to, plus anyone else who matters to it. "role" is author, subject, addressee or mentioned. "basis" is "stated" when the body itself names the person, "recognised" when you identify them from your own knowledge (an unsigned letter you recognise, "the blessed Apostle" for Paul). At most 12.
- works: books or writings the text quotes ("quoted") or is about or answers ("concerned"), other than Scripture. Name them as the text does, or by their usual English title. An empty list is fine.
- period: when the text was written, as the body shows it or as you know it (e.g. "c. 590", "1520", "late 4th century"). Say "unknown" rather than guess.
- named: people and places the text names, as spelled in the text. At most 30, the most significant first.
- scripture_cited: verses the text gives a reference for (a printed citation such as "Isaiah 1:16", "Isa. i. 16" or a bracketed link). Write each as "Book chapter:verse", e.g. "Isa 1:16", "Matt 25:1-13".
- scripture_uncited: verses the text quotes or closely echoes WITHOUT printing a reference. "ref" is your identification ("Book chapter:verse"); "quote" is the exact words from the body, copied character for character, 4 to 25 words.
- key_terms: up to eight terms the text leans on.
- quotable: up to four short lines worth quoting, copied exactly from the body, each under 30 words.
- flags: things an editor should know. "provenance" when the text itself suggests the recorded author, date or title may be wrong or needs a note (a different signature, a narrator who is not the author, a missing part the text refers to). "text_quality" for OCR errors, typos, encoding residue or stray marks, quoting the bad characters exactly. Say nothing you cannot point to in the body. An empty list is fine.
- themes: one to three themes from the allowed list that say what the text IS, its centre, not everything it touches.
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

/**
 * True when the body prints this reference as written, e.g. "Psalm 77:34" for a read's "Ps 77:34".
 *
 * The parser validates verse numbers against modern (Hebrew) versification, so it rejects Vulgate
 * and Septuagint Psalm numbers that NPNF translations print ("Psalm 77:34" is Hebrew Ps 78:34, and
 * Ps 77 has only 20 verses). Without this, a reference the body really prints is dropped. For the
 * Psalms the chapter may also be off by one in either direction, since the read may have converted
 * between the two numberings. Exported for the re-check and tests.
 */
export function printedLiterally(body, ref) {
  const m = String(ref).trim().match(/^((?:[1-3]\s*)?[A-Za-z]+)\.?(?:\s+of\s+[A-Za-z]+)?\s+(\d+):(\d+)(?:\s*[-\u2013]\s*(\d+))?$/)
  if (!m) return false
  const book = m[1].replace(/\s+/g, ' ')
  const ch = Number(m[2])
  const v = Number(m[3])
  const vEnd = m[4] ? Number(m[4]) : v
  const isPsalm = /^ps/i.test(book)
  const chapters = isPsalm ? [ch, ch - 1, ch + 1] : [ch]
  const num = book.match(/^[1-3]/)?.[0] ?? ''
  const name = book.replace(/^[1-3]\s*/, '')
  const head = (n) => num + (num ? ' ' : '') + (n.length > 3 ? n.slice(0, 3) : n)
  // Older English Bibles name some books differently: Canticles, Apocalypse, Ecclesiasticus.
  const ALIASES = { son: ['Can'], can: ['Son'], rev: ['Apo'], apo: ['Rev'], sir: ['Ecclus'], ecc: [] }
  const stems = [head(name), ...(ALIASES[name.slice(0, 3).toLowerCase()] ?? []).map(head)]
  const esc = stems.map((st) => st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')).join('|')
  const re = new RegExp(`\\b(?:${esc})[A-Za-z]*\\.?(?:\\s+of\\s+[A-Za-z]+)?\\s+(${chapters.join('|')})[:.]\\s*(\\d+)(?:\\s*[-\u2013]\\s*(\\d+))?`, 'gi')
  for (const hit of String(body).matchAll(re)) {
    const a = Number(hit[2])
    const b = hit[3] ? Number(hit[3]) : a
    if (a <= vEnd && v <= b) return true
  }
  return false
}

/**
 * Kept because the body prints it, though it is not a verse in modern numbering: Vulgate or
 * Septuagint numbering ("Psalm 77:34", "3 Kings"), or a misprint in the source edition ("1 John 8:36"
 * for John 8:36 in City of God XIV). Worth an editor's look; never silently "corrected".
 */
const LITERAL_NOTE = 'printed in the text, but not a verse in modern numbering (Vulgate numbering or a misprint)'

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
 * The Scripture half of the check, shared by whole-text and section reads. A cited reference is kept
 * only when the body prints it (parser overlap, or printed literally under Vulgate numbering); an
 * uncited one only when its quoted words are in the body. Everything else goes to `drop`.
 */
function checkScripture(reply, { body, normBody, bodyRefs, parseRefs, drop }) {
  // With a reference: keep only what matches a reference printed in the body.
  const cited = []
  const seen = new Set()
  for (const item of Array.isArray(reply.scripture_cited) ? reply.scripture_cited : []) {
    const ref = typeof item === 'string' ? item : item?.ref
    if (typeof ref !== 'string' || !ref.trim()) continue
    const parsed = parseRefs(ref)
    const viaParser = parsed.length > 0 && parsed.every((p) => bodyRefs.some((b) => overlaps(p, b)))
    if (!viaParser && !printedLiterally(body, ref)) {
      drop('scripture_cited', ref, parsed.length ? 'no such reference is printed in the text' : 'not a reference the parser can read')
      continue
    }
    const key = viaParser ? parsed.map((p) => p.osis).join(';') : `literal:${ref.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    cited.push(viaParser ? { ref: ref.trim(), osis: key } : { ref: ref.trim(), osis: null, note: LITERAL_NOTE })
  }

  // Scripture without a reference: the quoted words must be printed in the body. If the reference
  // turns out to be printed after all, it belongs with the cited ones.
  const uncited = []
  for (const item of Array.isArray(reply.scripture_uncited) ? reply.scripture_uncited : []) {
    const ref = typeof item?.ref === 'string' ? item.ref.trim() : ''
    const quote = typeof item?.quote === 'string' ? item.quote.trim() : ''
    if (!ref) continue
    const parsed = parseRefs(ref)
    if (!quote || !appearsIn(normBody, quote)) { drop('scripture_uncited', `${ref}: "${quote}"`, 'the quoted words are not in the text'); continue }
    const key = parsed.length ? parsed.map((p) => p.osis).join(';') : `literal:${ref.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const printed = (parsed.length && parsed.every((p) => bodyRefs.some((b) => overlaps(p, b)))) || printedLiterally(body, ref)
    // A Vulgate-numbered verse the parser cannot read is kept (the quotation proves it is there), unresolved.
    if (printed) cited.push(parsed.length ? { ref, osis: key } : { ref, osis: null, note: LITERAL_NOTE })
    else uncited.push({ ref, osis: parsed.length ? key : null, quote })
  }

  return { cited, uncited }
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

  const { cited, uncited } = checkScripture(reply, { body, normBody, bodyRefs, parseRefs, drop })

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
      else drop(field === 'themes' ? 'themes' : `theme_check.${field}`, t, 'not in the theme vocabulary')
    }
    return out
  }
  const tc = reply.theme_check && typeof reply.theme_check === 'object' ? reply.theme_check : {}

  const flags = (Array.isArray(reply.flags) ? reply.flags : [])
    .filter((f) => f && typeof f.note === 'string' && f.note.trim())
    .map((f) => ({ kind: FLAG_KINDS.includes(f.kind) ? f.kind : 'other', note: f.note.trim() }))

  // A person the read says the body names must be in the body; if not, they were recognised, and
  // the read is corrected to say so rather than losing the person.
  const people = []
  for (const p of Array.isArray(reply.people) ? reply.people : []) {
    const name = typeof p?.name === 'string' ? p.name.trim() : ''
    if (!name) continue
    const role = PEOPLE_ROLES.includes(p.role) ? p.role : 'mentioned'
    let basis = PEOPLE_BASES.includes(p.basis) ? p.basis : 'recognised'
    if (basis === 'stated' && !nameIn(normBody, name)) {
      basis = 'recognised'
      drop('people', name, 'marked stated but not named in the text, so marked recognised')
    }
    people.push({ name, role, basis })
  }
  const works = (Array.isArray(reply.works) ? reply.works : [])
    .filter((w) => typeof w?.title === 'string' && w.title.trim())
    .map((w) => ({ title: w.title.trim(), relation: WORK_RELATIONS.includes(w.relation) ? w.relation : 'concerned' }))

  const moves = []
  for (const m of strList(reply.moves)) {
    if (MOVES.includes(m)) moves.push(m)
    else drop('moves', m, 'not in the moves vocabulary')
  }

  const str = (v) => (typeof v === 'string' ? v.trim() : '')
  const read = {
    form: str(reply.form),
    summary: str(reply.summary),
    argument,
    people: people.slice(0, 12),
    works: works.slice(0, 20),
    period: str(reply.period),
    questions: strList(reply.questions).slice(0, 3),
    moves,
    named: named.slice(0, 30),
    scripture_cited: cited,
    scripture_uncited: uncited,
    key_terms: strList(reply.key_terms).slice(0, 8),
    quotable: quotable.slice(0, 4),
    flags,
    themes: themeField(reply.themes, 'themes').slice(0, 3),
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

// ─── Section reads, for long texts ────────────────────────────────────────────────────────────────
//
// The trial showed a whole-text read of a 44,000-word text names three themes and misses ten or
// more, several of them the centre of a whole section. So a text over SECTION_THRESHOLD_WORDS also
// gets one Haiku call per section: a one-line summary, one to three themes from the 35, up to three
// free topics (which feed the theme-proposals list, never `themes`), and its Scripture, checked
// against that section's own words. The sections are rolled up to the text by words covered.
//
// Sections are cut here, not taken from `texts.sections`: that column is empty on every long text
// (28 Nov 2026), and these are reading units for the model, not the editor's contents list.

const wordsIn = (s) => (String(s).match(/\S+/g) ?? []).length

/**
 * Cut a body into sections of roughly `target` words: on its headings where it has them (merging
 * short chapters, splitting very long ones at paragraph breaks), else at paragraph breaks alone.
 * Returns [{ label, starts_with, body, words }] in order; joined, the bodies are the whole text.
 */
export function splitSections(body, { target = 5000, min = 1500, max = 8000 } = {}) {
  const lines = String(body).split('\n')
  const heads = []
  lines.forEach((l, i) => { if (/^#{1,4}\s+\S/.test(l)) heads.push(i) })

  // Raw pieces: one per heading (text before the first heading joins the first piece).
  let pieces = []
  if (heads.length >= 2) {
    const cuts = [0, ...heads.filter((h) => h > 0), lines.length]
    for (let i = 0; i < cuts.length - 1; i++) {
      const text = lines.slice(cuts[i], cuts[i + 1]).join('\n')
      const h = lines.slice(cuts[i], cuts[i + 1]).find((l) => /^#{1,4}\s+\S/.test(l))
      pieces.push({ heading: h ? h.replace(/^#+\s+/, '').trim() : null, text })
    }
  } else {
    pieces = [{ heading: null, text: String(body) }]
  }

  // Split any piece over `max` at paragraph breaks into ~target chunks.
  const split = []
  for (const p of pieces) {
    if (wordsIn(p.text) <= max) { split.push(p); continue }
    const paras = p.text.split(/\n\s*\n/)
    let buf = []
    let n = 0
    let part = 0
    const flush = () => {
      if (!buf.length) return
      part++
      split.push({ heading: p.heading ? `${p.heading} (${part})` : null, text: buf.join('\n\n') })
      buf = []
      n = 0
    }
    for (const para of paras) {
      buf.push(para)
      n += wordsIn(para)
      if (n >= target) flush()
    }
    flush()
  }

  // Merge neighbouring chapters while they fit in `target`, and fold any piece under `min` into the
  // one before it, never past `max`. So chapters group into ~target-word sections.
  const merged = []
  for (const p of split) {
    const last = merged[merged.length - 1]
    const pw = wordsIn(p.text)
    if (last && (last.words + pw <= target || pw < min || last.words < min) && last.words + pw <= max) {
      last.text += '\n\n' + p.text
      last.words += wordsIn(p.text)
      if (p.heading) last.headings.push(p.heading)
    } else {
      merged.push({ text: p.text, words: wordsIn(p.text), headings: p.heading ? [p.heading] : [] })
    }
  }

  return merged.map((m, i) => {
    const firstProse = m.text.split('\n').find((l) => l.trim() && !/^#{1,4}\s/.test(l)) ?? ''
    const label = m.headings.length === 0 ? `Part ${i + 1}`
      : m.headings.length === 1 ? m.headings[0]
      : `${m.headings[0]} to ${m.headings[m.headings.length - 1]}`
    return {
      label,
      starts_with: (firstProse.match(/\S+/g) ?? []).slice(0, 10).join(' '),
      body: m.text,
      words: m.words,
    }
  })
}

/** JSON schema for one section's reply. */
export function sectionSchema(themes) {
  const base = readSchema(themes).properties
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'themes', 'topics', 'scripture_cited', 'scripture_uncited'],
    properties: {
      summary: { type: 'string' },
      themes: { type: 'array', items: { type: 'string', enum: themes } },
      topics: { type: 'array', items: { type: 'string' } },
      scripture_cited: base.scripture_cited,
      scripture_uncited: base.scripture_uncited,
    },
  }
}

export function sectionSystemPrompt(themes) {
  return `You are reading one section of a longer text from The Stromata, a library of public-domain Christian writing. You see the section's words and the text's catalogue record. Nothing else.

Report only what is in this section.

Fields:
- summary: one plain sentence, under 30 words, on what this section says or does.
- themes: one to three themes from the allowed list that are the centre of THIS section. Fewer is better than a loose fit.
- topics: up to three main subjects of this section that the allowed themes cannot express, a word or two each (e.g. "Christian liberty", "fortune", "the education of children"). An empty list is fine.
- scripture_cited: verses this section gives a printed reference for, as "Book chapter:verse", e.g. "Isa 1:16". Keep the numbering the text prints (older translations number the Psalms differently; do not convert).
- scripture_uncited: verses the section quotes WITHOUT printing a reference. "ref" is your identification; "quote" is the exact words from the section, 4 to 25 words.

Allowed themes: ${themes.join(', ')}.

Reply with the JSON object only.`
}

/** The user message for one section. */
export function sectionPromptFor(text, section, index, count) {
  return [
    `Title: ${text.title}`,
    `Recorded author: ${text.author ?? 'not recorded'}`,
    `Section ${index + 1} of ${count}: ${section.label}`,
    '',
    '--- SECTION ---',
    section.body,
    '--- END OF SECTION ---',
  ].join('\n')
}

/**
 * Check one section's reply against that section's own words. Returns { section, dropped, problems }
 * in the same shape as checkRead; `section` carries label, starts_with and words from the split.
 */
export function checkSection(reply, { section, bodyRefs, parseRefs, themes }) {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return { section: null, dropped: [], problems: ['Reply is not a JSON object.'] }
  const dropped = []
  const drop = (field, value, reason) => dropped.push({ field, value, reason, section: section.label })
  const normBody = normalise(section.body)
  const themeSet = new Set(themes)
  const sectionThemes = []
  for (const t of strList(reply.themes)) {
    if (themeSet.has(t)) sectionThemes.push(t)
    else drop('themes', t, 'not in the theme vocabulary')
  }
  const { cited, uncited } = checkScripture(reply, { body: section.body, normBody, bodyRefs, parseRefs, drop })
  return {
    section: {
      label: section.label,
      starts_with: section.starts_with,
      words: section.words,
      summary: typeof reply.summary === 'string' ? reply.summary.trim() : '',
      themes: [...new Set(sectionThemes)].slice(0, 3),
      topics: strList(reply.topics).slice(0, 3),
      scripture_cited: cited,
      scripture_uncited: uncited,
    },
    dropped,
    problems: [],
  }
}

/**
 * Roll section themes up to the text: each theme scores the words of the sections it tags. Returns
 * [{ theme, sections, words, share }] by words, so the text's themes are the ones that cover most of it.
 */
export function rollUpThemes(sections) {
  const total = sections.reduce((n, s) => n + (s.words ?? 0), 0) || 1
  const by = new Map()
  for (const s of sections) {
    for (const t of s.themes ?? []) {
      const e = by.get(t) ?? { theme: t, sections: 0, words: 0 }
      e.sections++
      e.words += s.words ?? 0
      by.set(t, e)
    }
  }
  return [...by.values()]
    .map((e) => ({ ...e, share: Math.round((e.words / total) * 100) / 100 }))
    .sort((a, b) => b.words - a.words || b.sections - a.sections)
}
