'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { GENRES, THEME_CLUSTERS } from '@/lib/constants'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type Author = { id: string; name: string }
type Collection = { id: string; title: string }

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

// Pull any http(s) URLs out of the free-text source/provenance/translation notes so
// they can be offered as clickable "open the original in a new tab" links.
function extractSourceLinks(...fields: string[]): string[] {
  const urlPattern = /https?:\/\/[^\s<>"')\]]+/g
  const seen = new Set<string>()
  for (const field of fields) {
    for (const match of field.matchAll(urlPattern)) {
      // Trim trailing punctuation that commonly rides along in prose (e.g. a full stop).
      const url = match[0].replace(/[.,;:]+$/, '')
      if (!seen.has(url)) seen.add(url)
    }
  }
  return [...seen]
}

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

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
  initialSummary: string
  initialEditorialIntroduction: string
  initialBody: string
  initialPublished: boolean
  initialFeatured: boolean
  initialFeaturedFrom: string
  initialFeaturedNote: string
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
  initialSummary,
  initialEditorialIntroduction,
  initialBody,
  initialPublished,
  initialFeatured,
  initialFeaturedFrom,
  initialFeaturedNote,
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
  const [sourceAttribution, setSourceAttribution] = useState(initialSourceAttribution)
  const [provenanceNotes, setProvenanceNotes] = useState(initialProvenanceNotes)
  const [translationNotes, setTranslationNotes] = useState(initialTranslationNotes)
  const [editorialIntroduction, setEditorialIntroduction] = useState(initialEditorialIntroduction)
  const [noteDraft, setNoteDraft] = useState(initialNoteDraft)
  const [summary, setSummary] = useState(initialSummary)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [generateSummaryError, setGenerateSummaryError] = useState('')

  const sourceLinks = useMemo(
    () => extractSourceLinks(sourceAttribution, provenanceNotes, translationNotes),
    [sourceAttribution, provenanceNotes, translationNotes]
  )

  useEffect(() => {
    fetch('/api/admin/authors').then(r => r.json()).then(setAuthors)
    fetch('/api/admin/collections').then(r => r.json()).then(setCollections)
  }, [])

  function toggleTheme(themeSlug: string) {
    setSelectedThemes(prev =>
      prev.includes(themeSlug) ? prev.filter(s => s !== themeSlug) : [...prev, themeSlug]
    )
  }

  async function handleGenerateSummary() {
    setGeneratingSummary(true)
    setGenerateSummaryError('')
    const res = await fetch(`/api/admin/texts/${id}/generate-summary`, { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      setSummary(json.summary)
    } else {
      setGenerateSummaryError(json.error || 'Generation failed.')
    }
    setGeneratingSummary(false)
  }

  async function handleGenerateDraft() {
    setGenerating(true)
    setGenerateError('')
    const res = await fetch(`/api/admin/texts/${id}/generate-note-draft`, { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      setNoteDraft(json.note_draft)
    } else {
      setGenerateError(json.error || 'Generation failed.')
    }
    setGenerating(false)
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
      summary: summary || null,
      editorial_introduction: editorialIntroduction || null,
      body: data.get('body') as string,
      published: data.get('published') === 'on',
      featured: data.get('featured') === 'on',
      featured_from: (data.get('featured_from') as string) || null,
      featured_note: (data.get('featured_note') as string) || null,
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

      {sourceLinks.length > 0 && (
        <div className="border border-stone-200 rounded p-3 bg-stone-50">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
            Source document
          </p>
          <ul className="space-y-1">
            {sourceLinks.map(url => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                  className="text-sm text-stone-700 underline decoration-stone-300 hover:decoration-stone-600 break-all"
                >
                  {linkLabel(url)} ↗
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-400 mt-2">
            Opens in a new tab, so you can compare against the original while you review. Detected from the fields below.
          </p>
        </div>
      )}

      <div>
        <label className={label}>Source attribution</label>
        <input name="source_attribution" type="text" value={sourceAttribution}
          onChange={e => setSourceAttribution(e.target.value)} className={input} />
      </div>

      <div>
        <label className={label}>Provenance notes</label>
        <textarea name="provenance_notes" rows={3} value={provenanceNotes}
          onChange={e => setProvenanceNotes(e.target.value)} className={input} />
      </div>

      <div>
        <label className={label}>Translation notes</label>
        <textarea name="translation_notes" rows={3} value={translationNotes}
          onChange={e => setTranslationNotes(e.target.value)} className={input}
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

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className={label} style={{ marginBottom: 0 }}>
            Summary{' '}
            <span className="text-stone-400 font-normal">(meta description · 150–160 chars ideal)</span>
          </label>
          <span className={`text-xs tabular-nums ${summary.length > 160 ? 'text-red-500' : 'text-stone-400'}`}>
            {summary.length}/160
          </span>
        </div>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={3}
          className={input}
          placeholder="A short descriptive summary used as the meta description and in search results…"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            className="px-3 py-1 text-xs border border-stone-300 rounded text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
          >
            {generatingSummary ? 'Generating…' : 'Generate summary'}
          </button>
          {generateSummaryError && (
            <span className="text-xs text-red-600">{generateSummaryError}</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-500 mb-1">
          Draft note <span className="font-normal">(AI-generated)</span>
        </label>
        {noteDraft ? (
          <>
            <div className="w-full px-3 py-2 border border-stone-200 rounded bg-stone-50 text-stone-500 text-sm leading-relaxed whitespace-pre-wrap">
              {noteDraft}
            </div>
            <button
              type="button"
              onClick={() => setEditorialIntroduction(noteDraft)}
              className="mt-2 px-3 py-1 text-xs border border-stone-300 rounded text-stone-600 hover:bg-stone-100 transition-colors"
            >
              Use this draft
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={generating}
              className="px-3 py-1.5 text-xs border border-stone-300 rounded text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating…' : 'Generate draft'}
            </button>
            {generateError && (
              <p className="mt-1 text-xs text-red-600">{generateError}</p>
            )}
          </>
        )}
      </div>

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

      {/* Featured slot */}
      <div className="border border-stone-200 rounded p-4 space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="featured"
            id="featured"
            defaultChecked={initialFeatured}
            className="rounded border-stone-300"
          />
          <label htmlFor="featured" className="text-sm font-medium text-stone-700">
            Feature this text on the homepage
          </label>
        </div>
        <p className="text-xs text-stone-400 -mt-2">
          One text is shown at a time — the most recently featured wins. Feast days take priority over editorial picks.
        </p>
        <div>
          <label className={label} htmlFor="featured_from">Featured from</label>
          <input
            type="date"
            name="featured_from"
            id="featured_from"
            defaultValue={initialFeaturedFrom}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="featured_note">Curator&rsquo;s note</label>
          <p className="text-xs text-stone-400 mb-1">Why is this text worth reading now? Shown on the homepage below the title.</p>
          <textarea
            name="featured_note"
            id="featured_note"
            rows={4}
            defaultValue={initialFeaturedNote}
            className={input}
            placeholder="Here is why I chose this text this week…"
          />
        </div>
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
