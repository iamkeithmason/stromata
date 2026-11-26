'use client'
import { useEffect, useRef, useCallback } from 'react'
import {
  updateProgress,
  updatePosition,
  getHistory,
  resumePoint,
  RESUME_HASH,
  PROGRESS_NOT_STARTED,
  PROGRESS_FINISHED,
} from '@/lib/reading-history'
import { whenTrackerReady } from '@/lib/analytics/track-when-ready'

const THROTTLE_MS = 100
const READ_THRESHOLD = 0.75

export function ReadingProgressBar({ slug }: { slug: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const maxRef = useRef(0)
  const firedReadEvent = useRef(false)
  const lastTickRef = useRef(0)
  const lastPersistRef = useRef(0)
  const rafRef = useRef(0)
  const cancelTrackRef = useRef<(() => void) | null>(null)
  // Where the reader is now. Null until a real scroll event: the mount call to
  // onScroll() always reads the top of the page, and saving that would wipe a
  // reader's place if they opened the text and left before scrolling.
  const positionRef = useRef<number | null>(null)

  const computeProgress = useCallback(() => {
    const doc = document.documentElement
    const scrollTop = window.scrollY || doc.scrollTop
    const scrollHeight = doc.scrollHeight - doc.clientHeight
    if (scrollHeight <= 0) return 1
    return Math.min(Math.max(scrollTop / scrollHeight, 0), 1)
  }, [])

  const persist = useCallback(() => {
    if (maxRef.current > 0) {
      updateProgress(slug, maxRef.current)
    }
    if (positionRef.current != null) {
      updatePosition(slug, positionRef.current)
    }
  }, [slug])

  useEffect(() => {
    const history = getHistory()
    const entry = history.find(e => e.slug === slug)
    if (entry?.progress != null) {
      maxRef.current = entry.progress
    }

    // A Reading history card links here with #resume: put the reader back where
    // they were. On a client-side navigation Next scrolls the new page to the
    // top after this effect has run, and web fonts arriving change the page
    // height, so the restore is re-applied a few times over the first second,
    // but only until the reader touches the page themselves. The hash is
    // dropped only once that is over, so a remounted effect (React's dev
    // double-run, or a fast re-render) still sees it.
    let cancelResume = () => {}
    if (window.location.hash === RESUME_HASH) {
      const dropHash = () => {
        if (window.location.hash !== RESUME_HASH) return
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      }
      const at = resumePoint(entry)
      if (at == null) dropHash()
      else {
        let readerMoved = false
        const timers: number[] = []
        const onInput = () => { readerMoved = true; dropHash() }
        const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
        inputs.forEach(t => window.addEventListener(t, onInput, { passive: true, once: true }))
        const restore = () => {
          if (readerMoved) return
          const doc = document.documentElement
          const top = Math.round(at * (doc.scrollHeight - doc.clientHeight))
          if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: 'auto' })
        }
        requestAnimationFrame(restore)
        for (const ms of [50, 150, 300, 600, 1000]) timers.push(window.setTimeout(restore, ms))
        timers.push(window.setTimeout(dropHash, 1100))
        document.fonts?.ready.then(restore)
        cancelResume = () => {
          readerMoved = true
          timers.forEach(clearTimeout)
          inputs.forEach(t => window.removeEventListener(t, onInput))
        }
      }
    }

    const onScroll = (event?: Event) => {
      const now = performance.now()
      if (now - lastTickRef.current < THROTTLE_MS) {
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0
            onScroll(event)
          })
        }
        return
      }
      lastTickRef.current = now

      const current = computeProgress()
      if (event) positionRef.current = current
      if (current > maxRef.current) {
        maxRef.current = current
      }

      if (barRef.current) {
        barRef.current.style.width = `${current * 100}%`
      }

      if (!firedReadEvent.current && maxRef.current >= READ_THRESHOLD) {
        firedReadEvent.current = true
        // Send the slug (not the title) so text-read joins to Supabase and
        // matches text-open, per the slug rule in CLAUDE.md's analytics section.
        //
        // Through whenTrackerReady, because this is NOT always a scroll-time
        // call. `onScroll()` runs once synchronously below, at mount, and
        // computeProgress() returns 1 outright when the document is shorter
        // than the viewport — so on any short text the threshold is already met
        // on that first call, before the deferred tracker exists. The same
        // happens for a returning reader, whose maxRef is seeded from reading
        // history above. Both cases fired into `window.umami?.` and vanished.
        //
        // The latch stays outside the callback here, unlike TrackWeeklyReader's
        // session flag: this handler runs at up to 10Hz, so latching on attempt
        // is what stops one poller per scroll tick, and the helper's own wait
        // already covers a tracker that arrives late. The ref dies with the
        // page view, so a retry could not recover anything the wait did not.
        cancelTrackRef.current = whenTrackerReady((tracker) => {
          tracker.track('text-read', { text: slug })
        })
      }

      const now2 = performance.now()
      if (now2 - lastPersistRef.current > 2000) {
        lastPersistRef.current = now2
        persist()
      }
    }

    onScroll()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', persist)

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', persist)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      cancelResume()
      // Stop waiting on a tracker for a page the reader has already left.
      cancelTrackRef.current?.()
      persist()
    }
  }, [slug, computeProgress, persist])

  useEffect(() => {
    if (!barRef.current) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    barRef.current.style.transition = reduced ? 'none' : 'width 150ms linear'
  }, [])

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 50,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        ref={barRef}
        style={{
          height: '100%',
          width: 0,
          background: 'var(--gold)',
          opacity: 0.7,
        }}
      />
    </div>
  )
}

export { PROGRESS_NOT_STARTED, PROGRESS_FINISHED }
