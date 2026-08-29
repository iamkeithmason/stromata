/**
 * Controlled vocabularies — genres and theme slugs the proposed metadata must
 * draw from. Mirrors the controlled-vocabulary tables in CLAUDE.md (which match
 * the Supabase + Notion options). The Sourcer PROPOSES from these; the editor
 * confirms. Nothing here is invented at runtime.
 */

/** Genre names (use the name, not a slug) — matches the Notion Genre select. */
export const GENRES = [
  'Homily',
  'Sermon',
  'Letter',
  'Treatise',
  'Essay',
  'Meditation',
  'Rule',
  'Prayer',
  'Catechesis',
  'Commentary',
  'Dialogue',
  'Hymn',
  'Confession',
  'Hagiography',
  'Apology',
  'Exegesis',
] as const;

/** Theme slugs (max 6 per text), from the THEME_CLUSTERS tables in CLAUDE.md. */
export const THEME_SLUGS = [
  // The Interior Life
  'prayer',
  'repentance',
  'contemplation',
  'humility',
  'suffering',
  'spiritual-warfare',
  'desire',
  'rest',
  // The Christian Life
  'vocation',
  'community',
  'hospitality',
  'fasting',
  'poverty',
  'obedience',
  'marriage',
  'work',
  // Doctrine
  'trinity',
  'christology',
  'pneumatology',
  'salvation',
  'eschatology',
  'creation',
  'scripture',
  'providence',
  // The Church
  'liturgy',
  'sacraments',
  'ministry',
  'monasticism',
  'preaching',
  'tradition',
  // Moral & Ethical
  'justice',
  'virtue',
  'vice',
  'death',
  'conscience',
] as const;

/** At most this many themes per text (HARD CONSTRAINT 5). */
export const MAX_THEMES = 6;

export function isGenre(v: string): boolean {
  return (GENRES as readonly string[]).includes(v);
}

export function isThemeSlug(v: string): boolean {
  return (THEME_SLUGS as readonly string[]).includes(v);
}
