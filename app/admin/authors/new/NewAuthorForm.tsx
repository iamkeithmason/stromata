'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TRADITIONS, ERAS } from '@/lib/constants'

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

export default function NewAuthorForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name))
  }, [name, slugEdited])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      name,
      slug: slug || null,
      tradition_slug: data.get('tradition_slug') as string,
      birth_year: data.get('birth_year') ? Number(data.get('birth_year')) : null,
      death_year: data.get('death_year') ? Number(data.get('death_year')) : null,
      era_slug: (data.get('era_slug') as string) || null,
      bio: (data.get('bio') as string) || null,
      bio_source: (data.get('bio_source') as string) || null,
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/admin?success=author')
    } else {
      const json = await res.json()
      setError(json.error || 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className={label}>Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className={input}
        />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(used in the URL — auto-generated)</span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
          required
          className={input}
          placeholder="e.g. john-chrysostom"
        />
      </div>

      <div>
        <label className={label}>Tradition <span className="text-red-500">*</span></label>
        <select name="tradition_slug" required className={input}>
          <option value="">Select tradition…</option>
          {TRADITIONS.map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Birth year</label>
          <input name="birth_year" type="number" className={input} placeholder="e.g. 354" />
        </div>
        <div>
          <label className={label}>Death year</label>
          <input name="death_year" type="number" className={input} placeholder="e.g. 430" />
        </div>
      </div>

      <div>
        <label className={label}>
          Era <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <select name="era_slug" className={input}>
          <option value="">— not set —</option>
          {ERAS.map(e => (
            <option key={e.slug} value={e.slug}>{e.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Bio</label>
        <textarea name="bio" rows={6} className={input} placeholder="Wikipedia-sourced biography, editorially reviewed…" />
      </div>

      <div>
        <label className={label}>Bio source</label>
        <input name="bio_source" type="text" className={input} placeholder="e.g. Wikipedia, cached 2026-04-17" />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="pt-2">
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50 transition-colors">
          {loading ? 'Saving…' : 'Add author'}
        </button>
      </div>
    </form>
  )
}
