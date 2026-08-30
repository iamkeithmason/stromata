/**
 * Scripture reference parsing — the shared core behind the reverse-verse
 * lookup (which texts cite a verse) and, later, the in-reader tooltips.
 *
 * Built on bible-passage-reference-parser (bcv), with a corpus-specific
 * preprocessing pass for the roman-numeral and "Apoc." forms common in the
 * 19th-century NPNF/ANF translations in this library. See ./normalize for that
 * pass and ./parse for the parser wrapper.
 */
export type { ScriptureRef, ReferenceQuery } from './types'
export { parseReferences, parseReferenceQuery } from './parse'
export { displayBookName } from './books'
export { normalizeScriptureText, romanToArabic } from './normalize'
