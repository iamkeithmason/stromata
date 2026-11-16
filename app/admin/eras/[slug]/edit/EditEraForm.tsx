'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EraPlate } from '@/lib/eras/plates'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const labelCls = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  slug: string
  label: string
  initialDescription: string
  /** False until migration 035 is applied: the plate section is then hidden. */
  platesAvailable: boolean
  initialPlateUrl: string | null
  initialPlateCredit: string
  initialPlateFocusY: number | null
  defaultPlate: EraPlate | null
}

export default function EditEraForm({
  slug,
  label,
  initialDescription,
  platesAvailable,
  initialPlateUrl,
  initialPlateCredit,
  initialPlateFocusY,
  defaultPlate,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Plate state. plateUrl null = use the default plate committed with the site.
  const [plateUrl, setPlateUrl] = useState<string | null>(initialPlateUrl)
  const [plateCredit, setPlateCredit] = useState(initialPlateCredit)
  const [focusY, setFocusY] = useState<number>(initialPlateFocusY ?? defaultPlate?.focusY ?? 50)
  const [plateTouched, setPlateTouched] = useState(false)
  const [uploading, setUploading] = useState(false)

  const shownSrc = plateUrl ?? defaultPlate?.src ?? null

  async function handleUpload(file: File) {
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', slug)
    const res = await fetch('/api/admin/eras/plate', { method: 'POST', body: fd })
    const json = await res.json().catch(() => ({}))
    setUploading(false)
    if (!res.ok) {
      setError(json.error ?? 'Upload failed')
      return
    }
    setPlateUrl(json.plate_url)
    setPlateCredit('')
    setFocusY(50)
    setPlateTouched(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload: Record<string, unknown> = {
      description: (data.get('description') as string) || null,
    }
    if (platesAvailable && plateTouched) {
      payload.plate_url = plateUrl
      payload.plate_credit = plateCredit
      payload.plate_focus_y = focusY
    }

    setLoading(true)
    setError('')

    const res = await fetch(`/api/admin/eras/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    router.push('/admin/eras?success=era')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-stone-500 mb-1">Era</p>
        <p className="font-serif text-lg text-stone-800">{label}</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={12}
          className={input}
          defaultValue={initialDescription}
          placeholder="Editorial introduction contextualising this era for readers…"
        />
      </div>

      {platesAvailable && (
        <fieldset className="space-y-3">
          <legend className={labelCls}>Plate (the image at the top of the era page)</legend>
          {shownSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownSrc}
              alt=""
              className="w-full aspect-[3/1] object-cover rounded border border-stone-200"
              style={{ objectPosition: `50% ${focusY}%` }}
            />
          ) : (
            <p className="text-sm text-stone-500">No plate yet: the era page shows a text-only header.</p>
          )}
          <p className="text-xs text-stone-500">
            {plateUrl ? 'A replacement plate is set.' : defaultPlate ? 'Showing the default plate committed with the site.' : ''}
          </p>

          <div>
            <label className={labelCls} htmlFor="plate-file">Replace with an image</label>
            <input
              id="plate-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              className="text-sm"
            />
            <p className="mt-1 text-xs text-stone-500">
              Public domain or CC0 only, checked at the holder&rsquo;s own page. Stored at 2000px wide. {uploading ? 'Uploading…' : ''}
            </p>
          </div>

          {plateUrl && (
            <div>
              <label className={labelCls} htmlFor="plate-credit">Credit (required)</label>
              <input
                id="plate-credit"
                className={input}
                value={plateCredit}
                onChange={e => { setPlateCredit(e.target.value); setPlateTouched(true) }}
                placeholder="What it is, date. Where it is held. Licence."
              />
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="plate-focus">Crop focus: {focusY}% from the top</label>
            <input
              id="plate-focus"
              type="range"
              min={0}
              max={100}
              value={focusY}
              onChange={e => { setFocusY(Number(e.target.value)); setPlateTouched(true) }}
              className="w-full"
            />
          </div>

          {plateUrl && (
            <button
              type="button"
              onClick={() => { setPlateUrl(null); setPlateCredit(''); setFocusY(defaultPlate?.focusY ?? 50); setPlateTouched(true) }}
              className="text-sm text-stone-600 underline"
            >
              Use the default plate instead
            </button>
          )}
        </fieldset>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-stone-800 text-white text-sm rounded hover:bg-stone-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
