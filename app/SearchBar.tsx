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
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm"
        style={{ background: 'white', borderColor: '#d6d0c8' }}
      >
        <svg
          className="shrink-0"
          style={{ color: '#6f6a60' }}
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
          placeholder="Search authors, titles, ideas…"
          className="flex-1 bg-transparent outline-none font-serif text-base"
          style={{ color: '#1b1b1b' }}
        />
        <kbd
          className="hidden sm:inline-flex items-center px-2 py-1 text-xs rounded font-mono shrink-0"
          style={{ background: '#f4f0e8', color: '#6f6a60', border: '1px solid #d6d0c8' }}
        >
          ⌘K
        </kbd>
      </div>
    </form>
  )
}
