// An author's works, as an author page lists them.
//
// A WORK is a published collection (when a text has a collection_id whose
// collection is published) or a standalone text. A PART is a text inside a
// collection. The author page groups works by FORM (genre), so a reader arriving
// cold sees "Homilies · 3 works" rather than 207 undifferentiated rows.
//
// Everything here is pure and works on rows already fetched, so the page makes
// one texts query (plus one for collection metadata) and no N+1. Augustine, with
// 207 texts in 8 collections, is the stress case the tests pin.
//
// Backlog: "Strengthen author pages as the primary reading entry point", Phase A.
// The "Works-first listings & consistent count units" card can reuse this module.

import { readingMinutes } from './reading-time'

/** A published text as the author page selects it. */
export type WorkText = {
  id: string
  title: string
  slug: string
  word_count: number | null
  collection_id: string | null
  collection_order: number | null
  genre: string | null
  themes: string[]
  /** The text's accession number, shown on its cover. Optional for callers that draw no cover. */
  accession_number?: number | null
}

export type CollectionMeta = { id: string; title: string; slug: string; published: boolean }

export type Part = { id: string; title: string; slug: string; minutes: number; form: string | null; accession: number | null }

export type Work =
  | {
      kind: 'collection'
      id: string
      title: string
      slug: string
      form: string | null
      parts: Part[]
      minutes: number
      themes: string[]
      /** Lowest and highest accession numbers among the parts, for the cover band. */
      accessionRange: { min: number; max: number } | null
    }
  | {
      kind: 'text'
      id: string
      title: string
      slug: string
      form: string | null
      minutes: number
      themes: string[]
      accession: number | null
    }

export type FormGroup = { form: string | null; works: Work[] }

export type Totals = { works: number; parts: number; minutes: number }

export type ShortRead = { id: string; title: string; slug: string; minutes: number; form: string | null; accession: number | null }

/** Theme chips per row. */
export const MAX_ROW_THEMES = 3
/** Short reads appear only for an author with at least this many works. */
export const SHORT_READS_MIN_WORKS = 4
/** A short read is under this many minutes. */
export const SHORT_READ_UNDER_MINUTES = 30
export const MAX_SHORT_READS = 3

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Natural order: "Tractate 2" before "Tractate 10". */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

/** Parts in collection order; a part with no order follows, by natural title. */
function compareParts(a: WorkText, b: WorkText): number {
  const ao = a.collection_order
  const bo = b.collection_order
  if (ao != null && bo != null && ao !== bo) return ao - bo
  if (ao != null && bo == null) return -1
  if (ao == null && bo != null) return 1
  return naturalCompare(a.title, b.title)
}

/** The most frequent value, ties broken by first appearance. */
function mode(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  let best: string | null = null
  let bestCount = 0
  for (const v of values) {
    if (!v) continue
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestCount) { best = v; bestCount = n }
  }
  return best
}

