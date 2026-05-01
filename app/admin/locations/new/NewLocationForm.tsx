'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

export default function NewLocationForm() {
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
      slug,
      alternative_names: (data.get('alternative_names') as string) || null,
      lat: data.get('lat') ? Number(data.get('lat')) : null,
      lng: data.get('lng') ? Number(data.get('lng')) : null,
      description: (data.get('description') as string) || null,
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      router.push('/admin?success=location')
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
          placeholder="e.g. North Africa"
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
          placeholder="e.g. north-africa"
        />
      </div>

      <div>
        <label className={label}>
          Alternative names <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <input
          name="alternative_names"
          type="text"
          className={input}
          placeholder="e.g. Roman Africa, Numidia, Carthaginian territory"
        />
        <p className="mt-1 text-xs text-stone-400">Historical or regional names for this location, comma-separated.</p>
      </div>

      <div>
        <label className={label}>Description <span className="text-stone-400 font-normal">(optional)</span></label>
        <textarea name="description" rows={4} className={input} placeholder="Brief editorial note about this location…" />
      </div>

      <div>
        <p className="text-xs text-stone-400 mb-2">Coordinates (for future map)</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Lat</label>
            <input name="lat" type="number" step="any" className={input} placeholder="e.g. 28.0" />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Lng</label>
            <input name="lng" type="number" step="any" className={input} placeholder="e.g. 2.0" />
          </div>
        </div>
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
          {loading ? 'Saving…' : 'Add location'}
        </button>
      </div>
    </form>
  )
}
