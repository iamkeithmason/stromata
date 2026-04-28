const KEY = 'stromata:reading-history'
const MAX = 4

export type ReadingHistoryEntry = {
  slug: string
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  visitedAt: number
}

export function recordVisit(entry: Omit<ReadingHistoryEntry, 'visitedAt'>) {
  try {
    const history = getHistory()
    const filtered = history.filter(e => e.slug !== entry.slug)
    const updated = [{ ...entry, visitedAt: Date.now() }, ...filtered].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(updated))
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
