'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const labelCls = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  slug: string
  name: string
  initialSubtitle: string
}

export default function EditThemeForm({ slug, name, initialSubtitle }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      plain_language_subtitle: (data.get('plain_language_subtitle') as string) || null,
    }

    setLoading(true)
    setError('')

    const res = await fetch(`/api/admin/themes/${slug}`, {
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

    router.push('/admin/themes?success=theme')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-stone-500 mb-1">Theme</p>
        <p className="font-serif text-lg text-stone-800">{name}</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="plain_language_subtitle">
          Plain-language subtitle
        </label>
        <p className="text-xs text-stone-400 mb-2">
          Optional. One sentence translating the formal theological term for a reader who doesn&apos;t
          already know it — e.g. &ldquo;writings about who Christ is&rdquo; for Christology. Keeps the
          formal term visible; this only glosses it. Shown beneath the theme name on the public theme page.
        </p>
        <textarea
          id="plain_language_subtitle"
          name="plain_language_subtitle"
          rows={2}
          className={input}
          defaultValue={initialSubtitle}
          placeholder={`A one-sentence plain-language gloss of ${name}…`}
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
        <a
          href={`/themes/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
        >
          View public page →
        </a>
      </div>
    </form>
  )
}
