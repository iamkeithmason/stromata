// Controlled vocabularies for the content pipeline.
// Mirrors the tables in CLAUDE.md — the single source of truth for what the
// pipeline GUI dropdowns may offer. Client-safe (no Node imports).

export const TRADITIONS = [
  { slug: 'early-church', name: 'Early Church (pre-Nicene)' },
  { slug: 'patristic', name: 'Patristic' },
  { slug: 'imperial', name: 'Imperial' },
  { slug: 'oriental-orthodox', name: 'Oriental Orthodox' },
  { slug: 'eastern-orthodox', name: 'Eastern Orthodox' },
  { slug: 'roman-catholic', name: 'Roman Catholic' },
  { slug: 'anglican', name: 'Anglican' },
  { slug: 'reformed', name: 'Reformed' },
  { slug: 'lutheran', name: 'Lutheran' },
  { slug: 'radical-reformation', name: 'Radical Reformation' },
  { slug: 'methodist', name: 'Methodist' },
  { slug: 'ecumenical', name: 'Ecumenical' },
] as const

export const ERAS = [
  { slug: 'apostolic', label: 'Apostolic (to c. 100)' },
  { slug: 'ante-nicene', label: 'Ante-Nicene (c. 100–325)' },
  { slug: 'nicene-post-nicene', label: 'Nicene & Post-Nicene (325–600)' },
  { slug: 'early-medieval', label: 'Early Medieval (600–1000)' },
  { slug: 'high-medieval', label: 'High Medieval (1000–1350)' },
  { slug: 'late-medieval', label: 'Late Medieval (1350–1500)' },
  { slug: 'reformation', label: 'Reformation (1500–1600)' },
  { slug: 'post-reformation', label: 'Post-Reformation (1600–1800)' },
  { slug: 'modern', label: 'Modern (1800–1900)' },
] as const

export const GENRES = [
  'Homily', 'Sermon', 'Letter', 'Treatise', 'Essay', 'Meditation', 'Rule',
  'Prayer', 'Catechesis', 'Commentary', 'Dialogue', 'Hymn', 'Confession',
  'Hagiography', 'Apology', 'Exegesis',
] as const

// Theme clusters — max 6 per text (enforced in CLAUDE.md).
export const THEME_CLUSTERS: Record<string, string[]> = {
  'The Interior Life': ['prayer', 'repentance', 'contemplation', 'humility', 'suffering', 'spiritual-warfare', 'desire', 'rest'],
  'The Christian Life': ['vocation', 'community', 'hospitality', 'fasting', 'poverty', 'obedience', 'marriage', 'work'],
  'Doctrine': ['trinity', 'christology', 'pneumatology', 'salvation', 'eschatology', 'creation', 'scripture', 'providence'],
  'The Church': ['liturgy', 'sacraments', 'ministry', 'monasticism', 'preaching', 'tradition'],
  'Moral & Ethical': ['justice', 'virtue', 'vice', 'death', 'conscience'],
}

export const ALL_THEMES: string[] = Object.values(THEME_CLUSTERS).flat()

export const MAX_THEMES = 6

export const SOURCE_TYPES = [
  'newadvent', 'gutenberg', 'wikisource', 'archive_online', 'archive_ocr', 'gdrive_docx',
] as const

export type SourceType = (typeof SOURCE_TYPES)[number]

// The linear status chain from CLAUDE.md.
export const STATUSES = [
  'pending', 'stage-1-done', 'stage-2-done', 'stage-3-done', 'staged', 'imported', 'rejected',
] as const

export type Status = (typeof STATUSES)[number]
