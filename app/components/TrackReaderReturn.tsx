'use client'
import { useEffect } from 'react'
import { whenTrackerReady } from '@/lib/analytics/track-when-ready'

function getISOWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${weekNo}`
}

/**
 * Fires `reader-return` when a device visits in a different ISO week from its
 * previous visit — the Growth Model's North Star, measured as an event.
 *
 * Mounted in the root layout, so this effect runs at the earliest paint of the
 * session: the moment the deferred tracker is LEAST likely to exist. Calling
 * `window.umami?.track()` directly here silently dropped the event on the
 * floor — across the site's whole history `reader-return` never once reached
 * Umami. Everything therefore runs inside the tracker-ready callback.
 *
 * The week marker is written inside it too, not before. Advancing the marker
 * when the tracker never loaded spends the reader's return without reporting
 * it: they would be recorded as "seen this week" while the event that made
 * that worth knowing was never sent.
 */
export function TrackReaderReturn() {
  useEffect(
    () =>
      whenTrackerReady((tracker) => {
        const currentWeek = getISOWeekKey()
        const lastWeek = localStorage.getItem('stromata-last-week')
        if (lastWeek && lastWeek !== currentWeek) tracker.track('reader-return')
        localStorage.setItem('stromata-last-week', currentWeek)
      }),
    []
  )
  return null
}
