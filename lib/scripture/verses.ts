import kjvData from './data/kjv.json'

import type { ScriptureRef } from './types'

/**
 * King James Version verse text, keyed by OSIS (e.g. "John.3.16"). Public
 * domain; bundled from lib/scripture/data/kjv.json (see scripts/build-kjv-data.ts).
 * Covers the 66-book Protestant canon — references to apocryphal books resolve
 * to null (no KJV text bundled), so the reader simply gets no tooltip for them.
 *
 * IMPORTANT — server-only: the full text is ~4 MB and must never ship to the
 * client. Import this module only from server code (the reader resolves the few
 * verses on a page here and passes just those to the client component). Never
 * import it into a 'use client' component.
 */
const verses = kjvData as Record<string, string>

/** The KJV text for a single verse, or null if not present. */
export function getVerseText(osis: string): string | null {
  return verses[osis] ?? null
}

export interface ResolvedVerse {
  /** Human-readable reference label, e.g. "John 3:16" or "Romans 8:28-30". */
  reference: string
  /** The verse text (verses joined for a range). */
  text: string
}

/**
 * Resolve the display text for a reference: a single verse, or the joined text
 * of a same-chapter range. Whole-chapter citations (verse === null) return null
 * — too long to surface inline — as do references whose text isn't bundled
 * (e.g. apocrypha).
 */
export function resolveVerseText(ref: ScriptureRef): ResolvedVerse | null {
  if (ref.verse == null) return null

  const end = ref.verseEnd ?? ref.verse
  const parts: string[] = []
  for (let v = ref.verse; v <= end; v++) {
    const text = verses[`${ref.book}.${ref.chapter}.${v}`]
    if (text) parts.push(text)
  }
  if (parts.length === 0) return null

  const label =
    ref.verse === end
      ? `${ref.bookName} ${ref.chapter}:${ref.verse}`
      : `${ref.bookName} ${ref.chapter}:${ref.verse}-${end}`
  return { reference: label, text: parts.join(' ') }
}
