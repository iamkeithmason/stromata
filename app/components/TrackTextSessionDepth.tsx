'use client'
import { useEffect } from 'react'
import { recordTextVisit } from '@/lib/session-depth'

/**
 * Fires `text-session-depth` when the session reaches its 1st and 2nd DISTINCT
 * text. A threshold event, like `text-read` — it carries no `from`, because it
 * describes where the reader has got to, not where they came from.
 *
 * Mounted on /texts/[slug] only, so it counts every route onto a text page —
 * an organic landing from search, a `text-open` click, collection prev/next,
 * and browser back/forward — not just the ones that fire a click event.
 *
 * Each depth fires at most once per session, so first→second conversion is
 * count(depth=2) ÷ count(depth=1) from this one event, with no session joins.
 * The ledger lives in lib/session-depth.ts; see its tests for the cases.
 */
export function TrackTextSessionDepth({ slug }: { slug: string }) {
  useEffect(() => {
    const depth = recordTextVisit(window.sessionStorage, slug)
    if (depth != null) {
      window.umami?.track('text-session-depth', { depth, text: slug })
    }
  }, [slug])
  return null
}
