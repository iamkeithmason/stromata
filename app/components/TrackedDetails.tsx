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
}

/**
 * A native <details> that reports when a reader opens it. The children are
 * server-rendered and stay in the DOM while closed, so every link inside is
 * crawlable and the page works without JavaScript; only the event needs it.
 */
export function TrackedDetails({ summary, children, event, data, className, summaryClassName }: Props) {
  const cancel = useRef<() => void>(() => {})
  useEffect(() => () => cancel.current(), [])

  return (
    <details
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
