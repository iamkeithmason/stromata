import { MAX_THEMES } from '@/lib/pipeline/vocab'

// HARD CONSTRAINT 5 (at most six themes per text) for the admin text forms.
// The pipeline screens already capped themes; the text edit form did not, and
// five published texts drifted to 7–11 before the 27 Oct 2026 audit found them.
// The routes refuse an over-cap save; the forms stop the seventh tick first.

export { MAX_THEMES }

/** An error message when a save would carry more themes than the cap, else null. */
export function themeCapError(themeSlugs: unknown): string | null {
  if (!Array.isArray(themeSlugs)) return null
  const count = new Set(themeSlugs).size
  return count > MAX_THEMES
    ? `A text can carry at most ${MAX_THEMES} themes; this one has ${count}.`
    : null
}

/** Toggle a theme in a selection, refusing to add one past the cap. */
export function toggleThemeCapped(selected: string[], slug: string): string[] {
  if (selected.includes(slug)) return selected.filter(s => s !== slug)
  if (selected.length >= MAX_THEMES) return selected
  return [...selected, slug]
}
