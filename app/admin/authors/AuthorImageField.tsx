'use client'

import { useRef, useState } from 'react'
import { LancetArch } from '@/app/components/LancetArch'

// Shared portrait control for the new/edit author forms. Owns nothing durable —
// the parent form holds imageUrl/imageSource + framing state and submits them
// with the author. This component turns a Wikipedia candidate or a picked file
// into a stored portrait via /api/admin/authors/image, and lets the editor
// reframe it (focal point + zoom) non-destructively — the framing is stored as
// numbers and applied at render by LancetArch, the stored file is never re-cut.
//
// Every preview here renders the real `LancetArch`, never a stand-in rectangle.
// The front end never shows a portrait as-is: it is clipped to a pointed Gothic
// arch, which cuts the top corners away entirely. A rectangular preview is
// therefore honest about vertical position and zoom and silent about the crop
// that actually decides whether the head survives — and a hand-copy of the
// component's image styling is exactly the drift the design notes warn about.

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

// Preview widths (px). The arch ratio is 200:380, so height follows from these.
const THUMB_W = 96
const REFRAME_W = 132

const btn =
  'px-3 py-2 text-sm border border-stone-300 rounded bg-white hover:bg-stone-50 disabled:opacity-40 transition-colors'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function AuthorImageField({
  slug,
  name,
  value,
  candidateUrl,
  onChange,
}: {
  slug: string
  /** Author's display name — only used for the placeholder arch's initial. */
  name?: string
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
  // The arch occupies the same 200:380 box the rectangle did, so this mapping
  // is unchanged by the preview switching to LancetArch.
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
  // Matches the front end's own fallback (`author.name.charAt(0)`), so the
  // placeholder arch shows the letter the site would really draw.
  const initial = ((name || '').trim().charAt(0) || slug.charAt(0) || '?').toUpperCase()

  return (
    <div className="pt-2 border-t border-stone-200">
      <p className="text-xs uppercase tracking-widest text-stone-400 mb-4">Portrait</p>

      <div className="flex items-start gap-4">
        {/* Thumbnail slot — only for the states the reframe arch below does not
            cover. Once a portrait is stored, that arch IS the preview; showing a
            second, smaller copy of the same crop a few pixels away is noise. */}
        {!value.imageUrl && (
          <div className="shrink-0" style={{ width: THUMB_W, aspectRatio: '200 / 380' }}>
            {candidateUrl ? (
              // A candidate is previewed in the arch too, at the default framing
              // it would be imported with — so the crop is visible *before* the
              // decision to import, not after.
              <div className="opacity-80">
                <LancetArch
                  initial={initial}
                  label="Wikipedia portrait candidate, shown in the lancet arch"
                  imageUrl={candidateUrl}
                />
              </div>
            ) : (
              // No portrait at all: the site draws the initial in the arch, so
              // that is what the placeholder shows.
              <div className="opacity-60">
                <LancetArch initial={initial} label="No portrait — the arch shows the author's initial" />
              </div>
            )}
          </div>
        )}

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

      {/* ── Reframe: drag the real arch + zoom slider ─────────────────────────
          Two layers in one 200:380 box, drawn from identical framing maths so
          they register exactly:

            ghost — the full rectangle at low opacity: what is being cropped away
            arch  — the real LancetArch at full opacity: what actually ships

          The arch alone would be the truth but hides the head you are dragging
          into frame; the rectangle alone is what shipped before and hides the
          pointed-head crop. Layered, the opening reads true and the loss stays
          visible behind it. Reframing only — the stored file is never modified. */}
      {value.imageUrl && (
        <div className="mt-4 flex items-start gap-4">
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ width: REFRAME_W, aspectRatio: '200 / 380', touchAction: 'none' }}
            className="shrink-0 relative overflow-hidden ring-1 ring-stone-200 bg-stone-50 cursor-move select-none"
            title="Drag to reposition"
          >
            {/* Ghost — same box, same object-fit/position/scale as the arch's own
                <img>, so it is precisely the arch's image minus the clip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageUrl}
              alt=""
              aria-hidden
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
                opacity: 0.28,
                pointerEvents: 'none',
              }}
            />
            {/* The real arch, over the ghost. pointerEvents: none keeps the drag
                on the wrapper (which also holds the pointer capture) and stops
                the browser starting a native image-drag on the arch's <img>. */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <LancetArch
                initial={initial}
                label="Portrait framing preview, shown in the lancet arch"
                imageUrl={value.imageUrl}
                focusX={value.focusX}
                focusY={value.focusY}
                zoom={value.zoom}
              />
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-xs text-stone-500">
              This is the real arch the site draws. Drag the portrait to reposition it, and zoom to
              fill the opening — useful when the head sits near an edge or the figure is small in
              frame. The dimmed area falls outside the arch and won’t be shown. Framing is stored
              separately; the image itself isn’t changed.
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
