// Server-side: builds the whitelisted command that bridges a Sourcer staging
// bundle into the layout scripts/pipeline-import.mjs consumes. The script path
// is fixed and every arg is derived from validated caller input, never from
// free-form shell text — spawn() takes an argv array (no shell), so this is
// safe from injection by construction, matching lib/pipeline/runner.ts.

import path from 'path'
import { GENRES, ALL_THEMES, MAX_THEMES, TRADITIONS, ERAS } from '@/lib/pipeline/vocab'

export type Command = { cmd: string; args: string[]; cwd: string }

const SLUG_RE = /^[a-z0-9-]+$/
const TRADITION_SLUGS = new Set<string>(TRADITIONS.map(t => t.slug))
const ERA_SLUGS = new Set<string>(ERAS.map(e => e.slug))

export interface BridgeInput {
  slug: string
  by: 'single' | 'book'
  author: string
  title: string
  genre: string
  themes: string[]
  tradition: string
  era: string
  deathYear: number | null
  sourceAttribution?: string
  translationNotes?: string
  provenanceNotes?: string
}

// Validates every field pipeline-import.mjs will later re-read from the queue
// entry stage-to-output.mjs writes, so a bad value is caught here rather than
// surfacing as a cryptic import-time failure.
export function buildBridgeCommand(input: BridgeInput): Command {
  if (!input.slug || !SLUG_RE.test(input.slug)) throw new Error('Invalid slug.')
  if (!input.by || !['single', 'book'].includes(input.by)) throw new Error('by must be "single" or "book".')
  if (!input.author?.trim()) throw new Error('Author is required.')
  if (!input.title?.trim()) throw new Error('Title is required.')
  if (!input.genre || !GENRES.includes(input.genre as (typeof GENRES)[number])) throw new Error(`Unknown genre "${input.genre}".`)
  if (!input.themes?.length) throw new Error('At least one theme is required.')
  if (input.themes.length > MAX_THEMES) throw new Error(`At most ${MAX_THEMES} themes.`)
  const badTheme = input.themes.find(t => !ALL_THEMES.includes(t))
  if (badTheme) throw new Error(`Unknown theme "${badTheme}".`)
  if (!input.tradition || !TRADITION_SLUGS.has(input.tradition)) throw new Error('A valid tradition is required.')
  if (input.era && !ERA_SLUGS.has(input.era)) throw new Error(`Unknown era "${input.era}".`)
  if (input.deathYear == null || !Number.isFinite(input.deathYear)) {
    throw new Error('Author death year is required — HARD CONSTRAINT 3 (pipeline-import.mjs will refuse to import without it).')
  }

  const args = [
    path.join(process.cwd(), 'scripts', 'sourcer', 'stage-to-output.mjs'),
    input.slug,
    `--by=${input.by}`,
    `--author=${input.author.trim()}`,
    `--title=${input.title.trim()}`,
    `--genre=${input.genre}`,
    `--themes=${input.themes.join(',')}`,
    `--tradition=${input.tradition}`,
    ...(input.era ? [`--era=${input.era}`] : []),
    `--death-year=${input.deathYear}`,
    ...(input.sourceAttribution?.trim() ? [`--source-attribution=${input.sourceAttribution.trim()}`] : []),
    ...(input.translationNotes?.trim() ? [`--translation-notes=${input.translationNotes.trim()}`] : []),
    ...(input.provenanceNotes?.trim() ? [`--provenance-notes=${input.provenanceNotes.trim()}`] : []),
    '--write-queue',
  ]
  return { cmd: 'node', args, cwd: process.cwd() }
}
