'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GENRES, THEME_CLUSTERS } from '@/lib/constants'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type Author = { id: string; name: string }

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function NewTextForm() {
  const router = useRouter()
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [selectedThemes, setSelectedThemes] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/admin/authors')
      .then(r => r.json())
      .then(setAuthors)
  }, [])

  useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(title))
    }
  }, [title, slugEdited])

  function toggleTheme(themeSlug: string) {
    setSelectedThemes(prev =>
      prev.includes(themeSlug)
        ? prev.filter(s => s !== themeSlug)
        : [...prev, themeSlug]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      title,
      slug,
      author_id: data.get('author_id') as string,
      genre_slug: data.get('genre_slug') as string,
      theme_slugs: selectedThemes,
      source_attribution: (data.get('source_attribution') as string) || null,
      provenance_notes: (data.get('provenance_notes') as string) || null,
      translation_notes: (data.get('translation_notes') as string) || null,
      ocr_quality: (data.get('ocr_quality') as string) || null,
      body: data.get('body') as string,
      published: data.get('published') === 'on',
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/texts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/admin?success=text')
    } else {
      const json = await res.json()
      setError(json.error || 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className={label}>
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          className={input}
        />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(auto-generated — edit if needed)</span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
          required
          className={input}
        />
      </div>

      <div>
        <label className={label}>
          Author <span className="text-red-500">*</span>
        </label>
        <select name="author_id" required className={input}>
          <option value="">Select author…</option>
          {authors.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {authors.length === 0 && (
          <p className="text-xs text-stone-400 mt-1">
            No authors yet —{' '}
            <a href="/admin/authors/new" className="underline">add one first</a>.
          </p>
        )}
      </div>

      <div>
        <label className={label}>
          Genre <span className="text-red-500">*</span>
        </label>
        <select name="genre_slug" required className={input}>
          <option value="">Select genre…</option>
          {GENRES.map(g => (
            <option key={g.slug} value={g.slug}>{g.name}</option>
          ))}
        </select>
      </div>

      <div>
        <p className={label}>Themes</p>
        <div className="space-y-4 mt-2">
          {THEME_CLUSTERS.map(cluster => (
            <div key={cluster.cluster}>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                {cluster.cluster}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {cluster.themes.map(theme => (
                  <label
                    key={theme.slug}
                    className="flex items-center gap-1.5 text-sm text-stone-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedThemes.includes(theme.slug)}
                      onChange={() => toggleTheme(theme.slug)}
                      className="rounded border-stone-300"
                    />
                    {theme.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={label}>Source attribution</label>
        <input name="source_attribution" type="text" className={input} />
      </div>

      <div>
        <label className={label}>Provenance notes</label>
        <textarea name="provenance_notes" rows={3} className={input} />
      </div>

      <div>
        <label className={label}>Translation notes</label>
        <textarea
          name="translation_notes"
          rows={3}
          className={input}
          placeholder="Note if the translation is not independently public domain or requires separate rights clearance…"
        />
      </div>

      <div>
        <label className={label}>OCR quality</label>
        <select name="ocr_quality" className={input}>
          <option value="">— not assessed —</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div>
        <label className={label}>
          Text body <span className="text-red-500">*</span>
        </label>
        <MarkdownEditor name="body" rows={24} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="published"
          id="published"
          className="rounded border-stone-300"
        />
        <label htmlFor="published" className="text-sm text-stone-700">
          Publish immediately
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="pt-2 pb-12">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Add text'}
        </button>
      </div>
    </form>
  )
}
