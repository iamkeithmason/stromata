// "Begin with": the editor's pick of one work to start an author with.
//
// One definition shared by the drafting script (generate-review-drafts.mjs
// --begin-with), the admin route that approves a pick, and the author page that
// shows it, so the three cannot disagree about what a valid pick is.
//
// A pick is { kind: 'text' | 'collection', slug, note }. It names a WORK as the
// author page lists works: a published collection, or a published text that is
// not part of one. The note is one line on why to start there.
//
// Backlog: "Strengthen author pages as the primary reading entry point", Phase B.

/** Authors with fewer published texts than this get no pick: there is nothing to choose between. */
export const BEGIN_WITH_MIN_TEXTS = 2
export const NOTE_MAX = 140

/**
 * The author's works as candidates, from rows already fetched.
 * texts: { slug, title, word_count, genre, summary, collection_id }
 * collections: { id, slug, title, description, published }
 */
export function candidatesFor(texts, collections) {
  const live = new Map(collections.filter((c) => c.published).map((c) => [c.id, c]))
  const byCollection = new Map()
  const out = []
  for (const t of texts) {
    const c = t.collection_id ? live.get(t.collection_id) : null
    if (c) {
      const list = byCollection.get(c.id) ?? []
      list.push(t)
      byCollection.set(c.id, list)
    } else {
      out.push({ kind: 'text', slug: t.slug, title: t.title, form: t.genre ?? null, words: t.word_count ?? 0, parts: 1, about: t.summary ?? '' })
    }
  }
  for (const [id, list] of byCollection) {
    const c = live.get(id)
    out.push({
      kind: 'collection',
      slug: c.slug,
      title: c.title,
      form: list[0]?.genre ?? null,
      words: list.reduce((n, t) => n + (t.word_count ?? 0), 0),
      parts: list.length,
      about: c.description ?? '',
    })
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

/** Problems with a pick, against the author's candidates; empty when it is usable. */
export function validatePick(pick, candidates) {
  const problems = []
  if (!pick || typeof pick !== 'object') return ['No pick.']
  if (pick.kind !== 'text' && pick.kind !== 'collection') problems.push('kind must be text or collection.')
  if (typeof pick.slug !== 'string' || !pick.slug) problems.push('slug is missing.')
  else if (!candidates.some((c) => c.kind === pick.kind && c.slug === pick.slug)) {
    problems.push(`"${pick.slug}" is not one of this author's published works.`)
  }
  const note = typeof pick.note === 'string' ? pick.note.trim() : ''
  if (!note) problems.push('note is missing.')
  else if (note.length > NOTE_MAX) problems.push(`note is ${note.length} characters; at most ${NOTE_MAX}.`)
  return problems
}

/** A clean copy of a pick (trimmed note, only the three keys). */
export function cleanPick(pick) {
  return { kind: pick.kind, slug: pick.slug, note: String(pick.note ?? '').trim().replace(/\s+/g, ' ') }
}

/** Same pick, ignoring whitespace in the note. */
export function samePick(a, b) {
  if (!a || !b) return !a && !b
  return a.kind === b.kind && a.slug === b.slug && cleanPick(a).note === cleanPick(b).note
}

export const BEGIN_WITH_PROMPT = `You are the editor of The Stromata, a reading-room library of public-domain Christian texts. A reader has arrived cold on one author's page. Choose the ONE work they should begin with, and write one line telling them why.

Choose for a first-time reader, not a scholar:
- Prefer the work that is most characteristic of the author AND most approachable: a famous, self-contained, readable work over a technical treatise or a fragment of a series.
- A long collection is fine if it is the obvious entry (Augustine's Confessions); say so plainly.
- Never choose a work only because it is short.

The line:
- At most ${NOTE_MAX} characters, one sentence, plain English, in the voice of a well-read librarian.
- Say what the reader will find, concretely (a voice, a scene, an argument), not that it is "important" or "a classic".
- No exclamation marks, no "must-read", no em dashes.

Reply with JSON only, no prose around it:
{"kind": "text" | "collection", "slug": "<slug exactly as listed>", "note": "<the line>"}`

/** The user message: the author and their works, one per line. */
export function promptFor(author, candidates) {
  const lines = candidates.map((c) => {
    const minutes = Math.max(1, Math.round(c.words / 200))
    const size = c.kind === 'collection' ? `${c.parts} parts, about ${Math.round(minutes / 60) || 1} h` : `about ${minutes} min`
    const about = c.about ? ` — ${c.about.replace(/\s+/g, ' ').slice(0, 300)}` : ''
    return `- [${c.kind}] ${c.slug} | ${c.title} | ${c.form ?? 'no genre'} | ${size}${about}`
  })
  return [`Author: ${author.name}${author.death_year ? ` (d. ${author.death_year})` : ''}`, '', 'Works:', ...lines].join('\n')
}

/** Parse the model's reply; null when it holds no JSON object. */
export function parseReply(text) {
  if (typeof text !== 'string') return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0])
    return { kind: obj.kind, slug: obj.slug, note: obj.note }
  } catch {
    return null
  }
}
