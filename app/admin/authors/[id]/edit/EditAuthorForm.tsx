'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TRADITIONS, ERAS } from '@/lib/constants'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

type LocationOption = { id: number; name: string; slug: string }

type Props = {
  id: string
  initialName: string
  initialSlug: string
  initialTraditionSlug: string
  initialEraSlug: string
  initialBirthYear: number | null
  initialDeathYear: number | null
  initialBio: string
  initialBioSource: string
  initialLocationId: number | null
  initialLocation: string
}

export default function EditAuthorForm({
  id,
  initialName,
  initialSlug,
  initialTraditionSlug,
  initialEraSlug,
  initialBirthYear,
  initialDeathYear,
  initialBio,
  initialBioSource,
  initialLocationId,
  initialLocation,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([])

  useEffect(() => {
    fetch('/api/admin/locations')
      .then(r => r.json())
      .then(data => setLocationOptions(data ?? []))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      name: data.get('name') as string,
      slug: (data.get('slug') as string) || null,
      tradition_slug: data.get('tradition_slug') as string,
      birth_year: data.get('birth_year') ? Number(data.get('birth_year')) : null,
      death_year: data.get('death_year') ? Number(data.get('death_year')) : null,
      era_slug: (data.get('era_slug') as string) || null,
      bio: (data.get('bio') as string) || null,
      bio_source: (data.get('bio_source') as string) || null,
      location_id: data.get('location_id') ? Number(data.get('location_id')) : null,
      location: (data.get('location') as string) || null,
    }

    setLoading(true)
    setError('')

    const res = await fetch(`/api/admin/authors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/admin/authors?success=author')
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
        <input name="name" type="text" required defaultValue={initialName} className={input} />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(used in the URL)</span>
        </label>
        <input name="slug" type="text" defaultValue={initialSlug} required className={input} placeholder="e.g. john-chrysostom" />
      </div>

      <div>
        <label className={label}>Tradition <span className="text-red-500">*</span></label>
        <select name="tradition_slug" required defaultValue={initialTraditionSlug} className={input}>
          <option value="">Select tradition…</option>
          {TRADITIONS.map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Birth year</label>
          <input name="birth_year" type="number" defaultValue={initialBirthYear ?? ''} className={input} />
        </div>
        <div>
          <label className={label}>Death year</label>
          <input name="death_year" type="number" defaultValue={initialDeathYear ?? ''} className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Era <span className="text-stone-400 font-normal">(optional)</span></label>
        <select name="era_slug" defaultValue={initialEraSlug} className={input}>
          <option value="">— not set —</option>
          {ERAS.map(e => (
            <option key={e.slug} value={e.slug}>{e.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Bio</label>
        <textarea name="bio" rows={8} defaultValue={initialBio} className={input} />
      </div>

      <div>
        <label className={label}>Bio source</label>
        <input name="bio_source" type="text" defaultValue={initialBioSource} className={input} />
      </div>

      {/* Location */}
      <div className="pt-2 border-t border-stone-200">
        <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Location</p>
        <div className="space-y-4">
          <div>
            <label className={label}>Country / region <span className="text-stone-400 font-normal">(optional)</span></label>
            <select name="location_id" defaultValue={initialLocationId ?? ''} className={input}>
              <option value="">— select location —</option>
              {locationOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Primary location <span className="text-stone-400 font-normal">(optional)</span></label>
            <input name="location" type="text" defaultValue={initialLocation} className={input} placeholder="e.g. Canterbury" />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="pt-2">
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50 transition-colors">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
