/**
 * LancetArch — a pointed Gothic (lancet) arch frame for author portraits.
 *
 * Geometry: long vertical sides, pointed Gothic head — clearly taller than
 * wide (~1:1.9). Place inside a container pinned to the arch ratio:
 *   style={{ aspectRatio: '200 / 380', maxWidth: Npx }}
 *
 * Without `imageUrl` the author's `initial` is shown in a pure-SVG arch.
 * With `imageUrl` the photo is drawn as an HTML <img> with object-fit: cover
 * (so it always fills the opening, cropping the overflow rather than
 * letterboxing) and clipped to the arch; the gold tracery is laid over it.
 * object-fit: cover is used instead of an SVG <image preserveAspectRatio>
 * because Chrome ignores "slice" when the <image> source is itself an SVG.
 */

// The outer lancet outline in the 200×380 SVG coordinate space — used for the
// vellum fill, the initial-only backing, and the gold keyline.
const ARCH_PATH =
  'M25 350 L25 200 A150 150 0 0 1 100 70 A150 150 0 0 1 175 200 L175 350 Z'

// The same outline normalised to objectBoundingBox units (x/200, y/380) so a
// CSS clip-path scales with the element regardless of its rendered size. The
// container's aspect ratio is 200:380, so the shape is undistorted.
const ARCH_PATH_BB =
  'M0.125 0.921053 L0.125 0.526316 A0.75 0.394737 0 0 1 0.5 0.184211 A0.75 0.394737 0 0 1 0.875 0.526316 L0.875 0.921053 Z'

// Deterministic id from the image URL so the <clipPath> is unique per portrait
// without a client-only hook (LancetArch renders inside Server Components).
function clipIdFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return `lancet-clip-${(h >>> 0).toString(36)}`
}

// The gold tracery drawn over both variants — keyline, inner head line, apex.
function ArchTracery() {
  return (
    <>
      <path d={ARCH_PATH} fill="none" stroke="var(--gold)" strokeWidth="2" />
      <path
        d="M35 195 A130 130 0 0 1 100 82 A130 130 0 0 1 165 195"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        opacity="0.65"
      />
      <circle cx="100" cy="103" r="3.5" fill="var(--gold)" />
    </>
  )
}

type Props = {
  /** Single initial letter displayed in the arch when there is no photo */
  initial: string
  /** aria-label for the SVG */
  label: string
  /** Optional portrait; clipped to the arch. Falls back to the initial when absent. */
  imageUrl?: string | null
  /**
   * Per-author framing (see migration 017). The portrait is drawn object-fit:
   * cover, so these reposition/zoom the crop without touching the stored file:
   *   focusX / focusY — object-position focal point, 0–100 (%); 50/50 centres.
   *   zoom            — scale multiplier at the focal point, ≥ 1 (1 = no zoom).
   * Omitted / nullish values fall back to 50 / 50 / 1, i.e. the pre-framing look.
   */
  focusX?: number | null
  focusY?: number | null
  zoom?: number | null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function LancetArch({ initial, label, imageUrl, focusX, focusY, zoom }: Props) {
  // ── Portrait variant: HTML <img> (object-fit: cover) clipped to the arch ──
  if (imageUrl) {
    const clipId = clipIdFor(imageUrl)
    const clip = `url(#${clipId})`
    // Normalise framing, defaulting to the centred / un-zoomed look so an
    // unframed portrait renders exactly as it did before framing existed.
    const fx = clamp(focusX ?? 50, 0, 100)
    const fy = clamp(focusY ?? 50, 0, 100)
    const z = clamp(zoom ?? 1, 1, 5)
    const position = `${fx}% ${fy}%`
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }} role="img" aria-label={label}>
        {/* Clip-path definition (0×0, off-layout) */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <path d={ARCH_PATH_BB} />
            </clipPath>
          </defs>
        </svg>
        {/* Clip host: clips the vellum backing AND the (possibly zoomed) image to
            the arch. The zoom is a scale() on the <img>, so the clip lives on
            this wrapper — not the img — to keep the arch fixed to the frame while
            the photo scales within it. The gold tracery is a sibling of this host
            so its keyline is never clipped. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: clip,
            WebkitClipPath: clip,
            overflow: 'hidden',
          }}
        >
          {/* Vellum backing so any transparency reads warm */}
          <div style={{ position: 'absolute', inset: 0, background: 'var(--vellum)' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: position,
              transform: z !== 1 ? `scale(${z})` : undefined,
              transformOrigin: position,
            }}
          />
        </div>
        {/* Gold tracery overlaid, unclipped so the keyline stays crisp */}
        <svg
          viewBox="0 0 200 380"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
          aria-hidden
        >
          <ArchTracery />
        </svg>
      </div>
    )
  }

  // ── Initial variant: pure SVG ────────────────────────────────────────────
  return (
    <svg
      viewBox="0 0 200 380"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path d={ARCH_PATH} fill="var(--vellum)" />
      <ArchTracery />
      <text
        x="100"
        y="255"
        textAnchor="middle"
        fontFamily="var(--serif-cormorant)"
        fontSize="120"
        fill="var(--ink)"
        opacity="0.85"
      >
        {initial}
      </text>
    </svg>
  )
}
