const KEY = 'stromata:reading-history'
const MAX = 4

export type ReadingHistoryEntry = {
  slug: string
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  readingMinutes: number | null
  visitedAt: number
  progress?: number
  progressUpdatedAt?: number
}

export function recordVisit(entry: Omit<ReadingHistoryEntry, 'visitedAt' | 'progress' | 'progressUpdatedAt'>) {
  try {
    const history = getHistory()
    const existing = history.find(e => e.slug === entry.slug)
    const filtered = history.filter(e => e.slug !== entry.slug)
    const updated = [{
      ...entry,
      visitedAt: Date.now(),
      ...(existing?.progress != null ? { progress: existing.progress, progressUpdatedAt: existing.progressUpdatedAt } : {}),
    }, ...filtered].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(updated))
  } catch {}
}

export function updateProgress(slug: string, value: number) {
  try {
    const history = getHistory()
    const entry = history.find(e => e.slug === slug)
    if (!entry) return
    const current = entry.progress ?? 0
    if (value <= current) return
    entry.progress = Math.min(value, 1)
    entry.progressUpdatedAt = Date.now()
    localStorage.setItem(KEY, JSON.stringify(history))
  } catch {}
}

export function getHistory(): ReadingHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as ReadingHistoryEntry[]
  } catch {
    return []
  }
}
