'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GENRES, THEME_CLUSTERS } from '@/lib/constants'
import MarkdownEditor from '@/app/components/MarkdownEditor'
import { MAX_THEMES, toggleThemeCapped } from '@/lib/admin/theme-cap'

type Author = { id: string; name: string }
type Collection = { id: string; title: string }

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

function NewTextFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromId = searchParams.get('from')

  const [authors, setAuthors] = useState<Author[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicatedFrom, setDuplicatedFrom] = useState('')

  // All fields are controlled so they can be pre-filled from a duplicate source
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [authorId, setAuthorId] = useState('')
  const [genreSlug, setGenreSlug] = useState('')
  const [selectedThemes, setSelectedThemes] = useState<string[]>([])
  const [collectionId, setCollectionId] = useState('')
  const [collectionOrder, setCollectionOrder] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceAttribution, setSourceAttribution] = useState('')
  const [provenanceNotes, setProvenanceNotes] = useState('')
  const [translationNotes, setTranslationNotes] = useState('')
  const [ocrQuality, setOcrQuality] = useState('')
  const [editorialIntroduction, setEditorialIntroduction] = useState('')
  const [body, setBody] = useState('')
  const [published, setPublished] = useState(false)

  // Load lookup data
  useEffect(() => {
    fetch('/api/admin/authors').then(r => r.json()).then(setAuthors)
    fetch('/api/admin/collections').then(r => r.json()).then(setCollections)
  }, [])

  // If duplicating, pre-fill from source text once lookups are loaded
  useEffect(() => {
    if (!fromId || authors.length === 0) return
    fetch(`/api/admin/texts/${fromId}`)
      .then(r => r.json())
      .then(src => {
        setDuplicatedFrom(src.title ?? '')
        setAuthorId(src.author_id ?? '')
        // genre comes back as the genre object with slug
        setGenreSlug(src.genre?.slug ?? '')
        // themes come back as text_themes array
        const themeSlugs = (src.text_themes ?? [])
          .map((tt: { theme: { slug: string } | null }) => tt.theme?.slug)
          .filter(Boolean) as string[]
        setSelectedThemes(themeSlugs)
        setCollectionId(src.collection_id ?? '')
        // Auto-increment position for the next letter/chapter
        if (src.collection_order) {
          setCollectionOrder(String(src.collection_order + 1))
        }
        setSourceUrl(src.source_url ?? '')
        setSourceAttribution(src.source_attribution ?? '')
        setProvenanceNotes(src.provenance_notes ?? '')
        setTranslationNotes(src.translation_notes ?? '')
        setOcrQuality(src.ocr_quality ?? '')
        // Title, slug, body intentionally left blank — must be entered fresh
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, authors.length])

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(title))
  }, [title, slugEdited])

  function toggleTheme(themeSlug: string) {
    setSelectedThemes(prev => toggleThemeCapped(prev, themeSlug))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload = {
      title,
      slug,
      author_id: authorId,
      genre_slug: genreSlug,
      theme_slugs: selectedThemes,
      collection_id: collectionId || null,
      collection_order: collectionId && collectionOrder ? Number(collectionOrder) : null,
      source_url: sourceUrl || null,
      source_attribution: sourceAttribution || null,
      provenance_notes: provenanceNotes || null,
      translation_notes: translationNotes || null,
      ocr_quality: ocrQuality || null,
      editorial_introduction: editorialIntroduction || null,
      body,
      published,
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

      {/* Duplicate notice */}
      {duplicatedFrom && (
        <p className="text-xs px-3 py-2 rounded border bg-amber-50 border-amber-200 text-amber-700">
          Metadata duplicated from <strong>{duplicatedFrom}</strong>. Enter a new title and body — all other fields are pre-filled.
        </p>
      )}

      <div>
        <label className={label}>Title <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          autoFocus={!!fromId}
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
        {authors.length === 0 && (
          <p className="text-xs text-stone-400 mt-1">
            No authors yet —{' '}
            <a href="/admin/authors/new" className="underline">add one first</a>.
          </p>
        )}
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
          {collections.length === 0 && (
            <p className="text-xs text-stone-400 mt-1">
              No collections yet —{' '}
              <a href="/admin/collections/new" className="underline">create one first</a>.
            </p>
          )}
        </div>
        {collectionId && (
          <div>
            <label className={label}>Position in collection</label>
            <input
              type="number"
              value={collectionOrder}
              onChange={e => setCollectionOrder(e.target.value)}
              min={1}
              className={input}
              placeholder="e.g. 1"
            />
            <p className="text-xs text-stone-400 mt-1">Controls the reading order.</p>
          </div>
        )}
      </div>

      <div>
        <p className={label}>Themes <span className="text-stone-400 font-normal">({selectedThemes.length}/{MAX_THEMES})</span></p>
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
                      disabled={!selectedThemes.includes(theme.slug) && selectedThemes.length >= MAX_THEMES}
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
        <label className={label}>Source URL</label>
        <input
          type="url"
          value={sourceUrl}
          onChange={e => setSourceUrl(e.target.value)}
          className={input}
          placeholder="https://… (link to the original source document)"
        />
      </div>

      <div>
        <label className={label}>Source attribution</label>
        <input
          type="text"
          value={sourceAttribution}
          onChange={e => setSourceAttribution(e.target.value)}
          className={input}
        />
      </div>

      <div>
        <label className={label}>Provenance notes</label>
        <textarea
          value={provenanceNotes}
          onChange={e => setProvenanceNotes(e.target.value)}
          rows={3}
          className={input}
        />
      </div>

      <div>
        <label className={label}>Translation notes</label>
        <textarea
          value={translationNotes}
          onChange={e => setTranslationNotes(e.target.value)}
          rows={3}
          className={input}
          placeholder="Note if the translation is not independently public domain or requires separate rights clearance…"
        />
      </div>

      <div>
        <label className={label}>OCR quality</label>
        <select
          value={ocrQuality}
          onChange={e => setOcrQuality(e.target.value)}
          className={input}
        >
          <option value="">— not assessed —</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div>
        <label className={label}>
          Editorial introduction{' '}
          <span className="text-stone-400 font-normal">(optional — your editorial voice, shown above the text)</span>
        </label>
        <MarkdownEditor name="editorial_introduction" value={editorialIntroduction} onChange={setEditorialIntroduction} rows={6} />
      </div>

      <div>
        <label className={label}>Text body <span className="text-red-500">*</span></label>
        <MarkdownEditor name="body" value={body} onChange={setBody} rows={24} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="published"
          checked={published}
          onChange={e => setPublished(e.target.checked)}
          className="rounded border-stone-300"
        />
        <label htmlFor="published" className="text-sm text-stone-700">
          Publish immediately
        </label>
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
          {loading ? 'Saving…' : 'Add text'}
        </button>
      </div>
    </form>
  )
}

// useSearchParams requires Suspense boundary in Next.js App Router
export default function NewTextForm() {
  return (
    <Suspense>
      <NewTextFormInner />
    </Suspense>
  )
}
