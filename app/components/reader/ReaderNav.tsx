'use client'

/**
 * ReaderNav — mid-text navigation on phones.
 *
 * Past the frontispiece the site header steps aside on scroll-down; scrolling
 * up brings back a READING header (where you are, with the site menu kept at
 * its right); while it is away a slim pill stays at the top. Either opens a
 * sheet that drops from the top with the contents, the collection, Read next,
 * and a way Home. Keith's decisions, 29 Oct 2026 (backlog card "Mid-text
 * navigation on phones"; prototype PR #170). What to show is decided in
 * lib/reader/outline.ts; this component measures scroll and renders.
 *
 * Phones and tablets only (below 1024px): desktop keeps its header and its
 * fixed contents margin. All motion is off under prefers-reduced-motion.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MobileNav } from '@/app/components/MobileNav'
import { blockKey } from '@/scripts/lib/sections.mjs'
import {
  contentsRows,
  leads as orderLeads,
  minutesLeft as minutesLeftOf,
  navLabel,
  positionLabel,
  wherePhrase,
  type CollectionPosition,
  type Outline,
  type ReadNextLink,
} from '@/lib/reader/outline'

/** Fired by the frontispiece's "Contents ▾" (OpenReaderNav) to open the sheet. */
export const OPEN_EVENT = 'stromata:reader-nav-open'

const HEADER = 64
const BACK_MS = 7000
const PHONE_QUERY = '(max-width: 1023px)'

type Props = {
  slug: string
  title: string
  minutes: number
  outline: Outline
  collection: CollectionPosition | null
  readNext: ReadNextLink[]
}

type Track = (event: string, data: Record<string, string | number>) => void
const track: Track = (event, data) => (window as unknown as { umami?: { track: Track } }).umami?.track(event, data)

/** The element an outline entry points at, if the page still has it. */
function findTarget(entry: Outline['entries'][number], article: HTMLElement | null): HTMLElement | null {
  if (entry.target.type === 'id') return document.getElementById(entry.target.id)
  if (!article) return null
  const want = blockKey(entry.target.startsWith)
  // Paragraphs and list items: a numbered sermon renders as one <ol> of <li>s.
  return Array.from(article.querySelectorAll<HTMLElement>('li, p')).find(el => blockKey(el.textContent ?? '').startsWith(want)) ?? null
}

