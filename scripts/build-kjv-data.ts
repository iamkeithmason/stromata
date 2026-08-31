/**
 * build-kjv-data.ts — One-time generator for the bundled KJV verse text.
 *
 * Fetches the public-domain King James Version (aruljohn/Bible-kjv) book by
 * book and writes a flat OSIS-keyed lookup to lib/scripture/data/kjv.json,
 * e.g. { "John.3.16": "For God so loved the world…" }. Each book is mapped to
 * its OSIS id through the reference parser itself, so the keys always match
 * what parseReferences() emits.
 *
 * The output is committed; this script only needs re-running to regenerate it.
 *
 *   npx tsx scripts/build-kjv-data.ts
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseReferenceQuery } from '../lib/scripture'

const BASE = 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master'

// The 66-book Protestant canon, as named in the source repo's Books.json.
const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
]

interface SourceBook {
  book: string
  chapters: { chapter: string; verses: { verse: string; text: string }[] }[]
}

function fetchBook(name: string): SourceBook {
  const file = name.replace(/ /g, '') + '.json'
  const raw = execFileSync('curl', ['-sS', '--max-time', '40', `${BASE}/${file}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(raw)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out: Record<string, string> = {}

for (const name of BOOKS) {
  const osisBook = parseReferenceQuery(`${name} 1:1`)?.book
  if (!osisBook) throw new Error(`Could not resolve an OSIS book id for "${name}"`)
  const data = fetchBook(name)
  for (const chapter of data.chapters) {
    for (const v of chapter.verses) {
      out[`${osisBook}.${chapter.chapter}.${v.verse}`] = v.text.trim()
    }
  }
  console.error(`${name.padEnd(18)} -> ${osisBook}`)
}

const dir = path.join(__dirname, '..', 'lib', 'scripture', 'data')
mkdirSync(dir, { recursive: true })
writeFileSync(path.join(dir, 'kjv.json'), JSON.stringify(out))
console.error(`\nVerses written: ${Object.keys(out).length}`)
