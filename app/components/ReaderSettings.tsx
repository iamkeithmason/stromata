'use client'
import { useEffect, useState, useCallback } from 'react'

// Minimal reader typography controls — font size and measure (line width),
// persisted in localStorage, no account. Applied by overriding CSS custom
// properties on the reading container (#reader-main), so the settings ride the
// existing cascade rather than restyling the renderer.
//
// Scope note: light/dark is intentionally NOT here yet — a dark reading mode
// needs the MarkdownBody renderer's hardcoded text colours moved onto tokens
// first, which is a change to the core reading surface that wants its own
// review. Font size + measure are purely additive.
//
// Analytics: emits the distinct `reader-setting-change` event (from · setting ·
// value). Wire-verification on prod still owed before it counts as done.

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

const KEY = 'stromata:reader'

// Font scale multiplies --text-prose (default 1.25rem) on the reading container.
const SCALES = [
  { value: 0.9, label: 'S' },
  { value: 1.0, label: 'M' },
  { value: 1.15, label: 'L' },
  { value: 1.3, label: 'XL' },
]
// Measure as a multiple of the prose size (--reader-measure in globals.css), so it
// counts characters: about 60 / 70 / 80 a line at any text size. Values keep their
// old names so stored preferences and the reader-setting-change series carry over.
const MEASURES = [
  { value: 'narrow', em: 25.5, label: 'Narrow' },
  { value: 'normal', em: 30, label: 'Normal' },
  { value: 'wide', em: 34, label: 'Wide' },
] as const

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

type Measure = (typeof MEASURES)[number]['value']
type Theme = (typeof THEMES)[number]['value']
type Prefs = { scale: number; measure: Measure; theme: Theme }

const DEFAULTS: Prefs = { scale: 1.0, measure: 'normal', theme: 'light' }

function applyPrefs(p: Prefs) {
  // Font size and measure are custom properties on the page root: the reading
  // column inherits them, and so does the footer outside it, which matches the
  // body's width. Theme is an attribute on the same root, so the whole reading
  // surface (hero, margins, footer) flips.
  const page = document.getElementById('reader-page')
  const root = page ?? document.getElementById('reader-main')
  if (root) {
    root.style.setProperty('--reader-font-scale', String(p.scale))
    const m = MEASURES.find(x => x.value === p.measure) ?? MEASURES[1]
    root.style.setProperty('--reader-measure', String(m.em))
  }
  if (page) {
    if (p.theme === 'dark') page.setAttribute('data-reader-theme', 'dark')
    else page.removeAttribute('data-reader-theme')
  }
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const scale = SCALES.some(s => s.value === parsed.scale) ? (parsed.scale as number) : DEFAULTS.scale
    const measure = MEASURES.some(m => m.value === parsed.measure) ? (parsed.measure as Measure) : DEFAULTS.measure
    const theme = THEMES.some(t => t.value === parsed.theme) ? (parsed.theme as Theme) : DEFAULTS.theme
    return { scale, measure, theme }
  } catch {
    return DEFAULTS
  }
}

export function ReaderSettings() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)

  // Apply persisted prefs on mount.
  useEffect(() => {
    const p = loadPrefs()
    setPrefs(p)
    applyPrefs(p)
  }, [])

  // Step out of the way while the reader reads. The button floats over the text and
  // on a phone it covered the last words of a line on every screen (26 Oct critique),
  // so it slides away while scrolling down and returns on any scroll up or near the top.
  const [tucked, setTucked] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last
        if (y < 200) setTucked(false)
        else if (delta > 8) setTucked(true)
        else if (delta < -8) setTucked(false)
        if (Math.abs(delta) > 8 || y < 200) last = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const hidden = tucked && !open

  const update = useCallback((patch: Partial<Prefs>, setting: 'font-size' | 'measure' | 'theme', value: string) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      applyPrefs(next)
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* private mode / storage blocked — settings still apply for this session */
      }
      return next
    })
    // Outside the updater: React may run an updater twice (always in dev Strict Mode),
    // and the applying + storing above are idempotent but a beacon is not.
    window.umami?.track('reader-setting-change', { from: 'text-reader', setting, value })
  }, [])

  const panelBg = 'var(--vellum)'
  const border = '1px solid var(--rule)'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 45,
        transform: hidden ? 'translateY(calc(100% + 2rem))' : 'none',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'transform var(--dur-slow) var(--ease), opacity var(--dur-slow) var(--ease)',
      }}
      className="print:hidden"
      // A keyboard user tabbing to the button brings it back.
      onFocus={() => setTucked(false)}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Reading settings"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 0.5rem)',
            right: 0,
            width: '15rem',
            background: panelBg,
            border,
            borderRadius: 4,
            boxShadow: '0 6px 24px rgba(28,24,20,0.14)',
            padding: '0.9rem 1rem',
          }}
        >
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Theme</p>
          <div className="flex gap-1.5 mb-4">
            {THEMES.map(t => {
              const active = prefs.theme === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update({ theme: t.value }, 'theme', t.value)}
                  aria-pressed={active}
                  className="flex-1 py-1 transition-opacity hover:opacity-80"
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-sm)',
                    border,
                    borderRadius: 3,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--vellum)' : 'var(--ink-soft)',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Text size</p>
          <div className="flex gap-1.5 md:mb-4">
            {SCALES.map(s => {
              const active = prefs.scale === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => update({ scale: s.value }, 'font-size', String(s.value))}
                  aria-pressed={active}
                  className="flex-1 py-1 transition-opacity hover:opacity-80"
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-sm)',
                    border,
                    borderRadius: 3,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--vellum)' : 'var(--ink-soft)',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          {/* Width only has room to act from md up: below 768px the column is already
              narrower than the narrowest measure (680px), so every option looked the same
              on a phone (Keith, 26 Oct). Hidden there rather than shown doing nothing. */}
          <div className="hidden md:block">
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Width</p>
          <div className="flex gap-1.5">
            {MEASURES.map(m => {
              const active = prefs.measure === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => update({ measure: m.value }, 'measure', m.value)}
                  aria-pressed={active}
                  className="flex-1 py-1 transition-opacity hover:opacity-80"
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-sm)',
                    border,
                    borderRadius: 3,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--vellum)' : 'var(--ink-soft)',
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Reading settings"
        title="Reading settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2.75rem',
          height: '2.75rem',
          borderRadius: '9999px',
          background: 'var(--vellum)',
          border,
          boxShadow: '0 4px 16px rgba(28,24,20,0.14)',
          fontFamily: 'var(--serif-display)',
          fontSize: '1.1rem',
          color: 'var(--ink)',
          cursor: 'pointer',
        }}
      >
        Aa
      </button>
    </div>
  )
}
