'use client'

/**
 * The behaviour half of /design/reader-nav. It reads everything it needs from
 * the real reader page already on screen (frontispiece, body, headings,
 * collection links, Read next) so the prototype carries no copy of that data.
 * Prototype quality: no analytics, no persistence, phones first.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MobileNav } from '@/app/components/MobileNav'

export type PrototypeSection = { label: string; startsWith: string }

type Entry = { label: string; el: HTMLElement }
type LinkInfo = { href: string; title: string; byline?: string }
type Collection = { title: string; href: string; part: number; total: number; prev?: LinkInfo; next?: LinkInfo }
type Page = {
  title: string
  minutes: number
  entries: Entry[]
  kind: 'sections' | 'headings' | 'none'
  collection: Collection | null
  readNext: LinkInfo[]
  threshold: number
}

const HEADER = 64
const WINDOW_OVER = 9 // longer contents are windowed: first, fold, current ±2, fold
const REVEAL_MS = 2200
const BACK_MS = 7000

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/[←→]/g, '').trim()

function readPage(sections: PrototypeSection[] | null): Page | null {
  const article = document.querySelector<HTMLElement>('#reader-main article')
  const front = document.querySelector<HTMLElement>('.frontispiece')
  if (!article || !front) return null

  const title = clean(document.querySelector('h1')?.textContent) || document.title
  const minutes = Number(/Approx\.\s*(\d+)\s*min/.exec(front.textContent ?? '')?.[1] ?? 0)

  let entries: Entry[] = []
  let kind: Page['kind'] = 'none'
  if (sections) {
    const blocks = Array.from(article.querySelectorAll<HTMLElement>('li, p'))
    entries = sections.flatMap(s => {
      const el = blocks.find(b => clean(b.textContent).startsWith(s.startsWith))
      return el ? [{ label: s.label, el }] : []
    })
    if (entries.length > 1) kind = 'sections'
  }
  if (kind === 'none') {
    // The position already gives the number, so "Chapter 14." would only repeat it.
    const unnumbered = (s: string) => s.replace(/^(chapter|book|part)\s+[\divxlc]+\.?\s*/i, '') || s
    entries = Array.from(article.querySelectorAll<HTMLElement>('h2[id], h3[id]')).map(el => ({ label: unnumbered(clean(el.textContent)), el }))
    kind = entries.length > 1 ? 'headings' : 'none'
  }

  let collection: Collection | null = null
  const cLink = front.querySelector<HTMLAnchorElement>('a[href^="/collections/"]')
  const m = cLink && /^(.*)\(Part (\d+) of (\d+)\)/.exec(clean(cLink.textContent))
  if (cLink && m) {
    const nav = (dir: string): LinkInfo | undefined => {
      const a = document.querySelector<HTMLAnchorElement>(`a[data-umami-event="collection-nav"][data-umami-event-direction="${dir}"]`)
      if (!a) return undefined
      const spans = Array.from(a.querySelectorAll('span')).map(s => clean(s.textContent)).filter(Boolean)
      return { href: a.getAttribute('href') ?? '#', title: spans.find(t => !/^(previous|next)$/i.test(t)) ?? clean(a.textContent) }
    }
    collection = { title: m[1].trim(), href: cLink.getAttribute('href') ?? '#', part: Number(m[2]), total: Number(m[3]), prev: nav('prev'), next: nav('next') }
  }

  const readNext = Array.from(document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Read next"] a[href^="/texts/"]'))
    .reduce<LinkInfo[]>((acc, a) => {
      const href = a.getAttribute('href') ?? '#'
      if (acc.some(x => x.href === href)) return acc
      const t = clean(a.querySelector('.italic')?.textContent) || clean(a.textContent).split(' · ')[0]
      return [...acc, { href, title: t }]
    }, [])
    .slice(0, 3)

  const threshold = front.getBoundingClientRect().bottom + window.scrollY - HEADER
  return { title, minutes, entries, kind, collection, readNext, threshold }
}

function wherePhrase(f: number) {
  if (f < 0.1) return 'Just begun'
  if (f > 0.85) return 'Near the end'
  if (f < 0.27) return 'About a fifth of the way through'
  if (f < 0.4) return 'About a third of the way through'
  if (f < 0.6) return 'About halfway through'
  return 'About two thirds of the way through'
}

