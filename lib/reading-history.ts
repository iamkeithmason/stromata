const KEY = 'stromata:reading-history'
const MAX = 4

/** Below this a text counts as opened, not started. */
export const PROGRESS_NOT_STARTED = 0.05
/** At or above this a text counts as finished. */
export const PROGRESS_FINISHED = 0.95
/** The hash a Reading history card adds so the reader returns to their place. */
export const RESUME_HASH = '#resume'

export type ReadingHistoryEntry = {
  slug: string
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  /** For the cover's ornament. Optional: entries saved before 9 Nov 2026 lack it. */
  genreName?: string | null
  readingMinutes: number | null
  visitedAt: number
  /** Furthest point reached, 0–1. Only ever grows. */
  progress?: number
  progressUpdatedAt?: number
  /** Where the reader last was, 0–1 of the scrollable height. Entries saved before 25 Nov 2026 lack it. */
  position?: number
}

export function recordVisit(entry: Omit<ReadingHistoryEntry, 'visitedAt' | 'progress' | 'progressUpdatedAt' | 'position'>) {
  try {
    const history = getHistory()
    const existing = history.find(e => e.slug === entry.slug)
    const filtered = history.filter(e => e.slug !== entry.slug)
    const updated = [{
      ...entry,
      visitedAt: Date.now(),
      ...(existing?.progress != null ? { progress: existing.progress, progressUpdatedAt: existing.progressUpdatedAt } : {}),
      ...(existing?.position != null ? { position: existing.position } : {}),
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

/** Remember where the reader is now, which may be behind their furthest point. */
export function updatePosition(slug: string, value: number) {
  try {
    const history = getHistory()
    const entry = history.find(e => e.slug === slug)
    if (!entry) return
    entry.position = Math.min(Math.max(value, 0), 1)
    localStorage.setItem(KEY, JSON.stringify(history))
  } catch {}
}

/**
 * Where a returning reader should land, 0–1, or null when there is nothing to
 * resume: not started, finished, or no history. Falls back to the furthest
 * point for entries saved before `position` existed.
 */
export function resumePoint(entry: Pick<ReadingHistoryEntry, 'progress' | 'position'> | undefined): number | null {
  if (!entry) return null
  const furthest = entry.progress ?? 0
  if (furthest < PROGRESS_NOT_STARTED || furthest >= PROGRESS_FINISHED) return null
  const at = entry.position ?? furthest
  return at >= PROGRESS_NOT_STARTED ? Math.min(at, furthest) : null
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
