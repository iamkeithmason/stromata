'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Author = { id: string; name: string }

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  id: string
  initialTitle: string
  initialSlug: string
  initialAuthorId: string
  initialDescription: string
  initialPublished: boolean
}

export default function EditCollectionForm({
  id,
  initialTitle,
  initialSlug,
  initialAuthorId,
  initialDescription,
  initialPublished,
}: Props) {
  const router = useRouter()
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/authors').then(r => r.json()).then(setAuthors)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const payload = {
      title: data.get('title') as string,
      slug: data.get('slug') as string,
      author_id: (data.get('author_id') as string) || null,
      description: (data.get('description') as string) || null,
      published: data.get('published') === 'on',
    }

    setLoading(true)
    setError('')
    const res = await fetch(`/api/admin/collections/${id}`, {
      method: 'PATCH',
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
        <input name="title" type="text" required defaultValue={initialTitle} className={input} />
      </div>

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(changing this will break existing links)</span>
        </label>
        <input name="slug" type="text" required defaultValue={initialSlug} className={input} />
      </div>

      <div>
        <label className={label}>
          Primary author <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <select name="author_id" defaultValue={initialAuthorId} className={input}>
          <option value="">— no single author —</option>
          {authors.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>
          Description <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={4}
          defaultValue={initialDescription}
          className={input}
          placeholder="A brief note about this collection…"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="published"
          id="published"
          defaultChecked={initialPublished}
          className="rounded border-stone-300"
        />
        <label htmlFor="published" className="text-sm text-stone-700">Published</label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="pt-2 pb-12">
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
