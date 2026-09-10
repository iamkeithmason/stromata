'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

/**
 * Verse lookup input. Routes the typed reference to /scripture/[ref]; the
 * results page parses and resolves it. Styled to match the site SearchBar.
 */
export default function ScriptureSearch({ initialValue = '' }: { initialValue?: string }) {
  const [query, setQuery] = useState(initialValue)
  const [focused, setFocused] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    window.umami?.track('scripture-lookup', { from: 'scripture-index', query: q.toLowerCase() })
    router.push(`/scripture/${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label="Scripture lookup" className="relative max-w-2xl mx-auto">
      <div
        className="flex items-center gap-3 px-0 py-3"
        style={{
          borderBottom: focused ? '2px solid var(--gold)' : '1px solid var(--gold-rule)',
          transition: 'border-color 150ms ease, border-width 150ms ease',
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          className="shrink-0"
          style={{ color: 'var(--gold)', opacity: focused ? 1 : 0.75, transition: 'opacity 150ms ease', flexShrink: 0 }}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Look up a verse — e.g. John 3:16"
          aria-label="Look up a Bible verse, e.g. John 3:16"
          className="field-input flex-1 outline-none"
          style={{
            background: 'transparent',
            fontFamily: 'var(--serif-cormorant)',
            fontStyle: 'italic',
            fontSize: 'var(--text-prose)',
            color: 'var(--ink-soft)',
          }}
        />
      </div>
    </form>
  )
}
