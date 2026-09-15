'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TRADITIONS, ERAS } from '@/lib/constants'
import { fetchWikipediaSuggestions } from '@/lib/authors/wikipedia'
import { AuthorImageField } from '../../AuthorImageField'

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
  initialFeastDay: string
  initialFeastDayNote: string
  initialDraft: boolean
  initialImageUrl: string | null
  initialImageSource: string | null
  initialImageFocusX: number
  initialImageFocusY: number
  initialImageZoom: number
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
  initialFeastDay,
  initialFeastDayNote,
  initialDraft,
  initialImageUrl,
  initialImageSource,
  initialImageFocusX,
  initialImageFocusY,
  initialImageZoom,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([])
  const [locationId, setLocationId] = useState<string>(String(initialLocationId ?? ''))
  const [draft, setDraft] = useState(initialDraft)

  // Fields the Wikipedia lookup can fill are controlled so it can write into
  // the empty ones. Slug, era, location, and feast fields stay uncontrolled
  // (read via FormData) — the lookup never touches them.
  const [name, setName] = useState(initialName)
  const [birthYear, setBirthYear] = useState(initialBirthYear != null ? String(initialBirthYear) : '')
  const [deathYear, setDeathYear] = useState(initialDeathYear != null ? String(initialDeathYear) : '')
  const [traditionSlug, setTraditionSlug] = useState(initialTraditionSlug)
  const [bio, setBio] = useState(initialBio)
  const [bioSource, setBioSource] = useState(initialBioSource)

  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl)
  const [imageSource, setImageSource] = useState<string | null>(initialImageSource)
  const [framing, setFraming] = useState({
    focusX: initialImageFocusX,
    focusY: initialImageFocusY,
    zoom: initialImageZoom,
  })
  const [wikiImageUrl, setWikiImageUrl] = useState<string | null>(null)

  const [wikiLoading, setWikiLoading] = useState(false)
  const [wikiNote, setWikiNote] = useState<{ type: 'success' | 'warn'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/locations')
      .then(r => r.json())
      .then(data => setLocationOptions(data ?? []))
      .catch(() => {})
  }, [])

  // Pull suggestions from Wikipedia and fill only the fields that are still
  // empty — never overwrite bio/dates/tradition an editor has already curated.
  async function lookupWikipedia() {
    if (!name.trim()) return
    setWikiLoading(true)
    setWikiNote(null)
    const result = await fetchWikipediaSuggestions(name)
    setWikiLoading(false)

    if (!result.ok) {
      setWikiNote(
        result.reason === 'not-found'
          ? { type: 'warn', text: `No Wikipedia article found for "${name}". Try a different spelling.` }
          : { type: 'warn', text: 'Could not reach Wikipedia. Check your connection and try again.' }
      )
      return
    }

    const s = result.suggestions
    setWikiImageUrl(s.imageUrl)
    const filled: string[] = []
    const skipped: string[] = []

    if (s.birthYear && !birthYear.trim()) { setBirthYear(String(s.birthYear)); filled.push('birth year') }
    else if (s.birthYear) skipped.push('birth year')

    if (s.deathYear && !deathYear.trim()) { setDeathYear(String(s.deathYear)); filled.push('death year') }
    else if (s.deathYear) skipped.push('death year')

    if (s.traditionSlug && !traditionSlug) { setTraditionSlug(s.traditionSlug); filled.push('tradition') }
    else if (s.traditionSlug) skipped.push('tradition')

    if (s.bio && !bio.trim()) { setBio(s.bio); setBioSource(bioSource.trim() || s.bioSource); filled.push('bio') }
    else if (s.bio) skipped.push('bio')

    if (filled.length === 0) {
      setWikiNote({
        type: 'warn',
        text: `Found "${s.title}", but every field it could fill already has content — nothing changed. Clear a field first if you want the Wikipedia version.`,
      })
      return
    }

    const filledText = `Filled from Wikipedia ("${s.title}"): ${filled.join(', ')}.`
    const skippedText = skipped.length ? ` Left untouched (already had content): ${skipped.join(', ')}.` : ''
    setWikiNote({ type: 'success', text: `${filledText}${skippedText} Review before saving.` })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const payload = {
      name,
      slug: (data.get('slug') as string) || null,
      tradition_slug: traditionSlug,
      birth_year: birthYear ? Number(birthYear) : null,
      death_year: deathYear ? Number(deathYear) : null,
      era_slug: (data.get('era_slug') as string) || null,
      bio: bio || null,
      bio_source: bioSource || null,
      location_id: data.get('location_id') ? Number(data.get('location_id')) : null,
      location: (data.get('location') as string) || null,
      feast_day: (data.get('feast_day') as string) || null,
      feast_day_note: (data.get('feast_day_note') as string) || null,
      draft,
      image_url: imageUrl,
      image_source: imageSource,
      image_focus_x: framing.focusX,
      image_focus_y: framing.focusY,
      image_zoom: framing.zoom,
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
      {/* Name + Wikipedia lookup */}
      <div>
        <label className={label}>Name <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className={input}
          />
          <button
            type="button"
            onClick={lookupWikipedia}
            disabled={wikiLoading || !name.trim()}
            className="shrink-0 px-4 py-2 text-sm border border-stone-300 rounded bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {wikiLoading ? 'Looking up…' : 'Fill empty fields from Wikipedia →'}
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

      <div>
        <label className={label}>
          Slug <span className="text-red-500">*</span>{' '}
          <span className="text-stone-400 font-normal">(used in the URL)</span>
        </label>
        <input name="slug" type="text" defaultValue={initialSlug} required className={input} placeholder="e.g. john-chrysostom" />
      </div>

      <div>
        <label className={label}>Tradition <span className="text-red-500">*</span></label>
        <select value={traditionSlug} onChange={e => setTraditionSlug(e.target.value)} required className={input}>
          <option value="">Select tradition…</option>
          {TRADITIONS.map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Birth year</label>
          <input type="number" value={birthYear} onChange={e => setBirthYear(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Death year</label>
          <input type="number" value={deathYear} onChange={e => setDeathYear(e.target.value)} className={input} />
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
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={8} className={input} />
      </div>

      <div>
        <label className={label}>Bio source</label>
        <input type="text" value={bioSource} onChange={e => setBioSource(e.target.value)} className={input} />
      </div>

      {/* Portrait */}
      <AuthorImageField
        slug={initialSlug}
        initial={name.charAt(0)}
        value={{ imageUrl, imageSource, ...framing }}
        candidateUrl={wikiImageUrl}
        onChange={v => {
          setImageUrl(v.imageUrl)
          setImageSource(v.imageSource)
          setFraming({ focusX: v.focusX, focusY: v.focusY, zoom: v.zoom })
        }}
      />

      {/* Location */}
      <div className="pt-2 border-t border-stone-200">
        <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Location</p>
        <div className="space-y-4">
          <div>
            <label className={label}>Country / region <span className="text-stone-400 font-normal">(optional)</span></label>
            <select name="location_id" value={locationId} onChange={e => setLocationId(e.target.value)} className={input}>
              <option value="">— select location —</option>
              {locationOptions.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Primary location <span className="text-stone-400 font-normal">(optional)</span></label>
            <input name="location" type="text" defaultValue={initialLocation} className={input} placeholder="e.g. Canterbury" />
          </div>
        </div>
      </div>

      {/* Feast day */}
      <div className="pt-2 border-t border-stone-200">
        <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Feast day</p>
        <div className="space-y-4">
          <div>
            <label className={label}>Feast day <span className="text-stone-400 font-normal">(DD/MM format, e.g. 27/01)</span></label>
            <input
              name="feast_day"
              type="text"
              defaultValue={initialFeastDay}
              className={input}
              placeholder="27/01"
              pattern="\d{2}/\d{2}"
              title="DD/MM format e.g. 27/01"
            />
          </div>
          <div>
            <label className={label}>Calendar note <span className="text-stone-400 font-normal">(optional)</span></label>
            <input
              name="feast_day_note"
              type="text"
              defaultValue={initialFeastDayNote}
              className={input}
              placeholder="e.g. Western calendar, or Roman and Eastern"
            />
          </div>
        </div>
      </div>

      {/* Draft status */}
      <div className="pt-2 border-t border-stone-200">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft}
            onChange={e => setDraft(e.target.checked)}
            className="w-4 h-4 rounded border-stone-300 accent-amber-600"
          />
          <div>
            <span className="text-sm font-medium text-stone-700">Draft — needs review</span>
            <p className="text-xs text-stone-400 mt-0.5">
              Draft authors are hidden from the public site. Uncheck when the bio is complete and the author is ready to publish.
            </p>
          </div>
        </label>
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
