'use client'

import type { Heading } from '@/lib/headings'

type Props = {
  headings: Heading[]
  mobile?: boolean
}

function TocLinks({ headings }: { headings: Heading[] }) {
  return (
    <ul className="space-y-1.5">
      {headings.map((h) => (
        <li key={h.id} className={h.level === 3 ? 'pl-3' : ''}>
          <a
            href={`#${h.id}`}
            className="block font-serif leading-snug hover:opacity-70 transition-opacity"
            style={{
              color: 'var(--ink-mute)',
              fontSize: h.level === 2 ? '0.8125rem' : '0.75rem',
            }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

export default function TableOfContents({ headings, mobile = false }: Props) {
  if (mobile) {
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

  return (
    <nav aria-label="Table of contents">
      <p
        className="text-xs uppercase tracking-widest mb-4 font-serif"
        style={{ color: 'var(--ink-faint)' }}
      >
        Contents
      </p>
      <TocLinks headings={headings} />
    </nav>
  )
}
