'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  id: number
  initialName: string
  initialSlug: string
  initialAlternativeNames: string
  initialDescription: string
  initialLat: number | null
  initialLng: number | null
}

export default function EditLocationForm({
  id,
  initialName,
  initialSlug,
  initialAlternativeNames,
  initialDescription,
  initialLat,
  initialLng,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const payload = {
      name: data.get('name') as string,
      slug: data.get('slug') as string,
      alternative_names: (data.get('alternative_names') as string) || null,
      lat: data.get('lat') ? Number(data.get('lat')) : null,
      lng: data.get('lng') ? Number(data.get('lng')) : null,
      description: (data.get('description') as string) || null,
    }
    setLoading(true)
    setError('')
    const res = await fetch(`/api/admin/locations/${id}`, {
      method: 'PATCH',
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
        <input name="name" type="text" required defaultValue={initialName} className={input} />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(used in the URL)</span>
        </label>
        <input name="slug" type="text" required defaultValue={initialSlug} className={input} />
      </div>

      <div>
        <label className={label}>
          Alternative names <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <input
          name="alternative_names"
          type="text"
          defaultValue={initialAlternativeNames}
          className={input}
          placeholder="e.g. Roman Africa, Numidia, Carthaginian territory"
        />
        <p className="mt-1 text-xs text-stone-400">Historical or regional names, comma-separated.</p>
      </div>

      <div>
        <label className={label}>Description <span className="text-stone-400 font-normal">(optional)</span></label>
        <textarea name="description" rows={4} defaultValue={initialDescription} className={input} />
      </div>

      <div>
        <p className="text-xs text-stone-400 mb-2">Coordinates (for future map)</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Lat</label>
            <input name="lat" type="number" step="any" defaultValue={initialLat ?? ''} className={input} />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Lng</label>
            <input name="lng" type="number" step="any" defaultValue={initialLng ?? ''} className={input} />
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
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
