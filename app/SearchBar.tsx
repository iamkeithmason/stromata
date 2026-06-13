'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number | null>) => void }
  }
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q) {
      window.umami?.track('search-submit', { query: q.toLowerCase() })
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
      {/* Open underline field — focus thickens the gold hairline */}
      <div
        className="flex items-center gap-3 px-0 py-3"
        style={{
          borderBottom: focused ? '2px solid var(--gold)' : '1px solid var(--gold-rule)',
          transition: 'border-color 150ms ease, border-width 150ms ease',
        }}
      >
        {/* Gold search icon — brightens on focus */}
        <svg
          className="shrink-0"
          style={{
            color: 'var(--gold)',
            opacity: focused ? 1 : 0.75,
            transition: 'opacity 150ms ease',
            flexShrink: 0,
          }}
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

        {/* Large italic Cormorant input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Find an author, a text, a tradition…"
          className="flex-1 outline-none"
          style={{
            background: 'transparent',
            fontFamily: 'var(--serif-cormorant)',
            fontStyle: 'italic',
            fontSize: 'var(--text-prose)',
            color: 'var(--ink-soft)',
          }}
        />

        {/* ⌘K shortcut hint — muted, no box */}
        <kbd
          className="hidden sm:inline-flex items-center shrink-0 font-mono"
          style={{
            color: 'var(--ink-faint)',
            fontSize: 'var(--text-xs)',
            background: 'transparent',
            border: 'none',
            letterSpacing: '0.04em',
          }}
        >
          ⌘K
        </kbd>
      </div>
    </form>
  )
}
