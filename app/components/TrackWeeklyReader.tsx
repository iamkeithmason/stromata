'use client'
import { useEffect } from 'react'
import { whenTrackerReady } from '@/lib/analytics/track-when-ready'

const STORAGE_KEY = 'stromata:week-visits'
const SESSION_KEY = 'stromata:weekly-reader-fired'

function getWeekStart(ts: number): number {
  const d = new Date(ts)
  const day = d.getDay()
  // Shift to Monday (treat Sunday as end of previous week)
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function recordAndCountWeeks(): number {
  const now = Date.now()
  const cutoff = now - 30 * 24 * 60 * 60 * 1000

  const raw = localStorage.getItem(STORAGE_KEY)
  const stored: number[] = raw ? JSON.parse(raw) : []

  const weeks = new Set(stored.filter(w => w >= cutoff))
  weeks.add(getWeekStart(now))

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...weeks]))
  return weeks.size
}

/**
 * Fires `weekly-reader` once per session when a device has visited in 2 or more
 * distinct weeks in the trailing 30 days.
 *
 * Mounted in the root layout, so like `TrackReaderReturn` this effect runs
 * before the deferred tracker exists and the direct `window.umami?.track()`
 * call silently dropped it — `weekly-reader` has never appeared in Umami.
 *
 * Note which of the two writes moved and which did not. The visit history is
 * genuine reader history and is recorded whether or not analytics loads, so
 * `recordAndCountWeeks()` stays outside. The "already fired this session" flag
 * is a record OF the report, so it is set inside the callback beside the
 * `track` call — setting it first marked the session as reported and made the
 * miss unrecoverable for the rest of that visit.
 */
export function TrackWeeklyReader() {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return
    const weeks = recordAndCountWeeks()
    if (weeks < 2) return
    return whenTrackerReady((tracker) => {
      sessionStorage.setItem(SESSION_KEY, '1')
      tracker.track('weekly-reader', { weeks })
    })
  }, [])
  return null
}
