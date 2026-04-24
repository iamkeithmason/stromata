'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
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
