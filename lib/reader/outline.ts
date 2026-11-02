/**
 * outline.ts — the pure logic behind mid-text navigation on the reader page.
 *
 * On a phone, every way off a long text used to sit on screen 1 or after the
 * last line, and readers stalled in between (the Vainglory page: 115 visitors,
 * no second text). ReaderNav keeps a way on in reach: past the frontispiece the
 * site header hides on scroll-down, a reading header returns on scroll-up, a
 * slim pill stays while it is away, and either opens a sheet with the contents,
 * the collection and Read next. Decisions are Keith's, 29 Oct 2026 (backlog card
 * "Mid-text navigation on phones"; prototype PR #170).
 *
 * Everything that decides WHAT to show lives here, as functions over plain
 * data, so it is unit tested; the component only measures scroll and renders.
 */

import type { Heading } from '@/lib/headings'

/** Where a contents entry points: a heading's id, or an editor's section's opening words. */
export type OutlineTarget = { type: 'id'; id: string } | { type: 'anchor'; startsWith: string }

export type OutlineEntry = { label: string; target: OutlineTarget }

export type Outline = {
  /** 'headings' = the author's own; 'sections' = the editor's (not part of the original text); 'none'. */
  kind: 'headings' | 'sections' | 'none'
  entries: OutlineEntry[]
}

export type SectionsDoc = { source: 'editorial'; sections: { label: string; starts_with: string }[] } | null

/** The reader page shows a contents list from this many headings (its `hasToc`). */
export const MIN_CONTENTS_HEADINGS = 3

/**
 * The text's outline. Its own headings win when there are enough for a
 * contents list; otherwise approved editor's sections, if any; otherwise none.
 */
export function buildOutline(headings: Heading[], sections: SectionsDoc): Outline {
  if (headings.length >= MIN_CONTENTS_HEADINGS) {
    return {
      kind: 'headings',
      entries: headings.map(h => ({ label: unnumbered(h.text), target: { type: 'id', id: h.id } })),
    }
  }
  const list = sections?.source === 'editorial' ? sections.sections : []
  if (list.length >= 2) {
    return {
      kind: 'sections',
      entries: list.map(s => ({ label: s.label, target: { type: 'anchor', startsWith: s.starts_with } })),
    }
  }
  return { kind: 'none', entries: [] }
}

/**
 * "Chapter 14. Curiosity Ought Not Range…" → "Curiosity Ought Not Range…".
 * The position line already gives the number; repeating it costs the label
 * a third of its width on a phone. A heading that IS only a number keeps it.
 */
export function unnumbered(label: string): string {
  const stripped = label.replace(/^(chapter|book|part|section)\s+[\divxlc]+\.?\s*/i, '').trim()
  return stripped || label
}

export type CollectionPosition = {
  title: string
  slug: string
  part: number
  total: number
  prev: { slug: string; title: string } | null
  next: { slug: string; title: string } | null
}

/**
 * The short position shown in the pill and the reading header. Numerals:
 * "§ 2 of 8" marks an editor's section, "2 of 44" a heading of the text's own;
 * a text without either falls back to its place in a collection.
 */
export function positionLabel(kind: Outline['kind'], current: number, count: number, collection: CollectionPosition | null): string | null {
  if (kind === 'sections' && current >= 0) return `§ ${current + 1} of ${count}`
  if (kind === 'headings' && current >= 0) return `${current + 1} of ${count}`
  if (collection) return `Part ${collection.part} of ${collection.total}`
  return null
}

/**
 * What the reading header offers, named after what leads the sheet:
 * "Contents" when there is a contents list; else "Next part" in a collection
 * with a next part; else "Read next" (Keith, 29 Oct 2026; never "Way on").
 */
export function navLabel(outline: Outline, collection: CollectionPosition | null): string {
  if (outline.entries.length > 1) return 'Contents'
  if (collection?.next) return 'Next part'
  return 'Read next'
}

export type ContentsRow = { kind: 'entry'; index: number } | { kind: 'fold'; from: number; to: number }

/** Contents longer than this are windowed. */
export const WINDOW_OVER = 9

/**
 * A long contents list on a phone: the first entry, a fold, the current entry
 * ±2, a fold. Short lists, or an expanded one, show every entry.
 */
export function contentsRows(count: number, current: number, expanded: boolean): ContentsRow[] {
  const rows: ContentsRow[] = []
  if (count <= WINDOW_OVER || expanded) {
    for (let i = 0; i < count; i++) rows.push({ kind: 'entry', index: i })
    return rows
  }
  const c = Math.max(current, 0)
  const lo = Math.max(1, c - 2)
  const hi = Math.min(count - 1, Math.max(c + 2, lo + 2))
  rows.push({ kind: 'entry', index: 0 })
  if (lo > 1) rows.push({ kind: 'fold', from: 1, to: lo - 1 })
  for (let i = lo; i <= hi; i++) rows.push({ kind: 'entry', index: i })
  if (hi < count - 1) rows.push({ kind: 'fold', from: hi + 1, to: count - 1 })
  return rows
}

export type ReadNextLink = { slug: string; title: string; kind: string }

export type Lead = { kicker: 'next-part' | 'read-next' | 'or'; slug: string; title: string; pick: string }

/**
 * The sheet's ways on, in order. In a collection the next part always leads,
 * above even an editor's pick (Keith, 29 Oct 2026); Read next follows, at most
 * three in all.
 */
export function leads(collection: CollectionPosition | null, readNext: ReadNextLink[]): Lead[] {
  const out: Lead[] = []
  if (collection?.next) out.push({ kicker: 'next-part', slug: collection.next.slug, title: collection.next.title, pick: 'next-part' })
  for (const r of readNext) {
    if (out.length >= 3) break
    if (out.some(l => l.slug === r.slug)) continue
    out.push({ kicker: out.length === 0 ? 'read-next' : 'or', slug: r.slug, title: r.title, pick: r.kind })
  }
  return out
}

/** Where the reader is, in words, for texts with no contents to point at. */
export function wherePhrase(fraction: number): string {
  if (fraction < 0.1) return 'Just begun'
  if (fraction > 0.85) return 'Near the end'
  if (fraction < 0.27) return 'About a fifth of the way through'
  if (fraction < 0.4) return 'About a third of the way through'
  if (fraction < 0.6) return 'About halfway through'
  return 'About two thirds of the way through'
}

/** Minutes left, never zero while there is text left. */
export function minutesLeft(totalMinutes: number, fraction: number): number {
  return Math.max(1, Math.round(totalMinutes * (1 - Math.min(Math.max(fraction, 0), 1))))
}

/**
 * Below this reading time the text barely scrolls past a screen or two, and a
 * reading header would be furniture with nothing to point at. The menu and the
 * end-of-text Read next serve such texts.
 */
export const MIN_NAV_MINUTES = 3
