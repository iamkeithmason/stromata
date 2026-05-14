'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GENRES, THEME_CLUSTERS } from '@/lib/constants'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type Author = { id: string; name: string }
type Collection = { id: string; title: string }

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

type Props = {
  id: string
  initialTitle: string
  initialSlug: string
  initialAuthorId: string
  initialGenreSlug: string
  initialThemeSlugs: string[]
  initialCollectionId: string
  initialCollectionOrder: number | null
  initialSourceAttribution: string
  initialProvenanceNotes: string
  initialTranslationNotes: string
  initialOcrQuality: string
  initialNoteDraft: string
  initialEditorialIntroduction: string
  initialBody: string
  initialPublished: boolean
}

export default function EditTextForm({
  id,
  initialTitle,
  initialSlug,
  initialAuthorId,
  initialGenreSlug,
  initialThemeSlugs,
  initialCollectionId,
  initialCollectionOrder,
  initialSourceAttribution,
  initialProvenanceNotes,
  initialTranslationNotes,
  initialOcrQuality,
  initialNoteDraft,
  initialEditorialIntroduction,
  initialBody,
  initialPublished,
}: Props) {
  const router = useRouter()
  const [authors, setAuthors] = useState<Author[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authorId, setAuthorId] = useState(initialAuthorId)
  const [genreSlug, setGenreSlug] = useState(initialGenreSlug)
  const [selectedThemes, setSelectedThemes] = useState<string[]>(initialThemeSlugs)
  const [collectionId, setCollectionId] = useState(initialCollectionId)
  const [editorialIntroduction, setEditorialIntroduction] = useState(initialEditorialIntroduction)

  useEffect(() => {
    fetch('/api/admin/authors').then(r => r.json()).then(setAuthors)
    fetch('/api/admin/collections').then(r => r.json()).then(setCollections)
  }, [])

  function toggleTheme(themeSlug: string) {
    setSelectedThemes(prev =>
      prev.includes(themeSlug) ? prev.filter(s => s !== themeSlug) : [...prev, themeSlug]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      title: data.get('title') as string,
      slug: data.get('slug') as string,
      author_id: authorId,
      genre_slug: genreSlug,
      theme_slugs: selectedThemes,
      collection_id: collectionId || null,
      collection_order: collectionId ? (Number(data.get('collection_order')) || null) : null,
      source_attribution: (data.get('source_attribution') as string) || null,
      provenance_notes: (data.get('provenance_notes') as string) || null,
      translation_notes: (data.get('translation_notes') as string) || null,
      ocr_quality: (data.get('ocr_quality') as string) || null,
      editorial_introduction: editorialIntroduction || null,
      body: data.get('body') as string,
      published: data.get('published') === 'on',
    }

    setLoading(true)
    setError('')

    const res = await fetch(`/api/admin/texts/${id}`, {
      method: 'PATCH',
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
        <label className={label}>Author <span className="text-red-500">*</span></label>
        <select
          value={authorId}
          onChange={e => setAuthorId(e.target.value)}
          required
          className={input}
        >
          <option value="">Select author…</option>
          {authors.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Genre <span className="text-red-500">*</span></label>
        <select
          value={genreSlug}
          onChange={e => setGenreSlug(e.target.value)}
          required
          className={input}
        >
          <option value="">Select genre…</option>
          {GENRES.map(g => (
            <option key={g.slug} value={g.slug}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Collection */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>
            Collection <span className="text-stone-400 font-normal">(optional)</span>
          </label>
          <select
            value={collectionId}
            onChange={e => setCollectionId(e.target.value)}
            className={input}
          >
            <option value="">— not part of a collection —</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        {collectionId && (
          <div>
            <label className={label}>Position in collection</label>
            <input
              type="number"
              name="collection_order"
              min={1}
              defaultValue={initialCollectionOrder ?? ''}
              className={input}
              placeholder="e.g. 1"
            />
            <p className="text-xs text-stone-400 mt-1">Controls the reading order.</p>
          </div>
        )}
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
                  <label key={theme.slug} className="flex items-center gap-1.5 text-sm text-stone-700 cursor-pointer">
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
        <input name="source_attribution" type="text" defaultValue={initialSourceAttribution} className={input} />
      </div>

      <div>
        <label className={label}>Provenance notes</label>
        <textarea name="provenance_notes" rows={3} defaultValue={initialProvenanceNotes} className={input} />
      </div>

      <div>
        <label className={label}>Translation notes</label>
        <textarea name="translation_notes" rows={3} defaultValue={initialTranslationNotes} className={input}
          placeholder="Note if the translation is not independently public domain…" />
      </div>

      <div>
        <label className={label}>OCR quality</label>
        <select name="ocr_quality" defaultValue={initialOcrQuality} className={input}>
          <option value="">— not assessed —</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {initialNoteDraft && (
        <div>
          <label className="block text-sm font-medium text-stone-500 mb-1">
            Draft note <span className="font-normal">(AI-generated)</span>
          </label>
          <div className="w-full px-3 py-2 border border-stone-200 rounded bg-stone-50 text-stone-500 text-sm leading-relaxed whitespace-pre-wrap">
            {initialNoteDraft}
          </div>
          <button
            type="button"
            onClick={() => setEditorialIntroduction(initialNoteDraft)}
            className="mt-2 px-3 py-1 text-xs border border-stone-300 rounded text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Use this draft
          </button>
        </div>
      )}

      <div>
        <label className={label}>
          Editorial introduction{' '}
          <span className="text-stone-400 font-normal">(optional — your editorial voice, shown above the text)</span>
        </label>
        <MarkdownEditor
          name="editorial_introduction"
          value={editorialIntroduction}
          onChange={setEditorialIntroduction}
          rows={6}
        />
      </div>

      <div>
        <label className={label}>Text body <span className="text-red-500">*</span></label>
        <MarkdownEditor name="body" defaultValue={initialBody} rows={24} />
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
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50 transition-colors">
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
