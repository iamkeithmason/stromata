/**
 * The reader's outline: what the phone reading header and its sheet show.
 *
 * Feature Backlog: "Mid-text navigation on phones". On a phone, every way off
 * a long text used to sit on screen 1 or after the last line, and readers
 * stalled in between (the Vainglory page: 115 visitors, no second text). The
 * reading header (app/components/ReaderNav.tsx) shows where the reader is and
 * opens a sheet with the contents, the collection and Read next. Everything
 * that decides WHAT it shows lives here, pure and unit-tested; the component
 * only measures scroll and renders.
 *
 * Decisions recorded on the backlog card (Keith, 29 Oct and 2 Nov 2026):
 *  - Contents come from the author's own headings when there are enough of
 *    them, else from the editor's sections (`texts.sections`, migration 034).
 *    Sections are editorial apparatus, not part of the original text, so they
 *    are numbered differently: lower-case roman with a section mark
 *    ("§ ii of viii"), where the author's chapters count in arabic
 *    ("22 of 44"). The two can never be mistaken for each other.
 *  - The trigger's label names whatever leads the sheet: "Contents" when the
 *    text has contents; otherwise "Next part" in a collection with a next
 *    part; otherwise "Read next". Never "Way on".
 *  - Short texts (about five minutes or less) get no running head: the header
 *    stays as it is, and the sheet opens from screen 1 and from the end.
 */

import type { Heading } from '@/lib/headings'

/** A body needs at least this many headings to have contents (`hasToc` on the reader page). */
export const MIN_CONTENTS_HEADINGS = 3

/** Contents longer than this are windowed in the sheet: first entry, fold, current ±2, fold. */
export const WINDOW_OVER = 9

/** Texts at or under this many (rounded) minutes get no running head. Keith, 2 Nov 2026. */
export const SHORT_TEXT_MINUTES = 5

export type OutlineKind = 'headings' | 'sections' | 'none'
export type OutlineEntry = { id: string; label: string }
export type Outline = { kind: OutlineKind; entries: OutlineEntry[] }

/** The stored shape of `texts.sections` (migration 034). */
export type SectionsDoc = { source?: string; sections?: { label?: unknown; starts_with?: unknown }[] } | null

/** The DOM id the section that starts at a paragraph carries. 1-based, so `#section-1` is the first. */
export const sectionId = (n: number) => `section-${n}`

/**
 * The approved sections as plain {label, anchor} pairs, dropping anything
 * malformed. The anchors go to MarkdownBody, which tags the paragraphs they
 * find (lib/markdown/section-anchors.ts); the labels go to the outline.
 */
export function readSections(doc: SectionsDoc): { label: string; anchor: string }[] {
  if (!doc || doc.source !== 'editorial' || !Array.isArray(doc.sections)) return []
  return doc.sections.flatMap(s =>
    typeof s?.label === 'string' && s.label.trim() && typeof s?.starts_with === 'string' && s.starts_with.trim()
      ? [{ label: s.label.trim(), anchor: s.starts_with }]
      : [],
  )
}

/** "Chapter 14. On heresies" → "On heresies": the position already gives the number. */
export function unnumbered(label: string): string {
  return label.replace(/^(chapter|book|part|lecture|section)\s+[\divxlc]+\s*[.:—–-]?\s*/i, '').trim() || label
}

/**
 * Which contents the text has. The author's headings win when there are enough
 * of them to make a contents list (the same threshold as the desktop TOC); a
 * body with h2 chapters and h3 sub-heads lists the chapters only, since the
 * sheet is for finding your way, not for the full apparatus. Failing that, the
 * editor's sections; failing that, none.
 *
 * `foundSections` is how many section anchors MarkdownBody actually found in
 * the body, in order. An anchor that no longer matches (the body was edited)
 * drops out rather than linking nowhere.
 */
