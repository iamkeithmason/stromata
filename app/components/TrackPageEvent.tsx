'use client'
import { useEffect } from 'react'
import { whenTrackerReady } from '@/lib/analytics/track-when-ready'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

type Props = {
  event: string
  data?: Record<string, string | number | null | undefined>
}

/**
 * Fires one event when a page mounts. Used across eleven pages for the
 * `*-page-view` family, `text-view`, `collection-view` and `search-no-results`.
 *
 * This component is the one `lib/analytics/track-when-ready.ts` was written
 * about: its doc comment measured `text-view` at 8 events against `text-read`'s
 * 52 on the same pages, and a mount cannot be outnumbered by a scroll that
 * happens on it. The helper landed; this caller was never migrated to it. The
 * all-time tally still shows the same shape — `text-view` 49 against
 * `text-read` 109, with `era-page-view` and `scripture-lookup-view` absent
 * entirely despite being mounted on live routes.
 *
 * Firing through the tracker-ready callback closes that gap. The empty
 * dependency list is unchanged: one event per mount, not one per prop change.
 */
export function TrackPageEvent({ event, data }: Props) {
  useEffect(
    () =>
      whenTrackerReady((tracker) =>
        tracker.track(event, data as Record<string, string | number | null>)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  return null
}
