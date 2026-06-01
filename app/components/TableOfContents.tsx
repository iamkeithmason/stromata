'use client'

import { useRef, useState } from 'react'
import type { Heading } from '@/lib/headings'

type Props = { headings: Heading[]; mobile?: boolean }

function TocLinks({ headings }: { headings: Heading[] }) {
  return (
    <ul className="space-y-2">
      {headings.map(h => (
        <li key={h.id} className={h.level === 3 ? 'pl-3' : h.level === 2 ? 'pl-1.5' : ''}>
          <a
            href={`#${h.id}`}
            className="block font-serif leading-snug hover:opacity-70 transition-opacity"
            style={{
              color: h.level === 1 ? 'var(--ink-soft)' : 'var(--ink-mute)',
              fontSize: h.level === 1 ? '0.875rem' : h.level === 2 ? '0.8125rem' : '0.75rem',
              fontWeight: h.level === 1 ? 500 : 400,
            }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

// ─── Mobile: <details> disclosure inside the article ──────────────────────────
function MobileToc({ headings }: { headings: Heading[] }) {
  return (
    <details
      className="border rounded px-4 py-3"
      style={{ borderColor: 'var(--rule)', background: 'var(--vellum)' }}
    >
      <summary
        className="font-serif text-sm cursor-pointer select-none"
        style={{ color: 'var(--ink-mute)', listStyle: 'none' }}
      >
        <span className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 3h8M2 6h8M2 9h5" />
          </svg>
          Jump to section
        </span>
      </summary>
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--rule)' }}>
        <TocLinks headings={headings} />
      </div>
    </details>
  )
}

// ─── Desktop: fixed right-margin, dash minimap → hover to expand ──────────────
// Uses a close-delay timer so moving from dashes → expanded panel doesn't flicker.
export default function TableOfContents({ headings, mobile = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (mobile) return <MobileToc headings={headings} />

  const open = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setExpanded(true)
  }
  const close = () => {
    closeTimer.current = setTimeout(() => setExpanded(false), 120)
  }

  return (
    // Outer fixed container — positioned in the right margin.
    // Only shown at xl (1280px+) where there is enough space beside max-w-2xl content.
    <div
      className="fixed right-6 top-24 z-20 hidden xl:block"
      style={{ width: 24 }}   // collapsed width matches widest dash
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {/* ── Collapsed: dash minimap ── */}
      <div
        className="flex flex-col items-end gap-1.5 transition-opacity duration-150"
        style={{
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto',
          maxHeight: 'calc(100vh - 7rem)',
          overflowY: 'hidden',
        }}
      >
        {headings.map(h => (
          <div
            key={h.id}
            style={{
              width: h.level === 1 ? 24 : h.level === 2 ? 18 : 11,
              height: 2,
              borderRadius: 1,
              background: h.level === 1 ? 'var(--ink-faint)' : 'var(--rule)',
            }}
          />
        ))}
      </div>

      {/* ── Expanded: full text panel ── */}
      {/* Positioned absolute so it doesn't affect layout; right-aligned with dashes */}
      <nav
        aria-label="Table of contents"
        onMouseEnter={open}
        onMouseLeave={close}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
          transform: expanded ? 'translateX(0)' : 'translateX(4px)',
          transition: 'opacity 150ms ease, transform 150ms ease',
          background: 'var(--vellum)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          padding: '12px 14px',
          minWidth: 180,
          maxWidth: 220,
          maxHeight: 'calc(100vh - 7rem)',
          overflowY: 'auto',
          boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
        }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-3 font-serif"
          style={{ color: 'var(--ink-faint)' }}
        >
          Contents
        </p>
        <TocLinks headings={headings} />
      </nav>
    </div>
  )
}
