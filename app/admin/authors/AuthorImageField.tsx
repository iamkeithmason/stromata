'use client'

import { useRef, useState } from 'react'

// Shared portrait control for the new/edit author forms. Owns nothing durable —
// the parent form holds imageUrl/imageSource + framing state and submits them
// with the author. This component turns a Wikipedia candidate or a picked file
// into a stored portrait via /api/admin/authors/image, and lets the editor
// reframe it (focal point + zoom) non-destructively — the framing is stored as
// numbers and applied at render by LancetArch, the stored file is never re-cut.

export type AuthorImageValue = {
  imageUrl: string | null
  imageSource: string | null
  /** object-position focal point 0–100 (%); 50/50 centres. See migration 017. */
  focusX: number
  focusY: number
  /** scale multiplier at the focal point, ≥ 1 (1 = no zoom). */
  zoom: number
}

// Framing a fresh import/upload starts from: dead-centre, no zoom.
export const DEFAULT_FRAMING = { focusX: 50, focusY: 50, zoom: 1 }

const btn =
  'px-3 py-2 text-sm border border-stone-300 rounded bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

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
  const frameRef = useRef<HTMLDivElement>(null)
  // Drag state: pointer start + the focal point at the moment the drag began.
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)

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
      // A new image always resets framing to the centred default.
      onChange({ imageUrl: json.image_url, imageSource: json.image_source, ...DEFAULT_FRAMING })
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

  // ── Drag to reposition ────────────────────────────────────────────────────
  // Dragging the photo moves the visible crop: pull the image down and you see
  // more of the top (its head), so the focal point moves toward 0% — hence the
  // subtraction. Mapping is 1:1 with the preview box in %, clamped to 0–100.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!value.imageUrl) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, fx: value.focusX, fy: value.focusY }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.current.x) / rect.width) * 100
    const dyPct = ((e.clientY - drag.current.y) / rect.height) * 100
    onChange({
      ...value,
      focusX: clamp(drag.current.fx - dxPct, 0, 100),
      focusY: clamp(drag.current.fy - dyPct, 0, 100),
    })
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const position = `${value.focusX}% ${value.focusY}%`

  return (
    <div className="pt-2 border-t border-stone-200">
      <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Portrait</p>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="shrink-0">
          {value.imageUrl ? (
            // Wrapper clips the zoomed <img>, whose scale() would otherwise spill
            // past its box onto the neighbouring controls.
            <div className="w-24 h-32 overflow-hidden rounded border border-stone-300 bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.imageUrl}
                alt="Author portrait preview"
                style={{ objectPosition: position, transform: value.zoom !== 1 ? `scale(${value.zoom})` : undefined, transformOrigin: position }}
                className="w-full h-full object-cover"
              />
            </div>
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
                onClick={() => onChange({ imageUrl: null, imageSource: null, ...DEFAULT_FRAMING })}
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

      {/* ── Reframe: drag the WYSIWYG arch preview + zoom slider ──────────────
          The box is pinned to the arch's 200:380 ratio so vertical framing here
          matches the live site. It reframes the crop only — the stored file is
          never modified. */}
      {value.imageUrl && (
        <div className="mt-4 flex items-start gap-4">
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ width: 100, aspectRatio: '200 / 380', touchAction: 'none' }}
            className="shrink-0 relative overflow-hidden rounded-lg border border-stone-300 bg-stone-100 cursor-move select-none"
            title="Drag to reposition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageUrl}
              alt="Reframe preview"
              draggable={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: position,
                transform: value.zoom !== 1 ? `scale(${value.zoom})` : undefined,
                transformOrigin: position,
                pointerEvents: 'none',
              }}
            />
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-xs text-stone-500">
              Drag the portrait to reposition it, and zoom to fill the arch — useful when the head
              sits near an edge or the figure is small in frame. Framing is stored separately; the
              image itself isn’t changed.
            </p>
            <label className="block text-xs text-stone-500">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={value.zoom}
                onChange={e => onChange({ ...value, zoom: clamp(Number(e.target.value), 1, 5) })}
                className="w-full mt-1 accent-stone-700"
              />
            </label>
            <button
              type="button"
              className={btn}
              onClick={() => onChange({ ...value, ...DEFAULT_FRAMING })}
            >
              Reset framing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