export default function ReaderNav({ slug, title, minutes, outline, collection, readNext }: Props) {
  const [phone, setPhone] = useState(false)
  const [targets, setTargets] = useState<(HTMLElement | null)[]>([])
  const [mode, setMode] = useState<'top' | 'hidden' | 'shown'>('top')
  const [current, setCurrent] = useState(-1)
  const [fraction, setFraction] = useState(0)
  const [sectionFraction, setSectionFraction] = useState(0)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [back, setBack] = useState<number | null>(null)
  const [reduceMotion, setReduceMotion] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)
  const pillLabelRef = useRef<HTMLSpanElement>(null)
  const headLabelRef = useRef<HTMLSpanElement>(null)
  const animatedIndex = useRef<number | null>(null)
  const lastY = useRef(0)
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSheet = useCallback((from: string) => {
    setOpen(true)
    track('text-sheet-open', { from, text: slug })
  }, [slug])

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const update = () => setPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const article = document.querySelector<HTMLElement>('#reader-main article')
    setTargets(outline.entries.map(e => findTarget(e, article)))
    const onOpen = (e: Event) => openSheet((e as CustomEvent<{ from?: string }>).detail?.from ?? 'text-hero-contents')
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [outline, openSheet])

  // The site header steps aside whenever the reader is past the frontispiece
  // (globals.css: html[data-reader-chrome="away"] .site-header).
  useEffect(() => {
    const root = document.documentElement
    if (phone && mode !== 'top') root.dataset.readerChrome = 'away'
    else delete root.dataset.readerChrome
    return () => { delete root.dataset.readerChrome }
  }, [phone, mode])

  useEffect(() => {
    if (!phone) return
    const article = document.querySelector<HTMLElement>('#reader-main article')
    const front = document.querySelector<HTMLElement>('.frontispiece')
    let raf = 0
    const tick = () => {
      raf = 0
      const y = window.scrollY
      const delta = y - lastY.current
      lastY.current = y

      if (article) {
        const top = article.getBoundingClientRect().top + y
        setFraction(Math.min(Math.max((y + window.innerHeight * 0.3 - top) / article.offsetHeight, 0), 1))
      }
      let idx = -1
      targets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= HEADER + 24) idx = i })
      setCurrent(idx)

      // The pill fills with progress through the CURRENT section; the bar along
      // the top edge (ReadingProgressBar) shows the whole text.
      const start = idx >= 0 ? targets[idx] : null
      if (start && article) {
        const s = start.getBoundingClientRect().top + y
        const next = targets.slice(idx + 1).find(Boolean)
        const e = next ? next.getBoundingClientRect().top + y : article.getBoundingClientRect().bottom + y
        setSectionFraction(Math.min(Math.max((y + HEADER + 24 - s) / Math.max(e - s, 1), 0), 1))
      }

      if (!front || front.getBoundingClientRect().bottom > HEADER) { setMode('top'); return }
      if (delta > 6) setMode(m => (m === 'top' || m === 'shown' ? 'hidden' : m))
      else if (delta < -6) setMode('shown')
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    window.addEventListener('scroll', onScroll, { passive: true })
    tick()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [phone, targets])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  // Crossing into a new section: the new name slides in and the pill's keyline
  // glows gold for a moment, instead of the text blinking from one name to the next.
  useEffect(() => {
    if (animatedIndex.current === null || reduceMotion) { animatedIndex.current = current; return }
    if (animatedIndex.current === current) return
    const down = current > animatedIndex.current
    animatedIndex.current = current
    const slide = [
      { opacity: 0, transform: `translateY(${down ? 8 : -8}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ]
    const timing = { duration: 320, easing: 'cubic-bezier(.2,.6,.2,1)' }
    pillLabelRef.current?.animate(slide, timing)
    headLabelRef.current?.animate(slide, timing)
    pillRef.current?.animate(
      [{ borderColor: 'var(--gold)', transform: 'translateX(-50%) scale(1.06)' }, { borderColor: 'var(--gold-rule)', transform: 'translateX(-50%) scale(1)' }],
      { duration: 520, easing: 'cubic-bezier(.2,.6,.2,1)' },
    )
  }, [current, reduceMotion])

  const jump = useCallback((index: number) => {
    const el = targets[index]
    if (!el) return
    const from = window.scrollY
    setOpen(false)
    setExpanded(false)
    track('text-jump', { from: 'text-sheet', text: slug, state: outline.kind })
    requestAnimationFrame(() => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER - 16, behavior: reduceMotion ? 'auto' : 'smooth' })
      setBack(from)
      if (backTimer.current) clearTimeout(backTimer.current)
      backTimer.current = setTimeout(() => setBack(null), BACK_MS)
    })
  }, [targets, slug, outline.kind, reduceMotion])

  if (!phone) return null

  const entries = outline.entries
  const n = entries.length
  const left = minutesLeftOf(minutes, fraction)
  const position = positionLabel(outline.kind, current, n, collection)
  const label = (current >= 0 ? entries[current]?.label : null) ?? collection?.title ?? title
  const action = navLabel(outline, collection)
  const showBar = mode === 'shown' && !open
  const rows = contentsRows(n, current, expanded)
  const ways = orderLeads(collection, readNext)
  const smallcaps = { fontFamily: 'var(--serif-smallcaps)', fontVariant: 'all-small-caps' as const, letterSpacing: '0.06em' }
  const ease = reduceMotion ? 'none' : 'transform var(--dur-slow) var(--ease)'

  return (
    <>
      {/* The reading header, in the site header's place mid-text. The site menu
          stays at its right, so the reader can always leave the text. */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: HEADER, zIndex: 55,
          background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
          transform: showBar ? 'translateY(0)' : 'translateY(-110%)', transition: ease,
        }}
        className="flex items-center gap-3 pl-6 pr-8"
        aria-hidden={!showBar}
      >
        <button
          type="button"
          onClick={() => openSheet('text-running-head')}
          tabIndex={showBar ? 0 : -1}
          aria-expanded={open}
          aria-label={`Where you are: ${label}. Open ${action.toLowerCase()}.`}
          className="min-w-0 flex-1 h-full flex items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" style={{ ...smallcaps, color: 'var(--ink-mute)' }}>
              {position ? `${position} · ${left} min left` : `${left} min left`}
            </span>
            <span ref={headLabelRef} className="block truncate font-serif italic" style={{ color: 'var(--ink)', fontSize: '1.02rem' }}>{label}</span>
          </span>
          <span className="shrink-0 font-serif" style={{ color: 'var(--gold-ink)', fontSize: '0.95rem' }}>{action} ▾</span>
        </button>
        <span className="shrink-0 h-6" style={{ borderLeft: '1px solid var(--rule)' }} aria-hidden />
        <MobileNav />
      </div>

      {/* The slim pill, while the header is away: the position and a caret, filled
          with the progress through the current section. */}
      {mode === 'hidden' && !open && (
        <button
          ref={pillRef}
          type="button"
          onClick={() => openSheet('text-pill')}
          aria-label={`Where you are: ${label}. Open ${action.toLowerCase()}.`}
          style={{
            position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 54,
            background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
            overflow: 'hidden', maxWidth: 'calc(100vw - 96px)', minHeight: 28,
          }}
          className="rounded-full font-serif text-xs"
        >
          <span
            key={current}
            aria-hidden
            style={{
              position: 'absolute', inset: 0, width: `${(n > 1 && current >= 0 ? sectionFraction : fraction) * 100}%`,
              background: 'var(--gold-rule)', opacity: 0.45, transition: reduceMotion ? 'none' : 'width 240ms linear',
            }}
          />
          <span className="relative flex items-center gap-2 whitespace-nowrap px-3 py-1" style={{ color: 'var(--ink)' }}>
            <span ref={pillLabelRef} style={{ ...smallcaps, color: 'var(--ink-mute)' }}>{position ?? `${left} min left`}</span>
            <span style={{ color: 'var(--gold-ink)' }} aria-hidden>▾</span>
          </span>
        </button>
      )}

      {back !== null && !open && (
        <button
          type="button"
          onClick={() => { window.scrollTo({ top: back, behavior: reduceMotion ? 'auto' : 'smooth' }); setBack(null) }}
          style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '1.5rem', zIndex: 56, background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)', color: 'var(--ink)' }}
          className="rounded-full px-4 py-2 font-serif text-sm"
        >
          ← Back to where you were
        </button>
      )}

      {/* The sheet stays mounted so it can slide: down with the soft ease-out iOS
          uses for sheets, back up a little faster. `visibility` waits for the slide
          to finish before hiding it from taps and focus. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 57, background: 'var(--hero-ground)',
          opacity: open ? 0.32 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: reduceMotion ? 'none' : `opacity ${open ? 420 : 320}ms ease`,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contents and next reading"
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 58, maxHeight: 'calc(100dvh - 72px)', overflowY: 'auto',
          background: 'var(--vellum)', borderBottom: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
          transform: open ? 'translateY(0)' : 'translateY(-104%)',
          visibility: open ? 'visible' : 'hidden',
          transition: reduceMotion ? 'none'
            : open ? 'transform 460ms cubic-bezier(.32,.72,0,1), visibility 0s'
            : 'transform 340ms cubic-bezier(.32,.72,0,1), visibility 0s linear 340ms',
        }}
        className="px-6 pt-5 pb-6"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="kicker-gold">Where you are</p>
          <button type="button" onClick={() => setOpen(false)} className="font-serif text-sm py-2 -my-2" style={{ color: 'var(--ink-mute)' }}>Close ✕</button>
        </div>
        <p className="font-serif italic mt-2" style={{ color: 'var(--ink)', fontSize: '1.1rem', lineHeight: 1.3 }}>{title}</p>
        <p className="font-serif text-sm mt-1" style={{ color: 'var(--ink-mute)' }}>{wherePhrase(fraction)} · {left} min left</p>
        <div className="mt-2" style={{ height: 2, background: 'var(--rule-soft)' }}>
          <div style={{ height: 2, width: `${fraction * 100}%`, background: 'var(--gold)' }} />
        </div>

        {n > 1 && (
          <div className="mt-6">
            <p className="kicker">Contents</p>
            <ol className="mt-2">
              {rows.map(r => r.kind === 'fold' ? (
                <li key={`fold-${r.from}`}>
                  <button type="button" onClick={() => setExpanded(true)} className="font-serif text-sm py-2" style={{ color: 'var(--ink-mute)' }}>
                    Show {r.from + 1}–{r.to + 1} ▾
                  </button>
                </li>
              ) : (
                <li key={r.index}>
                  <button
                    type="button"
                    onClick={() => jump(r.index)}
                    disabled={!targets[r.index]}
                    className="w-full text-left font-serif py-2 flex gap-3 disabled:opacity-50"
                    style={{
                      color: r.index === current ? 'var(--ink)' : r.index < current ? 'var(--ink-mute)' : 'var(--ink-soft)',
                      borderLeft: r.index === current ? '2px solid var(--gold)' : '2px solid transparent',
                      paddingLeft: '0.75rem',
                    }}
                  >
                    <span className="shrink-0 text-sm" style={{ ...smallcaps, color: 'var(--gold-ink)', minWidth: '1.6rem' }}>{r.index + 1}</span>
                    <span className={r.index === current ? '' : 'line-clamp-2'}>{entries[r.index].label}</span>
                  </button>
                </li>
              ))}
            </ol>
            {outline.kind === 'sections' && (
              <p className="font-serif text-sm mt-2" style={{ color: 'var(--ink-mute)' }}>Section titles are the editor&apos;s; they are not part of the original text.</p>
            )}
          </div>
        )}

        {collection && (
          <div className="mt-6">
            <p className="kicker">{collection.title} · Part {collection.part} of {collection.total}</p>
            {collection.prev && (
              <Link
                href={`/texts/${collection.prev.slug}`}
                className="block font-serif py-2"
                style={{ color: 'var(--ink-soft)' }}
                data-umami-event="text-open" data-umami-event-from="text-sheet"
                data-umami-event-text={collection.prev.slug} data-umami-event-pick="prev-part"
              >
                ← {collection.prev.title}
              </Link>
            )}
            <Link
              href={`/collections/${collection.slug}`}
              className="block font-serif py-2"
              style={{ color: 'var(--accent)' }}
              data-umami-event="collection-open" data-umami-event-from="text-sheet"
              data-umami-event-collection={collection.slug}
            >
              All {collection.total} parts →
            </Link>
          </div>
        )}

        {ways.length > 0 && (
          <div className="mt-6">
            {ways.map((w, i) => (
              <div key={w.slug} className={i === 0 ? '' : 'mt-2'}>
                {w.kicker !== 'or' && (
                  <p className="kicker-gold">{w.kicker === 'next-part' ? `Next in ${collection?.title ?? 'this collection'}` : 'Read next'}</p>
                )}
                {w.kicker === 'or' && i === 1 && <p className="kicker">Or</p>}
                <Link
                  href={`/texts/${w.slug}`}
                  className={`block font-serif ${i === 0 ? 'italic mt-1' : 'py-1'}`}
                  style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)', fontSize: i === 0 ? '1.1rem' : undefined }}
                  data-umami-event="text-open" data-umami-event-from="text-sheet"
                  data-umami-event-text={w.slug} data-umami-event-pick={w.pick}
                >
                  {w.title} →
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 flex items-center justify-between gap-4 border-t" style={{ borderColor: 'var(--rule)' }}>
          <button
            type="button"
            onClick={() => { setOpen(false); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }) }}
            className="font-serif text-sm py-2"
            style={{ color: 'var(--ink-mute)' }}
          >
            Back to the beginning ↑
          </button>
          <span className="font-serif text-sm flex gap-4">
            <Link href="/" className="py-2" style={{ color: 'var(--accent)' }}>Home</Link>
            <Link href="/texts" className="py-2" style={{ color: 'var(--accent)' }}>Library</Link>
          </span>
        </div>
      </div>
    </>
  )
}
