'use client'
import { useEffect, useRef, useCallback } from 'react'
import { updateProgress, getHistory } from '@/lib/reading-history'

const THROTTLE_MS = 100
const READ_THRESHOLD = 0.75
const PROGRESS_NOT_STARTED = 0.05
const PROGRESS_FINISHED = 0.95

export function ReadingProgressBar({ slug, title }: { slug: string; title: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const maxRef = useRef(0)
  const firedReadEvent = useRef(false)
  const lastTickRef = useRef(0)
  const lastPersistRef = useRef(0)
  const rafRef = useRef(0)

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
  }, [slug])

  useEffect(() => {
    const history = getHistory()
    const entry = history.find(e => e.slug === slug)
    if (entry?.progress != null) {
      maxRef.current = entry.progress
    }

    const onScroll = () => {
      const now = performance.now()
      if (now - lastTickRef.current < THROTTLE_MS) {
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0
            onScroll()
          })
        }
        return
      }
      lastTickRef.current = now

      const current = computeProgress()
      if (current > maxRef.current) {
        maxRef.current = current
      }

      if (barRef.current) {
        barRef.current.style.width = `${current * 100}%`
      }

      if (!firedReadEvent.current && maxRef.current >= READ_THRESHOLD) {
        firedReadEvent.current = true
        window.umami?.track('text-read', { text: title })
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
      persist()
    }
  }, [slug, title, computeProgress, persist])

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
