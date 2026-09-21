'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Author = { id: string; name: string }

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

export default function NewCollectionForm() {
  const router = useRouter()
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  useEffect(() => {
    fetch('/api/admin/authors').then(r => r.json()).then(setAuthors)
  }, [])

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(title))
  }, [title, slugEdited])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const payload = {
      title,
      slug,
      author_id: (data.get('author_id') as string) || null,
      description: (data.get('description') as string) || null,
      published: data.get('published') === 'on',
    }

    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/admin?success=collection')
    } else {
      const json = await res.json()
      setError(json.error || 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className={label}>Title <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          placeholder="e.g. Letters of Lady Jane Grey"
          className={input}
        />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(auto-generated — used in the URL)</span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
          required
          className={input}
          placeholder="e.g. letters-of-lady-jane-grey"
        />
      </div>

      <div>
        <label className={label}>
          Author <span className="text-stone-400 font-normal">(inherited from texts)</span>
        </label>
        <select name="author_id" className={input}>
          <option value="">— inherit from texts —</option>
          {authors.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <p className="text-xs text-stone-400 mt-1">
          Leave this on &ldquo;inherit&rdquo; unless the collection&rsquo;s own attribution
          differs from its texts&rsquo; — a compiler or editor, say. Inheriting names every
          author of the collection&rsquo;s texts; an override replaces them all.
        </p>
      </div>

      <div>
        <label className={label}>
          Description <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={4}
          className={input}
          placeholder="A brief note about this collection — its context, significance, or editorial provenance…"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="published"
          id="published"
          className="rounded border-stone-300"
        />
        <label htmlFor="published" className="text-sm text-stone-700">
          Publish collection page immediately
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Create collection'}
        </button>
      </div>
    </form>
  )
}