export function buildOutline(headings: Heading[], sections: { label: string }[], foundSections: number[]): Outline {
  if (headings.length >= MIN_CONTENTS_HEADINGS) {
    const top = Math.min(...headings.map(h => h.level))
    const atTop = headings.filter(h => h.level === top)
    const chosen = atTop.length >= 2 ? atTop : headings
    return { kind: 'headings', entries: chosen.map(h => ({ id: h.id, label: unnumbered(h.text) })) }
  }
  const entries = foundSections
    .filter(i => i >= 0 && i < sections.length)
    .map(i => ({ id: sectionId(i + 1), label: sections[i].label }))
  if (entries.length >= 2) return { kind: 'sections', entries }
  return { kind: 'none', entries: [] }
}

/** Lower-case roman numerals, for editorial sections: 1 → "i", 8 → "viii". */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n)
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ]
  let out = ''
  for (const [v, s] of table) while (n >= v) { out += s; n -= v }
  return out
}

/** An entry's number as the sheet and the header print it. */
export function entryNumber(kind: OutlineKind, i: number): string {
  return kind === 'sections' ? roman(i + 1) : String(i + 1)
}

export type CollectionPlace = { title: string; part: number; total: number }

/**
 * The running head's first line: where the reader is in this text.
 * `current` is the index of the entry the reader is in, or -1 before the first.
 */
export function positionLabel(outline: Outline, current: number, collection: CollectionPlace | null): string | null {
  const n = outline.entries.length
  if (current >= 0 && current < n) {
    if (outline.kind === 'sections') return `§ ${roman(current + 1)} of ${roman(n)}`
    if (outline.kind === 'headings') return `${current + 1} of ${n}`
  }
  if (collection) return `Part ${collection.part} of ${collection.total}`
  return null
}

/** The running head's second line: current heading → current section → collection → text title. */
export function runningLabel(outline: Outline, current: number, collection: CollectionPlace | null, title: string): string {
  return outline.entries[current]?.label ?? collection?.title ?? title
}

/** What the trigger says, naming whatever leads the sheet. Null: there is nothing to open. */
export function sheetLabel({ hasContents, hasNextPart, hasReadNext }: { hasContents: boolean; hasNextPart: boolean; hasReadNext: boolean }): string | null {
  if (hasContents) return 'Contents'
  if (hasNextPart) return 'Next part'
  if (hasReadNext) return 'Read next'
  return null
}

/** Whether the text is long enough for a running head. `minutes` is the rounded reading time. */
export function showsRunningHead(minutes: number): boolean {
  return minutes > SHORT_TEXT_MINUTES
}

/** Minutes left at `fraction` through the body: never 0 while still reading. */
export function minutesLeft(minutes: number, fraction: number): number {
  const f = Math.min(Math.max(fraction, 0), 1)
  return Math.max(1, Math.round(minutes * (1 - f)))
}

/** For texts with no contents: where the reader is, in words. */
export function wherePhrase(fraction: number): string {
  if (fraction < 0.1) return 'Just begun'
  if (fraction > 0.85) return 'Near the end'
  if (fraction < 0.27) return 'About a fifth of the way through'
  if (fraction < 0.4) return 'About a third of the way through'
  if (fraction < 0.6) return 'About halfway through'
  return 'About two thirds of the way through'
}

export type ContentsRow = { kind: 'entry'; i: number } | { kind: 'fold'; from: number; to: number }

/**
 * The rows the sheet lists. Short contents list everything; long ones show the
 * first entry, a fold, the current entry ±2 and a fold, so the reader sees where
 * they are without scrolling a 44-chapter list. A fold expands the whole list.
 */
export function windowContents(n: number, current: number, expanded = false): ContentsRow[] {
  const rows: ContentsRow[] = []
  if (n <= 0) return rows
  if (n <= WINDOW_OVER || expanded) {
    for (let i = 0; i < n; i++) rows.push({ kind: 'entry', i })
    return rows
  }
  const c = Math.min(Math.max(current, 0), n - 1)
  const lo = Math.max(1, c - 2)
  const hi = Math.min(n - 1, Math.max(c + 2, lo))
  rows.push({ kind: 'entry', i: 0 })
  if (lo > 1) rows.push({ kind: 'fold', from: 1, to: lo - 1 })
  for (let i = lo; i <= hi; i++) rows.push({ kind: 'entry', i })
  if (hi < n - 1) rows.push({ kind: 'fold', from: hi + 1, to: n - 1 })
  return rows
}
