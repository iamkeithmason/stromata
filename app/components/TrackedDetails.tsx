'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { whenTrackerReady } from '@/lib/analytics/track-when-ready'

type Props = {
  summary: ReactNode
  children: ReactNode
  /** Fired once per open, through the tracker-ready callback. */
  event: string
  data: Record<string, string | number | null>
  className?: string
  summaryClassName?: string
  /** Anchor id; a link to #id opens the details and scrolls to it. */
  id?: string
}

/**
 * A native <details> that reports when a reader opens it. The children are
 * server-rendered and stay in the DOM while closed, so every link inside is
 * crawlable and the page works without JavaScript; only the event needs it.
 */
export function TrackedDetails({ summary, children, event, data, className, summaryClassName, id }: Props) {
  const cancel = useRef<() => void>(() => {})
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => () => cancel.current(), [])

  // A details element does not open itself when the URL targets it, so do it
  // here: on load and on every in-page jump to its anchor.
  useEffect(() => {
    if (!id) return
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}` && ref.current && !ref.current.open) ref.current.open = true
    }
    openIfTargeted()
    window.addEventListener('hashchange', openIfTargeted)
    return () => window.removeEventListener('hashchange', openIfTargeted)
  }, [id])

  return (
    <details
      ref={ref}
      id={id}
      className={className}
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) return
        cancel.current()
        cancel.current = whenTrackerReady((tracker) => tracker.track(event, data))
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  )
}
