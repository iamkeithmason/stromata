// "I have ten minutes" — which texts the time-framed entrance offers.
//
// Reading time is shown in 5-minute steps (lib/reading-time.ts), so "ten
// minutes" means a text whose estimate is 10 or less: at 200 wpm, up to 2,000
// words. The floor keeps out fragments too short to count as a sitting.
//
// This is the whole of the selection rule, kept pure so a test can pin it. It
// is data-driven on purpose — no curation table — so a newly published short
// text appears without an edit. Texts Keith has introduced himself
// (`editorial_introduction`) lead, since those are the ones he has vouched for;
// after that the longer text wins, because a ten-minute reader wants a full
// sitting rather than the shortest thing available.

import { readingMinutes } from './reading-time'

export const TEN_MINUTES = 10
export const MIN_WORDS = 400
export const MAX_RESULTS = 12
export const MAX_THEME_CHIPS = 8
/** A theme must have at least this many candidates to be offered as a choice. */
export const MIN_TEXTS_PER_THEME = 2

export type TenMinuteText = {
  id: string
  title: string
  slug: string
  word_count: number | null
  summary: string | null
  editorial_introduction: string | null
  text_themes: { theme: { name: string; slug: string } | null }[]
}

export type ThemeChoice = { name: string; slug: string; count: number }

export function fitsTenMinutes(wordCount: number | null | undefined): boolean {
  if (wordCount == null || wordCount < MIN_WORDS) return false
  return readingMinutes(wordCount) <= TEN_MINUTES
}

function hasContent(s: string | null): boolean {
  return !!s && s.trim().length > 0
}

/** Every text that fits a ten-minute sitting, best first. */
export function rankTenMinuteTexts<T extends TenMinuteText>(texts: T[]): T[] {
  return texts
    .filter(t => fitsTenMinutes(t.word_count))
    .sort((a, b) => {
      const intro = Number(hasContent(b.editorial_introduction)) - Number(hasContent(a.editorial_introduction))
      if (intro !== 0) return intro
      const words = (b.word_count ?? 0) - (a.word_count ?? 0)
      if (words !== 0) return words
      return a.title.localeCompare(b.title)
    })
}

/** Themes worth offering as a choice, most populated first. */
export function themeChoices(ranked: TenMinuteText[]): ThemeChoice[] {
  const counts = new Map<string, ThemeChoice>()
  for (const t of ranked) {
    for (const { theme } of t.text_themes) {
      if (!theme) continue
      const cur = counts.get(theme.slug)
      if (cur) cur.count++
      else counts.set(theme.slug, { name: theme.name, slug: theme.slug, count: 1 })
    }
  }
  return [...counts.values()]
    .filter(c => c.count >= MIN_TEXTS_PER_THEME)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_THEME_CHIPS)
}

/** Narrow a ranked list to one theme. An unknown slug leaves it unchanged. */
export function selectForTheme<T extends TenMinuteText>(
  ranked: T[],
  themeSlug: string | null | undefined,
  choices: ThemeChoice[],
): T[] {
  if (!themeSlug || !choices.some(c => c.slug === themeSlug)) return ranked
  return ranked.filter(t => t.text_themes.some(x => x.theme?.slug === themeSlug))
}

/**
 * The homepage row: the best `n` of a ranked list, at most one per author, so
 * one prolific author's series (Augustine's Tractates on John filled all four
 * covers on 19 Nov) does not stand for the whole idea. Falls back to repeats
 * only when there are fewer distinct authors than slots.
 */
export function variedRow<T>(ranked: T[], n: number, authorKey: (t: T) => string | null | undefined): T[] {
  const seen = new Set<string>()
  const row: T[] = []
  const rest: T[] = []
  for (const t of ranked) {
    const key = authorKey(t)
    if (row.length < n && (key == null || !seen.has(key))) {
      if (key != null) seen.add(key)
      row.push(t)
    } else rest.push(t)
  }
  return row.length >= n ? row : [...row, ...rest.slice(0, n - row.length)]
}
