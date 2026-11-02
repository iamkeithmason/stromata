/**
 * concept-pilot.mjs — pure helpers for the concept-extraction pilot
 * (scripts/concept-pilot.mjs). No network, no filesystem: everything here is
 * unit-tested in concept-pilot.test.mjs.
 *
 * Four jobs: pick a deliberately diverse sample, cut a body into stable
 * sections, check a proposed concept's evidence really is in the passage,
 * and measure recurrence / duplicates / overlap with the curated Themes so an
 * editor can judge whether the extraction adds anything.
 */

/** Deterministic hash → 0..1, so "random" tie-breaks are repeatable. */
function jitter(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

/**
 * Greedy diversity pick. Each candidate is scored by how many of its
 * dimensions (era, tradition, genre, author) are not yet represented in the
 * picks; ties break on a stable hash of the slug. One text per author.
 * Rows need: slug, word_count, author, era, tradition, genre.
 */
export function selectSample(rows, { n = 20, minWords = 1500, maxWords = 12000 } = {}) {
  const pool = rows.filter(r => r.word_count >= minWords && r.word_count <= maxWords && r.author)
  const picked = []
  const seen = { era: new Set(), tradition: new Set(), genre: new Set(), author: new Set() }
  while (picked.length < n && pool.length) {
    let best = -1, bestScore = -1
    pool.forEach((r, i) => {
      if (seen.author.has(r.author)) return
      let score = 0
      for (const k of ['era', 'tradition', 'genre']) if (r[k] && !seen[k].has(r[k])) score += 1
      score += jitter(r.slug) * 0.5
      if (score > bestScore) { bestScore = score; best = i }
    })
    if (best < 0) break
    const [r] = pool.splice(best, 1)
    picked.push(r)
    for (const k of ['era', 'tradition', 'genre', 'author']) if (r[k]) seen[k].add(r[k])
  }
  return picked
}

const wc = s => (s.match(/\S+/g) || []).length

/**
 * Cut a markdown body into sections of roughly `target` words. Splits at
 * headings first (stable: the same body always yields the same ids), merges
 * runs of tiny sections, and splits oversized ones at paragraph boundaries.
 * Section ids are `s01`, `s02`, … in reading order.
 */
export function chunkSections(body, { target = 1500, min = 600 } = {}) {
  const parts = body.split(/\n(?=#{1,3}\s)/).map(p => p.trim()).filter(Boolean)
  const units = []
  for (const part of parts) {
    if (wc(part) <= target * 1.5) { units.push(part); continue }
    let cur = ''
    for (const para of part.split(/\n{2,}/)) {
      if (cur && wc(cur) + wc(para) > target) { units.push(cur); cur = '' }
      cur += (cur ? '\n\n' : '') + para
    }
    if (cur) units.push(cur)
  }
  const merged = []
  for (const u of units) {
    const last = merged[merged.length - 1]
    if (last !== undefined && wc(last) < min) merged[merged.length - 1] = `${last}\n\n${u}`
    else merged.push(u)
  }
  if (merged.length > 1 && wc(merged[merged.length - 1]) < min) {
    const tail = merged.pop()
    merged[merged.length - 1] += `\n\n${tail}`
  }
  return merged.map((text, i) => ({ id: `s${String(i + 1).padStart(2, '0')}`, text, words: wc(text) }))
}

const squash = s => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** True when the quoted evidence occurs in the passage (case/punctuation-insensitive). */
export function evidenceInPassage(quote, passage) {
  const q = squash(quote || '')
  return q.split(' ').length >= 6 && squash(passage).includes(q)
}

/** Lower-cased, singularised-ish label key for grouping. */
export function labelKey(label) {
  return squash(label.replace(/['\u2019]s\b/gi, '')).split(' ').map(w => (w.length > 4 ? w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w)).join(' ')
}

function tokens(label) {
  return new Set(labelKey(label).split(' ').filter(w => w.length > 2))
}
function jaccard(a, b) {
  let i = 0
  for (const x of a) if (b.has(x)) i++
  const u = a.size + b.size - i
  return u ? i / u : 0
}

/**
 * Validate the model's JSON for one section. Keeps only concepts with a
 * label, a gloss and evidence that is verifiably in the passage; counts what
 * it drops so hallucinated quotes show up as a rate rather than vanishing.
 */
export function normaliseConcepts(raw, passage) {
  const list = Array.isArray(raw?.concepts) ? raw.concepts : []
  const kept = [], dropped = []
  for (const c of list) {
    const label = String(c?.label ?? '').trim()
    const gloss = String(c?.gloss ?? '').trim()
    const evidence = String(c?.evidence ?? '').trim()
    if (!label || !gloss) { dropped.push({ label, reason: 'incomplete' }); continue }
    if (!evidenceInPassage(evidence, passage)) { dropped.push({ label, reason: 'evidence-not-in-passage' }); continue }
    kept.push({ label, gloss, evidence })
  }
  return { kept, dropped }
}

/**
 * Roll per-section concepts up into the numbers an editor judges by.
 * `extractions`: [{ slug, sections: [{ id, concepts: [{label,gloss,evidence}] }] }]
 * `themes`: curated theme slugs (e.g. 'spiritual-warfare').
 * `groupOf(label)`: optional; maps a label to the idea-group it belongs to, so recurrence is
 * counted on meaning rather than on word-for-word labels (see `groupOfFrom`).
 */
export function analyse(extractions, themes = [], { dupThreshold = 0.6, groupOf = null } = {}) {
  const byKey = new Map()
  for (const t of extractions) {
    for (const s of t.sections) {
      for (const c of s.concepts) {
        const k = groupOf ? groupOf(c.label) : labelKey(c.label)
        if (!byKey.has(k)) byKey.set(k, { key: k, labels: new Set(), texts: new Set(), sections: 0 })
        const e = byKey.get(k)
        e.labels.add(c.label); e.texts.add(t.slug); e.sections += 1
      }
    }
  }
  const concepts = [...byKey.values()].map(e => ({
    key: e.key, labels: [...e.labels], texts: [...e.texts], textCount: e.texts.size, sections: e.sections,
  })).sort((a, b) => b.textCount - a.textCount || b.sections - a.sections || a.key.localeCompare(b.key))

  const themeTokens = themes.map(s => ({ slug: s, tok: [...tokens(s.replace(/-/g, ' '))] }))
  for (const c of concepts) {
    const tok = tokens(c.key)
    const hit = themeTokens.find(t => t.tok.length && t.tok.every(w => tok.has(w)))
    c.themeOverlap = hit ? hit.slug : null
  }

  // Near-duplicate pairs among distinct keys (the "same idea, two names" noise).
  const duplicates = []
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = tokens(concepts[i].key), b = tokens(concepts[j].key)
      const sim = jaccard(a, b)
      if (sim >= dupThreshold) duplicates.push({ a: concepts[i].key, b: concepts[j].key, sim: +sim.toFixed(2) })
    }
  }

  const total = concepts.length
  return {
    totalConcepts: total,
    recurring: concepts.filter(c => c.textCount >= 2).length,
    recurringNovel: concepts.filter(c => c.textCount >= 2 && !c.themeOverlap).length,
    largestGroup: concepts.reduce((m, c) => Math.max(m, c.labels.length), 0),
    singleton: concepts.filter(c => c.textCount === 1).length,
    themeOverlap: concepts.filter(c => c.themeOverlap).length,
    novel: concepts.filter(c => !c.themeOverlap).length,
    duplicatePairs: duplicates.length,
    concepts, duplicates,
  }
}

/**
 * The distinct concepts, one row per labelKey, in a stable order. The `id` is the position in this
 * list, which is what a grouping file refers to, so the list must be regenerated from the same
 * extractions (the CLI writes it to labels.json and `group` reads that file back).
 */
export function uniqueLabels(extractions) {
  const byKey = new Map()
  for (const t of extractions) for (const s of t.sections) for (const c of s.concepts) {
    const k = labelKey(c.label)
    if (!byKey.has(k)) byKey.set(k, { key: k, label: c.label, gloss: c.gloss, texts: new Set() })
    byKey.get(k).texts.add(t.slug)
  }
  return [...byKey.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e, id) => ({ id, key: e.key, label: e.label, gloss: e.gloss, texts: [...e.texts] }))
}

/**
 * Check a grouping someone (or some model) proposed: { groups: [{ name, ids: [..] }] } against the
 * label list. Throws listing every problem, because a half-applied grouping would quietly skew the
 * recurrence numbers. Returns { groups: [{ name, keys }] }, keyed by labelKey so it survives a re-export.
 */
export function resolveGroups(raw, labels) {
  const problems = []
  const list = Array.isArray(raw?.groups) ? raw.groups : null
  if (!list) throw new Error('grouping file must look like {"groups":[{"name":"…","ids":[0,1]}]}')
  const owner = new Map(), groups = []
  list.forEach((g, i) => {
    const name = String(g?.name ?? '').trim().toLowerCase()
    const ids = Array.isArray(g?.ids) ? g.ids : []
    if (!name) problems.push(`group #${i} has no name`)
    if (!ids.length) problems.push(`group "${name || i}" has no ids`)
    const keys = []
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 0 || id >= labels.length) { problems.push(`group "${name}": id ${JSON.stringify(id)} is not a label`); continue }
      if (owner.has(id)) { problems.push(`id ${id} (${labels[id].label}) is in both "${owner.get(id)}" and "${name}"`); continue }
      owner.set(id, name)
      keys.push(labels[id].key)
    }
    if (name && keys.length) groups.push({ name, keys })
  })
  if (new Set(groups.map(g => g.name)).size !== groups.length) problems.push('two groups share a name')
  if (problems.length) throw new Error(`grouping rejected:\n  ${problems.slice(0, 20).join('\n  ')}${problems.length > 20 ? `\n  …and ${problems.length - 20} more` : ''}`)
  return { groups }
}

/** label → group name for `analyse`. A label in no group stays its own idea (its labelKey). */
export function groupOfFrom(resolved) {
  const m = new Map()
  for (const g of resolved?.groups ?? []) for (const k of g.keys) m.set(k, g.name)
  return label => m.get(labelKey(label)) ?? labelKey(label)
}
