'use client'

/**
 * Mid-text navigation on phones (Feature Backlog card of the same name).
 *
 * On a phone a long text runs 70–95 screens, and every way off it used to sit
 * on screen 1 or after the last line. This adds one mechanism, template-wide:
 *
 *  - Past the frontispiece the site header slides away on scroll-down. While it
 *    is away a slim pill (position + ▾) stays at the top; its fill is progress
 *    through the CURRENT section, while the existing gold hairline along the top
 *    edge (ReadingProgressBar) keeps showing the whole text.
 *  - Scrolling up brings back a READING header in the site header's place:
 *    where the reader is ("§ ii of viii · 46 min left" / the section's name)
 *    and a visible label ("Contents ▾", "Next part ▾" or "Read next ▾"), with
 *    the site menu kept at its right.
 *  - Tapping either drops a sheet from the top: where you are, the contents
 *    (windowed when long), the collection (a next part always leads), Read
 *    next, and Home / Library.
 *  - After a jump from the contents, "← Back to ¶17" for a few seconds.
 *
 * The scroll behaviour runs below the `xl` breakpoint only, where the fixed
 * desktop contents rail is hidden; on a wide screen the header stays put. The
 * sheet itself opens at any width, from the frontispiece's trigger. Texts of
 * about five minutes or less get no running head (Keith, 2 Nov 2026): their
 * sheet opens from screen 1 only, and their end-of-text links are near anyway.
 *
 * Everything the reader sees is decided in lib/reader/outline.ts; this file
 * measures scroll and renders. All per-reader state is client-side, so the page
 * stays cacheable for its week. Motion is off under prefers-reduced-motion.
 *
 * Analytics (CLAUDE.md, "Analytics"): every link carries `from`; opening the
 * sheet fires `text-sheet-open`, a contents jump fires `text-jump`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MobileNav } from './MobileNav'
import {
  entryNumber, minutesLeft as minutesLeftAt, positionLabel, runningLabel, sheetLabel, wherePhrase, windowContents,
  type Outline,
} from '@/lib/reader/outline'

/** The frontispiece trigger asks the sheet to open with this window event. */
export const OPEN_EVENT = 'stromata:reader-nav-open'

export type NavText = { slug: string; title: string; authorName: string | null; kind?: string }
export type NavCollection = {
  title: string
  slug: string
  part: number
  total: number
  prev: NavText | null
  next: NavText | null
}

type Props = {
  slug: string
  title: string
  minutes: number
  runningHead: boolean
  outline: Outline
  collection: NavCollection | null
  readNext: NavText[]
}

const HEADER = 64
const BACK_MS = 7000
const WIDE = '(min-width: 1280px)' // Tailwind `xl`: the desktop contents rail takes over

type Mode = 'top' | 'hidden' | 'shown'

