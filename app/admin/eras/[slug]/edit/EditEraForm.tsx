'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const labelCls = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  slug: string
  label: string
  initialDescription: string
}

export default function EditEraForm({ slug, label, initialDescription }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      description: (data.get('description') as string) || null,
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

    router.push('/admin?success=era')
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
