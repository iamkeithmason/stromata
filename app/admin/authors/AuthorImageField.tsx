'use client'

import { useRef, useState } from 'react'

// Shared portrait control for the new/edit author forms. Owns nothing durable —
// the parent form holds imageUrl/imageSource state and submits them with the
// author. This component just turns a Wikipedia candidate or a picked file into
// a stored portrait via /api/admin/authors/image and reports the result up.

export type AuthorImageValue = { imageUrl: string | null; imageSource: string | null }

const btn =
  'px-3 py-2 text-sm border border-stone-300 rounded bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors'

export function AuthorImageField({
  slug,
  value,
  candidateUrl,
  onChange,
}: {
  slug: string
  value: AuthorImageValue
  /** Portrait URL suggested by the last Wikipedia lookup, or null. */
  candidateUrl: string | null
  onChange: (v: AuthorImageValue) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function send(init: RequestInit) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/authors/image', init)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Upload failed.')
        return
      }
      onChange({ imageUrl: json.image_url, imageSource: json.image_source })
    } catch {
      setError('Upload failed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function importCandidate() {
    if (!candidateUrl) return
    send({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: candidateUrl, slug }),
    })
  }

  function uploadFile(file: File) {
    const form = new FormData()
    form.append('file', file)
    form.append('slug', slug)
    send({ method: 'POST', body: form })
  }

  return (
    <div className="pt-2 border-t border-stone-200">
      <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Portrait</p>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="shrink-0">
          {value.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.imageUrl}
              alt="Author portrait preview"
              className="w-24 h-32 object-cover rounded border border-stone-300 bg-stone-100"
            />
          ) : candidateUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidateUrl}
              alt="Wikipedia portrait candidate"
              className="w-24 h-32 object-cover rounded border border-dashed border-stone-300 bg-stone-100 opacity-80"
            />
          ) : (
            <div className="w-24 h-32 rounded border border-dashed border-stone-300 bg-stone-50 flex items-center justify-center text-stone-300 text-3xl font-serif">
              ✝
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-2">
          {value.imageUrl ? (
            <div className="space-y-1">
              <p className="text-xs text-stone-500 break-all">
                Stored portrait. Source:{' '}
                <span className="text-stone-600">{value.imageSource || 'unknown'}</span>
              </p>
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() => onChange({ imageUrl: null, imageSource: null })}
              >
                Clear portrait
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidateUrl && (
                <button type="button" className={btn} disabled={busy} onClick={importCandidate}>
                  {busy ? 'Importing…' : 'Use this Wikipedia portrait'}
                </button>
              )}
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? 'Uploading…' : 'Upload an image'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {!value.imageUrl && candidateUrl && (
            <p className="text-xs text-stone-400">
              Suggested from Wikipedia — confirm it’s the right figure and public domain before using.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