export function ReaderNav({ slug, title, minutes, runningHead, outline, collection, readNext }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode>('top')
  const [active, setActive] = useState(false) // running head live: long text, narrow screen
  const [current, setCurrent] = useState(-1)
  const [fraction, setFraction] = useState(0)
  const [sectionFraction, setSectionFraction] = useState(0)
  const [back, setBack] = useState<{ y: number; label: string } | null>(null)
  const [reduceMotion, setReduceMotion] = useState(false)

  const pillRef = useRef<HTMLButtonElement>(null)
  const pillLabelRef = useRef<HTMLSpanElement>(null)
  const headLabelRef = useRef<HTMLSpanElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const animatedIndex = useRef<number | null>(null)
  const lastY = useRef(0)
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const n = outline.entries.length
  const place = collection ? { title: collection.title, part: collection.part, total: collection.total } : null
  const label = sheetLabel({ hasContents: n > 1, hasNextPart: !!collection?.next, hasReadNext: readNext.length > 0 })

  // ── open / close ────────────────────────────────────────────────────────────
  const openSheet = useCallback(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    setOpen(true)
  }, [])
  const closeSheet = useCallback(() => {
    setOpen(false)
    setExpanded(false)
    openerRef.current?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const onOpen = () => openSheet()
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [openSheet])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the sheet so a screen reader lands in it and Escape works at once.
    sheetRef.current?.focus({ preventScroll: true })
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, closeSheet])

  // ── the running head: only for long texts on narrow screens ────────────────
  useEffect(() => {
    if (!runningHead) return
    const mq = window.matchMedia(WIDE)
    const update = () => setActive(!mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [runningHead])

  // The site header steps aside whenever the reader is past the frontispiece.
  useEffect(() => {
    const header = document.getElementById('site-header')
    if (!header) return
    header.style.transition = reduceMotion ? 'none' : 'transform var(--dur-slow) var(--ease)'
    header.style.transform = active && mode !== 'top' ? 'translateY(-110%)' : ''
    return () => { header.style.transform = '' }
  }, [active, mode, reduceMotion])

  // Elements the contents point at, found once the body is on screen. An entry
  // whose element is missing is skipped by the scroll tracker, not shown wrong.
  const [targets, setTargets] = useState<(HTMLElement | null)[]>([])
  useEffect(() => {
    setTargets(outline.entries.map(e => document.getElementById(e.id)))
  }, [outline])

  useEffect(() => {
    const article = document.querySelector<HTMLElement>('#reader-main article')
    const front = document.querySelector<HTMLElement>('.frontispiece')
    if (!article) return
    let raf = 0
    const tick = () => {
      raf = 0
      const y = window.scrollY
      const delta = y - lastY.current
      lastY.current = y

      const top = article.getBoundingClientRect().top + y
      const f = (y + window.innerHeight * 0.3 - top) / Math.max(article.offsetHeight, 1)
      setFraction(Math.min(Math.max(f, 0), 1))

      let idx = -1
      targets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= HEADER + 24) idx = i })
      setCurrent(idx)
      if (idx >= 0) {
        const start = targets[idx]!.getBoundingClientRect().top + y
        const nextEl = targets.slice(idx + 1).find(Boolean)
        const end = nextEl ? nextEl.getBoundingClientRect().top + y : article.getBoundingClientRect().bottom + y
        setSectionFraction(Math.min(Math.max((y + HEADER + 24 - start) / Math.max(end - start, 1), 0), 1))
      }

      if (!active) return
      const threshold = front ? front.getBoundingClientRect().bottom + y - HEADER : 0
      if (y < threshold) { setMode('top'); return }
      if (delta > 6) setMode(m => (m === 'top' || m === 'shown' ? 'hidden' : m))
      else if (delta < -6) setMode('shown')
      else setMode(m => (m === 'top' ? 'hidden' : m))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    window.addEventListener('scroll', onScroll, { passive: true })
    tick()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [targets, active])

  // Crossing into a new section: the name slides in and the pill's keyline glows,
  // rather than the text blinking from one name to the next.
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
    pillLabelRef.current?.animate?.(slide, timing)
    headLabelRef.current?.animate?.(slide, timing)
    pillRef.current?.animate?.(
      [{ borderColor: 'var(--gold)', transform: 'translateX(-50%) scale(1.06)' }, { borderColor: 'var(--gold-rule)', transform: 'translateX(-50%) scale(1)' }],
      { duration: 520, easing: 'cubic-bezier(.2,.6,.2,1)' },
    )
  }, [current, reduceMotion])

  const jump = useCallback((i: number) => {
    const el = targets[i] ?? document.getElementById(outline.entries[i].id)
    if (!el) return
    // Name the paragraph the reader is leaving, for "Back to ¶17".
    const y = window.scrollY
    let pnum: string | null = null
    for (const p of Array.from(document.querySelectorAll<HTMLElement>('#reader-main article [data-pnum]'))) {
      if (p.getBoundingClientRect().top > HEADER + 24) break
      pnum = p.dataset.pnum ?? pnum
    }
    setOpen(false)
    setExpanded(false)
    requestAnimationFrame(() => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER - 16, behavior: reduceMotion ? 'auto' : 'smooth' })
      setBack({ y, label: pnum ? `Back to ¶${pnum}` : 'Back to where you were' })
      if (backTimer.current) clearTimeout(backTimer.current)
      backTimer.current = setTimeout(() => setBack(null), BACK_MS)
    })
  }, [targets, outline, reduceMotion])

  if (!label) return null

  const left = minutesLeftAt(minutes, fraction)
  const position = positionLabel(outline, current, place)
  const running = runningLabel(outline, current, place, title)
  const showHead = active && mode === 'shown' && !open
  const showPill = active && mode === 'hidden' && !open
  const rows = windowContents(n, current, expanded)
  const smallcaps = { fontFamily: 'var(--serif-smallcaps)', fontVariant: 'all-small-caps' as const, letterSpacing: '0.06em' }
  const where = `${position ? `${position} · ` : ''}${left} min left`

  // Keith, 29 Oct: in a collection, the next part always leads.
  const leads: { from: 'text-sheet-next' | 'text-sheet-read-next'; kicker: string; text: NavText }[] = []
  if (collection?.next) leads.push({ from: 'text-sheet-next', kicker: `Next in ${collection.title}`, text: collection.next })
  readNext.slice(0, 3).forEach((t, i) => leads.push({ from: 'text-sheet-read-next', kicker: i === 0 && !leads.length ? 'Read next' : 'Or', text: t }))

  return (
    <>
      {/* The reading header, in the site header's place mid-text. Sits just under
          the progress hairline (z 50) so that line still runs along its top edge. */}
      {active && (
        <div
          aria-hidden={!showHead}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: HEADER, zIndex: 49,
            background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
            transform: showHead ? 'translateY(0)' : 'translateY(-110%)',
            transition: reduceMotion ? 'none' : 'transform var(--dur-slow) var(--ease)',
          }}
          className="flex items-center gap-3 pl-6 pr-8"
        >
          <button
            type="button"
            tabIndex={showHead ? 0 : -1}
            onClick={openSheet}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`${where}. ${running}. Open ${label.toLowerCase()}.`}
            className="min-w-0 flex-1 h-full flex items-center gap-3 text-left"
            data-umami-event="text-sheet-open"
            data-umami-event-from="text-running-head"
            data-umami-event-text={slug}
            data-umami-event-state="header"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm" style={{ ...smallcaps, color: 'var(--ink-mute)' }}>{where}</span>
              <span ref={headLabelRef} className="block truncate font-serif italic" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)' }}>{running}</span>
            </span>
            <span className="shrink-0 font-serif" style={{ color: 'var(--gold-ink)', fontSize: 'var(--text-sm)' }}>{label} ▾</span>
          </button>
          <span className="shrink-0 h-6 sm:hidden" style={{ borderLeft: '1px solid var(--rule)' }} aria-hidden />
          <MobileNav />
        </div>
      )}

      {/* While the header is away, the slim pill keeps the way on in sight. Its fill is
          progress through the current section; with no contents, through the text. */}
      {showPill && (
        <button
          ref={pillRef}
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          aria-label={`${where}. ${running}. Open ${label.toLowerCase()}.`}
          data-umami-event="text-sheet-open"
          data-umami-event-from="text-running-head"
          data-umami-event-text={slug}
          data-umami-event-state="pill"
          style={{
            position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 54,
            background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
            overflow: 'hidden', maxWidth: 'calc(100vw - 96px)', minHeight: 32,
          }}
          className="rounded-full font-serif text-xs"
        >
          {/* The tap area is the full 44px even though the pill draws at 32. */}
          <span aria-hidden className="absolute" style={{ inset: '-6px -4px' }} />
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0, width: `${(current >= 0 ? sectionFraction : fraction) * 100}%`,
              background: 'var(--gold-rule)', opacity: 0.45,
              transition: reduceMotion ? 'none' : 'width 240ms linear',
            }}
          />
          <span className="relative flex items-center gap-2 whitespace-nowrap px-3 py-1.5" style={{ color: 'var(--ink)' }}>
            <span ref={pillLabelRef} style={{ ...smallcaps, color: 'var(--ink-mute)' }}>{position ?? `${left} min left`}</span>
            <span style={{ color: 'var(--gold-ink)' }}>▾</span>
          </span>
        </button>
      )}

      {back && !open && (
        <button
          type="button"
          onClick={() => { window.scrollTo({ top: back.y, behavior: reduceMotion ? 'auto' : 'smooth' }); setBack(null) }}
          style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '1.5rem', zIndex: 56, minHeight: 44,
            background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)', color: 'var(--ink)',
          }}
          className="rounded-full px-4 font-serif text-sm"
        >
          ← {back.label}
        </button>
      )}

      {/* Scrim + sheet. Always mounted so the sheet can slide: down on open with the
          long soft ease-out iOS uses for sheets, back up a little faster on close;
          `visibility` waits for the slide to finish before hiding it from taps and focus. */}
      <div
        aria-hidden
        onClick={closeSheet}
        style={{
          position: 'fixed', inset: 0, zIndex: 57, background: 'var(--hero-ground)',
          opacity: open ? 0.32 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: reduceMotion ? 'none' : `opacity ${open ? 420 : 320}ms ease`,
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${label}: ${title}`}
        aria-hidden={!open}
        tabIndex={-1}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 58, maxHeight: 'calc(100dvh - 72px)', overflowY: 'auto',
          background: 'var(--vellum)', borderBottom: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
          transform: open ? 'translateY(0)' : 'translateY(-104%)',
          visibility: open ? 'visible' : 'hidden',
          transition: reduceMotion ? 'none'
            : open ? 'transform 460ms cubic-bezier(.32,.72,0,1), visibility 0s'
            : 'transform 340ms cubic-bezier(.32,.72,0,1), visibility 0s linear 340ms',
          outline: 'none',
        }}
        className="px-6 pt-4 pb-6"
      >
        <div className="mx-auto" style={{ maxWidth: '36rem' }}>
          <div className="flex items-center justify-between gap-4">
            <p className="kicker-gold">Where you are</p>
            <button type="button" onClick={closeSheet} className="font-serif text-sm px-2 -mr-2" style={{ color: 'var(--ink-mute)', minHeight: 44 }}>
              Close ✕
            </button>
          </div>
          <p className="font-serif italic" style={{ color: 'var(--ink)', fontSize: '1.1rem', lineHeight: 1.3 }}>{title}</p>
          <p className="font-serif text-sm mt-1 line-clamp-2" style={{ color: 'var(--ink-mute)' }}>
            {n > 1 && current >= 0 ? running : wherePhrase(fraction)} · {left} min left
          </p>
          <div className="mt-2" style={{ height: 2, background: 'var(--rule-soft)' }}>
            <div style={{ height: 2, width: `${fraction * 100}%`, background: 'var(--gold)' }} />
          </div>

          {/* A collection's next part, else Read next, leads — above the contents when
              the text has none, below them when it does (the label names the leader). */}
          {n <= 1 && <Leads leads={leads} />}

          {n > 1 && (
            <div className="mt-6">
              <p className="kicker">{outline.kind === 'sections' ? 'Sections' : 'Contents'}</p>
              <ol className="mt-1">
                {rows.map(r => r.kind === 'fold' ? (
                  <li key={`fold-${r.from}`}>
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="font-serif text-sm w-full text-left"
                      style={{ color: 'var(--ink-mute)', minHeight: 44, paddingLeft: 'calc(0.75rem + 2px)' }}
                    >
                      ⋯ {entryNumber(outline.kind, r.from)}–{entryNumber(outline.kind, r.to)}
                    </button>
                  </li>
                ) : (
                  <li key={outline.entries[r.i].id + r.i}>
                    <button
                      type="button"
                      onClick={() => jump(r.i)}
                      aria-current={r.i === current ? 'location' : undefined}
                      className="w-full text-left font-serif flex items-baseline gap-3 py-2"
                      style={{
                        minHeight: 44,
                        color: r.i === current ? 'var(--ink)' : r.i < current ? 'var(--ink-mute)' : 'var(--ink-soft)',
                        borderLeft: r.i === current ? '2px solid var(--gold)' : '2px solid transparent',
                        paddingLeft: '0.75rem',
                      }}
                      data-umami-event="text-jump"
                      data-umami-event-from="text-sheet-contents"
                      data-umami-event-text={slug}
                      data-umami-event-state={outline.kind}
                    >
                      {/* Editorial sections count in roman, with a section mark; the
                          author's chapters in arabic. Keith, 2 Nov 2026. */}
                      <span
                        className="shrink-0 text-sm"
                        style={{ ...(outline.kind === 'sections' ? smallcaps : {}), color: 'var(--gold-ink)', minWidth: '2rem' }}
                      >
                        {outline.kind === 'sections' ? `§ ${entryNumber('sections', r.i)}` : entryNumber('headings', r.i)}
                      </span>
                      <span className={r.i === current ? '' : 'line-clamp-2'}>{outline.entries[r.i].label}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {outline.kind === 'sections' && (
                <p className="font-serif text-sm mt-2 italic" style={{ color: 'var(--ink-mute)' }}>
                  Section titles are the editor&rsquo;s; they are not part of the original text.
                </p>
              )}
            </div>
          )}

          {n > 1 && <Leads leads={leads} />}

          {collection && (
            <div className="mt-6">
              <p className="kicker">{collection.title} · Part {collection.part} of {collection.total}</p>
              {collection.prev && (
                <Link
                  href={`/texts/${collection.prev.slug}`}
                  className="flex items-center font-serif"
                  style={{ color: 'var(--ink-soft)', minHeight: 44 }}
                  data-umami-event="text-open"
                  data-umami-event-from="text-sheet-prev"
                  data-umami-event-text={collection.prev.slug}
                >
                  ← {collection.prev.title}
                </Link>
              )}
              <Link
                href={`/collections/${collection.slug}`}
                className="flex items-center font-serif"
                style={{ color: 'var(--accent)', minHeight: 44 }}
                data-umami-event="collection-open"
                data-umami-event-from="text-sheet"
                data-umami-event-collection={collection.slug}
              >
                All {collection.total} parts →
              </Link>
            </div>
          )}

          <div className="mt-6 pt-2 flex items-center justify-between gap-4 border-t" style={{ borderColor: 'var(--rule)' }}>
            <button
              type="button"
              onClick={() => { closeSheet(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }) }}
              className="font-serif text-sm"
              style={{ color: 'var(--ink-mute)', minHeight: 44 }}
            >
              Back to the beginning ↑
            </button>
            <span className="font-serif text-sm flex gap-5">
              <Link href="/" className="flex items-center" style={{ color: 'var(--accent)', minHeight: 44 }}>Home</Link>
              <Link href="/texts" className="flex items-center" style={{ color: 'var(--accent)', minHeight: 44 }}>Library</Link>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

function Leads({ leads }: { leads: { from: string; kicker: string; text: NavText }[] }) {
  if (!leads.length) return null
  return (
    <div className="mt-6">
      {leads.map((l, i) => (
        <div key={`${l.from}-${l.text.slug}`} className={i === 0 ? '' : 'mt-1'}>
          {(i === 0 || l.kicker !== 'Or') && <p className={i === 0 ? 'kicker-gold' : 'kicker mt-3'}>{l.kicker}</p>}
          <Link
            href={`/texts/${l.text.slug}`}
            className={`flex flex-col justify-center font-serif ${i === 0 ? 'italic' : ''}`}
            style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)', fontSize: i === 0 ? '1.1rem' : undefined, minHeight: 44 }}
            data-umami-event="text-open"
            data-umami-event-from={l.from}
            data-umami-event-text={l.text.slug}
            {...(l.text.kind ? { 'data-umami-event-pick': l.text.kind } : {})}
          >
            <span>{l.text.title} →</span>
            {l.text.authorName && (
              <span className="not-italic text-sm" style={{ color: 'var(--ink-mute)' }}>{l.text.authorName}</span>
            )}
          </Link>
        </div>
      ))}
    </div>
  )
}

/**
 * The frontispiece's trigger ("Contents (8) ▾", "Part 24 of 24 ▾"): asks the
 * sheet to open. A button, not a link: Umami intercepts tracked links to send
 * the beacon before navigating, which would turn a fragment link into a jump.
 */
export function ReaderNavTrigger({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-haspopup="dialog"
      className="font-serif not-italic hover:opacity-70 transition-opacity"
      style={{ color: 'var(--on-dark-gold)', minHeight: 44 }}
      data-umami-event="text-sheet-open"
      data-umami-event-from="text-hero-contents"
      data-umami-event-text={slug}
    >
      {children}
    </button>
  )
}
