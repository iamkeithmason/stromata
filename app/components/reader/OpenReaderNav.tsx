'use client'

import { OPEN_EVENT } from './ReaderNav'

/**
 * The frontispiece's "Contents ▾": opens ReaderNav's sheet from screen 1. A
 * button, not a link, because the sheet only exists where JavaScript runs;
 * without it the page keeps its plain contents list (see the reader page).
 */
export default function OpenReaderNav({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { from: 'text-hero-contents' } }))}
      className="lg:hidden font-serif hover:opacity-70 transition-opacity py-2 -my-2"
      style={{ color: 'var(--on-dark-gold)' }}
    >
      {label} ▾
    </button>
  )
}
