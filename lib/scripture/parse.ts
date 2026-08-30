import { bcv_parser } from 'bible-passage-reference-parser'
import * as en from 'bible-passage-reference-parser/esm/lang/en.js'

import { normalizeScriptureText } from './normalize'
import { displayBookName } from './books'
import type { ScriptureRef, ReferenceQuery } from './types'

// Minimal shape of the entities we read from parsed_entities(). The library's
// own types are broad; we narrow to just the fields consumed here.
interface BcvPoint {
  b: string
  c: number | null
  v?: number | null
}
interface BcvEntity {
  osis: string
  type: string
  indices: [number, number]
  start?: BcvPoint
  end?: BcvPoint
}
interface BcvGroup {
  entities: BcvEntity[]
}

let parser: bcv_parser | null = null

function getParser(): bcv_parser {
  if (parser) return parser
  const bcv = new bcv_parser(en)
  bcv.include_apocrypha(true)
  bcv.set_options({
    // Only capture references that carry at least a chapter — a bare book name
    // ("John", "Mark", "Job", "Acts") is ordinary English and must not match.
    book_alone_strategy: 'ignore',
    book_sequence_strategy: 'ignore',
    book_range_strategy: 'ignore',
  })
  parser = bcv
  return bcv
}

/**
 * Parse every scripture reference in a block of text, in document order,
 * including repeated citations of the same verse (each occurrence is returned
 * with its own offsets). Offsets are relative to the ORIGINAL text.
 */
export function parseReferences(text: string): ScriptureRef[] {
  if (!text) return []

  const { text: normalised, mapIndex } = normalizeScriptureText(text)
  const bcv = getParser()
  const groups = bcv.parse(normalised).parsed_entities() as unknown as BcvGroup[]

  const refs: ScriptureRef[] = []
  for (const group of groups) {
    for (const entity of group.entities) {
      const start = entity.start
      if (!start || start.c == null || !start.b) continue

      const end = entity.end

      // Whole-chapter citations (bcv type "bc", and chapter-level ranges like
      // "Rom 8-9") report a synthetic verse of 1, so we cannot trust start.v
      // alone. The OSIS itself is the reliable signal: "Rom.8" (one dot after
      // the book) is chapter-level, "Rom.8.28" (two dots) is verse-level.
      const startOsis = entity.osis.split(/[,-]/)[0]
      const isVerseLevel = (startOsis.match(/\./g) ?? []).length >= 2
      const sameChapterVerseRange =
        isVerseLevel &&
        entity.type === 'range' &&
        end != null &&
        end.b === start.b &&
        end.c === start.c &&
        end.v != null

      const [ns, ne] = entity.indices
      refs.push({
        osis: entity.osis,
        book: start.b,
        bookName: displayBookName(start.b),
        chapter: start.c,
        verse: isVerseLevel ? start.v ?? null : null,
        verseEnd: sameChapterVerseRange ? (end!.v as number) : null,
        raw: normalised.slice(ns, ne),
        index: mapIndex(ns),
        endIndex: mapIndex(ne),
      })
    }
  }
  return refs
}

/**
 * Parse a user-typed lookup query (e.g. "Romans 8:28", "1 cor 13") into a
 * single reference point, or null if nothing parseable is found. Ranges are
 * collapsed to their starting verse.
 */
export function parseReferenceQuery(input: string): ReferenceQuery | null {
  const refs = parseReferences(input)
  if (refs.length === 0) return null
  const r = refs[0]
  return { book: r.book, bookName: r.bookName, chapter: r.chapter, verse: r.verse, osis: r.osis }
}
