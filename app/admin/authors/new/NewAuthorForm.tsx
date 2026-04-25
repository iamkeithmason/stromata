'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TRADITIONS, ERAS } from '@/lib/constants'

const input = 'w-full px-3 py-2 border border-stone-300 rounded text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white'
const label = 'block text-sm font-medium text-stone-700 mb-1'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

function extractYears(text: string): { birth: number | null; death: number | null } {
  // Match "(c. 347 – 407)" or "(347–407)" or "c. 100 – 165"
  const range = text.match(/\(?c?\.?\s*(\d{3,4})\s*[–—-]\s*(?:\d{1,2}\s+\w+\s+)?(\d{3,4})\)?/)
  if (range) return { birth: parseInt(range[1]), death: parseInt(range[2]) }
  const born = text.match(/born\s+(?:c\.?\s*)?(\d{3,4})/)
  const died = text.match(/died\s+(?:c\.?\s*)?(\d{3,4})/)
  return { birth: born ? parseInt(born[1]) : null, death: died ? parseInt(died[1]) : null }
}

function suggestTradition(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('reformed') || t.includes('calvinist') || t.includes('presbyterian')) return 'reformed'
  if (t.includes('lutheran')) return 'lutheran'
  if (t.includes('anglican') || t.includes('church of england')) return 'anglican'
  if (t.includes('methodist')) return 'methodist'
  if (t.includes('anabaptist') || t.includes('mennonite')) return 'radical-reformation'
  if (t.includes('eastern orthodox') || t.includes('greek orthodox') || t.includes('russian orthodox')) return 'eastern-orthodox'
  if (t.includes('roman catholic') || t.includes('jesuit') || t.includes('dominican') || t.includes('franciscan')) return 'roman-catholic'
  if (t.includes('church father') || t.includes('patristic') || t.includes('archbishop') || t.includes('patriarch')) return 'patristic'
  if (t.includes('early church') || t.includes('apostolic father')) return 'early-church'
  return ''
}

export default function NewAuthorForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Controlled fields so Wikipedia can pre-fill them
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [birthYear, setBirthYear] = useState('')
  const [deathYear, setDeathYear] = useState('')
  const [traditionSlug, setTraditionSlug] = useState('')
  const [bio, setBio] = useState('')
  const [bioSource, setBioSource] = useState('')

  const [wikiLoading, setWikiLoading] = useState(false)
  const [wikiNote, setWikiNote] = useState<{ type: 'success' | 'warn'; text: string } | null>(null)

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name))
  }, [name, slugEdited])

  async function lookupWikipedia() {
    if (!name.trim()) return
    setWikiLoading(true)
    setWikiNote(null)
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim())}`,
        { headers: { Accept: 'application/json' } }
      )
      if (!res.ok) {
        setWikiNote({ type: 'warn', text: `No Wikipedia article found for "${name}". Try a different spelling.` })
        return
      }
      const data = await res.json()
      const extract: string = data.extract ?? ''
      const description: string = data.description ?? ''

      const { birth, death } = extractYears(extract)
      if (birth) setBirthYear(String(birth))
      if (death) setDeathYear(String(death))

      const suggested = suggestTradition(extract + ' ' + description)
      if (suggested) setTraditionSlug(suggested)

      // First 3 sentences as bio
      const sentences = extract.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
      setBio(sentences.slice(0, 3).join(' '))
      setBioSource(`Wikipedia, cached ${new Date().toISOString().split('T')[0]}`)

      setWikiNote({ type: 'success', text: `Suggestions loaded from Wikipedia: "${data.title}". Review every field before saving.` })
    } catch {
      setWikiNote({ type: 'warn', text: 'Could not reach Wikipedia. Check your connection and try again.' })
    } finally {
      setWikiLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const payload = {
      name,
      slug: slug || null,
      tradition_slug: traditionSlug,
      birth_year: birthYear ? Number(birthYear) : null,
      death_year: deathYear ? Number(deathYear) : null,
      era_slug: (data.get('era_slug') as string) || null,
      bio: bio || null,
      bio_source: bioSource || null,
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      router.push('/admin?success=author')
    } else {
      const json = await res.json()
      setError(json.error || 'Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Name + Wikipedia lookup */}
      <div>
        <label className={label}>Name <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="e.g. John Chrysostom"
            className={input}
          />
          <button
            type="button"
            onClick={lookupWikipedia}
            disabled={wikiLoading || !name.trim()}
            className="shrink-0 px-4 py-2 text-sm border border-stone-300 rounded bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {wikiLoading ? 'Looking up…' : 'Look up on Wikipedia →'}
          </button>
        </div>
        {wikiNote && (
          <p className={`mt-2 text-xs px-3 py-2 rounded border ${
            wikiNote.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {wikiNote.text}
          </p>
        )}
      </div>

      {/* Slug */}
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
          placeholder="e.g. john-chrysostom"
        />
      </div>

      {/* Tradition */}
      <div>
        <label className={label}>Tradition <span className="text-red-500">*</span></label>
        <select
          value={traditionSlug}
          onChange={e => setTraditionSlug(e.target.value)}
          required
          className={input}
        >
          <option value="">Select tradition…</option>
          {TRADITIONS.map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Birth year</label>
          <input
            type="number"
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            className={input}
            placeholder="e.g. 354"
          />
        </div>
        <div>
          <label className={label}>Death year</label>
          <input
            type="number"
            value={deathYear}
            onChange={e => setDeathYear(e.target.value)}
            className={input}
            placeholder="e.g. 430"
          />
        </div>
      </div>

      {/* Era */}
      <div>
        <label className={label}>Era <span className="text-stone-400 font-normal">(optional)</span></label>
        <select name="era_slug" className={input}>
          <option value="">— not set —</option>
          {ERAS.map(e => (
            <option key={e.slug} value={e.slug}>{e.label}</option>
          ))}
        </select>
      </div>

      {/* Bio */}
      <div>
        <label className={label}>Bio</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={6}
          className={input}
          placeholder="Wikipedia-sourced biography, editorially reviewed…"
        />
      </div>

      {/* Bio source */}
      <div>
        <label className={label}>Bio source</label>
        <input
          type="text"
          value={bioSource}
          onChange={e => setBioSource(e.target.value)}
          className={input}
          placeholder="e.g. Wikipedia, cached 2026-04-17"
        />
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
          {loading ? 'Saving…' : 'Add author'}
        </button>
      </div>
    </form>
  )
}