/** The most frequent themes across texts, ties broken by first appearance. */
function topThemes(texts: WorkText[], limit = MAX_ROW_THEMES): string[] {
  const counts = new Map<string, number>()
  for (const t of texts) for (const th of t.themes) counts.set(th, (counts.get(th) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

/** Min and max of the numbers present; null when there are none. */
function range(values: (number | null)[]): { min: number; max: number } | null {
  const ns = values.filter((v): v is number => v != null)
  return ns.length > 0 ? { min: Math.min(...ns), max: Math.max(...ns) } : null
}

/**
 * Roll an author's texts up into works. A text whose collection is missing or
 * unpublished stands alone (the text page treats it the same way).
 */
export function buildWorks(texts: WorkText[], collections: CollectionMeta[]): Work[] {
  const meta = new Map(collections.filter(c => c.published).map(c => [c.id, c]))
  const byCollection = new Map<string, WorkText[]>()
  const works: Work[] = []

  for (const t of texts) {
    if (t.collection_id && meta.has(t.collection_id)) {
      const list = byCollection.get(t.collection_id) ?? []
      list.push(t)
      byCollection.set(t.collection_id, list)
    } else {
      works.push({
        kind: 'text',
        id: t.id,
        title: t.title,
        slug: t.slug,
        form: t.genre,
        minutes: readingMinutes(t.word_count),
        themes: t.themes.slice(0, MAX_ROW_THEMES),
        accession: t.accession_number ?? null,
      })
    }
  }

  for (const [id, list] of byCollection) {
    const c = meta.get(id)!
    const sorted = [...list].sort(compareParts)
    works.push({
      kind: 'collection',
      id,
      title: c.title,
      slug: c.slug,
      form: mode(sorted.map(t => t.genre)),
      parts: sorted.map(t => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        minutes: readingMinutes(t.word_count),
        form: t.genre,
        accession: t.accession_number ?? null,
      })),
      minutes: sorted.reduce((sum, t) => sum + readingMinutes(t.word_count), 0),
      themes: topThemes(sorted),
      accessionRange: range(sorted.map(t => t.accession_number ?? null)),
    })
  }

  return works.sort((a, b) => naturalCompare(a.title, b.title))
}

/**
 * Group works by form, most works first, then by form name. A work with no
 * genre goes in a trailing null group. Within a group, works keep natural title
 * order (texts carry no composition date yet, so chronology is not available).
 */
export function groupByForm(works: Work[]): FormGroup[] {
  const groups = new Map<string | null, Work[]>()
  for (const w of works) {
    const list = groups.get(w.form) ?? []
    list.push(w)
    groups.set(w.form, list)
  }
  return [...groups.entries()]
    .map(([form, ws]) => ({ form, works: ws }))
    .sort((a, b) => {
      if (a.form == null) return 1
      if (b.form == null) return -1
      return b.works.length - a.works.length || naturalCompare(a.form, b.form)
    })
}

export function totals(works: Work[]): Totals {
  let parts = 0
  let minutes = 0
  for (const w of works) {
    parts += w.kind === 'collection' ? w.parts.length : 1
    minutes += w.minutes
  }
  return { works: works.length, parts, minutes }
}

/**
 * Up to three short reads: standalone texts, or the first part of a collection,
 * under thirty minutes, shortest first. Only for an author with four or more
 * works; empty otherwise. A length fact, not an editorial judgement, so the
 * page labels it "Short reads", never "Start here". A zero estimate (no word
 * count) is not a short read.
 */
export function shortReads(works: Work[]): ShortRead[] {
  if (works.length < SHORT_READS_MIN_WORKS) return []
  const candidates: ShortRead[] = []
  for (const w of works) {
    const c = w.kind === 'collection' ? w.parts[0] : w
    if (!c) continue
    if (c.minutes > 0 && c.minutes < SHORT_READ_UNDER_MINUTES) {
      candidates.push({ id: c.id, title: c.title, slug: c.slug, minutes: c.minutes, form: c.form, accession: c.accession })
    }
  }
  return candidates
    .sort((a, b) => a.minutes - b.minutes || naturalCompare(a.title, b.title))
    .slice(0, MAX_SHORT_READS)
}

/** "about 9 hours", "about 45 minutes". Under an hour stays in minutes. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `about ${minutes} minutes`
  const hours = Math.round(minutes / 60)
  return `about ${hours} hour${hours === 1 ? '' : 's'}`
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "12 works · 207 parts · about 60 hours of reading"; parts dropped when equal to works. */
export function corpusLine(t: Totals): string {
  const bits = [plural(t.works, 'work', 'works')]
  if (t.parts !== t.works) bits.push(plural(t.parts, 'part', 'parts'))
  if (t.minutes > 0) bits.push(`${formatDuration(t.minutes)} of reading`)
  return bits.join(' · ')
}

const FORM_PLURALS: Record<string, string> = {
  Homily: 'Homilies',
  Sermon: 'Sermons',
  Letter: 'Letters',
  Treatise: 'Treatises',
  Essay: 'Essays',
  Meditation: 'Meditations',
  Rule: 'Rules',
  Prayer: 'Prayers',
  Catechesis: 'Catechetical works',
  Commentary: 'Commentaries',
  Dialogue: 'Dialogues',
  Hymn: 'Hymns',
  Poem: 'Poems',
  Confession: 'Confessions',
  Hagiography: 'Lives',
  Apology: 'Apologies',
  Exegesis: 'Exegetical works',
  Chronicle: 'Chronicles',
}

/**
 * Heading for a form group: "Homilies · 3 works". A one-work group is just
 * "Letters": "· 1 work" says what the single cover below already shows, and
 * the shorter heading stays on one line beside its neighbours.
 */
export function formHeading(form: string | null, count: number): string {
  const name = form ? (FORM_PLURALS[form] ?? form) : 'Other works'
  return count === 1 ? name : `${name} · ${plural(count, 'work', 'works')}`
}

/** "№ 12", or "№ 100–105" for a collection; null when nothing is numbered. */
export function accessionLabel(w: Work): string | null {
  if (w.kind === 'text') return w.accession != null ? `№ ${String(w.accession).padStart(2, '0')}` : null
  const r = w.accessionRange
  if (!r) return null
  return r.min === r.max ? `№ ${r.min}` : `№ ${r.min}–${r.max}`
}

/** Collapse a long parts list into columns on desktop beyond this many parts. */
export const COMPACT_PARTS_OVER = 30