export function ReaderNavPrototype({ sections }: { sections: PrototypeSection[] | null }) {
  const [page, setPage] = useState<Page | null>(null)
  const [mode, setMode] = useState<'top' | 'hidden' | 'shown'>('top')
  const [current, setCurrent] = useState(-1)
  const [fraction, setFraction] = useState(0)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [back, setBack] = useState<number | null>(null)
  const [reveal, setReveal] = useState(false)
  const [pill, setPill] = useState(true)
  const lastY = useRef(0)
  const lastIndex = useRef(-1)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealUntil = useRef(0)
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setReveal(q.get('reveal') === '1')
    setPill(q.get('pill') !== '0')
    // Let fonts and images settle before measuring the frontispiece.
    const t = setTimeout(() => setPage(readPage(sections)), 300)
    return () => clearTimeout(t)
  }, [sections])

  // The site header steps aside whenever the reader is past the frontispiece.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header')
    if (!header) return
    header.style.transition = 'transform var(--dur-slow) var(--ease)'
    header.style.transform = mode === 'top' ? '' : 'translateY(-110%)'
  }, [mode])

  useEffect(() => {
    if (!page) return
    const article = document.querySelector<HTMLElement>('#reader-main article')
    let raf = 0
    const tick = () => {
      raf = 0
      const y = window.scrollY
      const delta = y - lastY.current
      lastY.current = y

      if (article) {
        const top = article.getBoundingClientRect().top + y
        const f = (y + window.innerHeight * 0.3 - top) / article.offsetHeight
        setFraction(Math.min(Math.max(f, 0), 1))
      }
      let idx = -1
      page.entries.forEach((e, i) => { if (e.el.getBoundingClientRect().top <= HEADER + 24) idx = i })
      setCurrent(idx)

      if (y < page.threshold) { setMode('top'); lastIndex.current = idx; return }
      // A boundary reveal holds for REVEAL_MS even while the reader keeps scrolling down.
      const revealing = Date.now() < revealUntil.current
      if (delta > 6 && !revealing) setMode(m => (m === 'top' || m === 'shown' ? 'hidden' : m))
      else if (delta < -6) setMode('shown')

      if (reveal && idx !== lastIndex.current && idx > 0) {
        setMode('shown')
        revealUntil.current = Date.now() + REVEAL_MS
        if (revealTimer.current) clearTimeout(revealTimer.current)
        revealTimer.current = setTimeout(() => setMode(m => (m === 'shown' ? 'hidden' : m)), REVEAL_MS)
      }
      lastIndex.current = idx
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    window.addEventListener('scroll', onScroll, { passive: true })
    tick()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [page, reveal])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  const jump = useCallback((el: HTMLElement) => {
    const from = window.scrollY
    setOpen(false)
    setExpanded(false)
    requestAnimationFrame(() => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER - 16, behavior: 'smooth' })
      setBack(from)
      if (backTimer.current) clearTimeout(backTimer.current)
      backTimer.current = setTimeout(() => setBack(null), BACK_MS)
    })
  }, [])

  if (!page) return null

  // A link to this page with one prototype switch changed and the others kept.
  const query = (change: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search)
    Object.entries(change).forEach(([k, v]) => (v === null ? q.delete(k) : q.set(k, v)))
    const s = q.toString()
    return s ? `?${s}` : window.location.pathname
  }

  const minutesLeft = Math.max(1, Math.round(page.minutes * (1 - fraction)))
  const n = page.entries.length
  const here = current >= 0 ? page.entries[current] : null
  const position =
    page.kind === 'sections' && current >= 0 ? `§ ${current + 1} of ${n}`
    : page.kind === 'headings' && current >= 0 ? `${current + 1} of ${n}`
    : page.collection ? `Part ${page.collection.part} of ${page.collection.total}`
    : null
  const label = here?.label ?? page.collection?.title ?? page.title
  const showBar = mode === 'shown' && !open

  // Windowed contents for long lists: first entry, a fold, current ±2, a fold.
  type Row = { kind: 'entry'; i: number } | { kind: 'fold'; from: number; to: number }
  const rows: Row[] = []
  if (n <= WINDOW_OVER || expanded) {
    for (let i = 0; i < n; i++) rows.push({ kind: 'entry', i })
  } else {
    const c = Math.max(current, 0)
    const lo = Math.max(1, c - 2), hi = Math.min(n - 1, c + 2)
    rows.push({ kind: 'entry', i: 0 })
    if (lo > 1) rows.push({ kind: 'fold', from: 1, to: lo - 1 })
    for (let i = lo; i <= hi; i++) rows.push({ kind: 'entry', i })
    if (hi < n - 1) rows.push({ kind: 'fold', from: hi + 1, to: n - 1 })
  }

  // Keith, 29 Oct: in a collection, the next part always leads.
  const leads: { kicker: string; link: LinkInfo }[] = []
  if (page.collection?.next) leads.push({ kicker: `Next in ${page.collection.title}`, link: page.collection.next })
  page.readNext.forEach((l, i) => leads.push({ kicker: i === 0 && !leads.length ? 'Read next' : 'Or', link: l }))

  const smallcaps = { fontFamily: 'var(--serif-smallcaps)', fontVariant: 'all-small-caps' as const, letterSpacing: '0.06em' }

  return (
    <>
      {/* The reading header: occupies the site header's place mid-text. The site
          menu stays at its right, so the reader can always leave the text. */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: HEADER, zIndex: 55,
          background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
          transform: showBar ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform var(--dur-slow) var(--ease)',
        }}
        className="flex items-center gap-3 pl-6 pr-8"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label={`Where you are: ${label}. Open contents and next reading.`}
          className="min-w-0 flex-1 h-full flex items-center gap-3"
          style={{ textAlign: 'left' }}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" style={{ ...smallcaps, color: 'var(--ink-mute)' }}>
              {position ? `${position} · ${minutesLeft} min left` : `${minutesLeft} min left`}
            </span>
            <span className="block truncate font-serif italic" style={{ color: 'var(--ink)', fontSize: '1.02rem' }}>{label}</span>
          </span>
          <span className="shrink-0 font-serif" style={{ color: 'var(--gold-ink)', fontSize: '0.95rem' }}>
            {n > 1 ? 'Contents' : 'Way on'} ▾
          </span>
        </button>
        <span className="shrink-0 h-6" style={{ borderLeft: '1px solid var(--rule)' }} aria-hidden />
        <MobileNav />
        <span aria-hidden style={{ position: 'absolute', left: 0, bottom: -1, height: 2, width: `${fraction * 100}%`, background: 'var(--gold)' }} />
      </div>

      {/* While the header is away, a small pill keeps the navigation in sight: where
          you are, with the progress through the text as its fill. ?pill=0 hides it. */}
      {pill && mode === 'hidden' && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Where you are: ${label}. Open contents and next reading.`}
          style={{
            position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 54,
            background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
            overflow: 'hidden', maxWidth: 'calc(100vw - 96px)',
          }}
          className="rounded-full font-serif text-sm"
        >
          <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${fraction * 100}%`, background: 'var(--gold-rule)', opacity: 0.35 }} />
          <span className="relative flex items-center gap-2 px-4 py-1.5 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
            <span style={{ ...smallcaps, color: 'var(--ink-mute)' }}>{position ?? `${minutesLeft} min left`}</span>
            <span style={{ color: 'var(--gold-ink)' }}>{n > 1 ? 'Contents' : 'Way on'} ▾</span>
          </span>
        </button>
      )}

      {back !== null && !open && (
        <button
          type="button"
          onClick={() => { window.scrollTo({ top: back, behavior: 'smooth' }); setBack(null) }}
          style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '1.5rem', zIndex: 56, background: 'var(--vellum)', border: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)', color: 'var(--ink)' }}
          className="rounded-full px-4 py-2 font-serif text-sm"
        >
          ← Back to where you were
        </button>
      )}

      {open && (
        <>
          <div aria-hidden onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 57, background: 'var(--hero-ground)', opacity: 0.32 }} />
          <div
            role="dialog"
            aria-label="Contents and next reading"
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 58, maxHeight: 'calc(100dvh - 72px)', overflowY: 'auto',
              background: 'var(--vellum)', borderBottom: '1px solid var(--gold-rule)', boxShadow: 'var(--shadow-panel)',
            }}
            className="px-6 pt-5 pb-6"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="kicker-gold">Where you are</p>
              <button type="button" onClick={() => setOpen(false)} className="font-serif text-sm" style={{ color: 'var(--ink-mute)' }}>Close ✕</button>
            </div>
            <p className="font-serif italic mt-2" style={{ color: 'var(--ink)', fontSize: '1.1rem', lineHeight: 1.3 }}>{page.title}</p>
            <p className="font-serif text-sm mt-1" style={{ color: 'var(--ink-mute)' }}>{wherePhrase(fraction)} · {minutesLeft} min left</p>
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
                        {page.kind === 'sections' ? 'Sections' : 'Chapters'} {r.from + 1}–{r.to + 1} ▾
                      </button>
                    </li>
                  ) : (
                    <li key={r.i}>
                      <button
                        type="button"
                        onClick={() => jump(page.entries[r.i].el)}
                        className="w-full text-left font-serif py-2 flex gap-3"
                        style={{
                          color: r.i === current ? 'var(--ink)' : r.i < current ? 'var(--ink-mute)' : 'var(--ink-soft)',
                          borderLeft: r.i === current ? '2px solid var(--gold)' : '2px solid transparent',
                          paddingLeft: '0.75rem',
                        }}
                      >
                        <span className="shrink-0 text-sm" style={{ ...smallcaps, color: 'var(--gold-ink)', minWidth: '1.6rem' }}>{r.i + 1}</span>
                        <span className={r.i === current ? '' : 'line-clamp-2'}>{page.entries[r.i].label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {page.kind === 'sections' && (
                  <p className="font-serif text-sm mt-2" style={{ color: 'var(--ink-mute)' }}>Section titles are the editor&apos;s; they are not part of the original text.</p>
                )}
              </div>
            )}

            {page.collection && (
              <div className="mt-6">
                <p className="kicker">{page.collection.title} · Part {page.collection.part} of {page.collection.total}</p>
                {page.collection.prev && (
                  <a href={page.collection.prev.href} className="block font-serif py-2" style={{ color: 'var(--ink-soft)' }}>← {page.collection.prev.title}</a>
                )}
                <a href={page.collection.href} className="block font-serif py-2" style={{ color: 'var(--accent)' }}>All {page.collection.total} parts →</a>
              </div>
            )}

            {leads.length > 0 && (
              <div className="mt-6">
                {leads.map((l, i) => (
                  <div key={l.link.href} className={i === 0 ? '' : 'mt-2'}>
                    {(i === 0 || l.kicker !== 'Or') && <p className={i === 0 ? 'kicker-gold' : 'kicker'}>{l.kicker}</p>}
                    <a href={l.link.href} className={`block font-serif ${i === 0 ? 'italic mt-1' : 'py-1'}`} style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)', fontSize: i === 0 ? '1.1rem' : undefined }}>
                      {l.link.title} →
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-4 flex items-center justify-between gap-4 border-t" style={{ borderColor: 'var(--rule)' }}>
              <button type="button" onClick={() => { setOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="font-serif text-sm" style={{ color: 'var(--ink-mute)' }}>
                Back to the beginning ↑
              </button>
              <span className="font-serif text-sm flex gap-4">
                <Link href="/" style={{ color: 'var(--accent)' }}>Home</Link>
                <Link href="/texts" style={{ color: 'var(--accent)' }}>Library</Link>
              </span>
            </div>
            <p className="font-serif text-sm mt-4 flex gap-4" style={{ color: 'var(--ink-mute)' }}>
              <span>Prototype:</span>
              <a href={query({ reveal: reveal ? null : '1' })} style={{ color: 'var(--ink-mute)', textDecoration: 'underline' }}>boundary reveal {reveal ? 'on' : 'off'}</a>
              <a href={query({ pill: pill ? '0' : null })} style={{ color: 'var(--ink-mute)', textDecoration: 'underline' }}>pill {pill ? 'on' : 'off'}</a>
            </p>
          </div>
        </>
      )}
    </>
  )
}
