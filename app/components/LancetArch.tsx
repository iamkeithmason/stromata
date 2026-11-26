/**
 * LancetArch — a pointed Gothic (lancet) arch frame for author portraits.
 *
 * Geometry: long vertical sides, pointed Gothic head — clearly taller than
 * wide (~1:1.9). Place inside a container pinned to the arch ratio:
 *   style={{ aspectRatio: '200 / 380', maxWidth: Npx }}
 *
 * Without `imageUrl` the author's `initial` is shown in the arch. When the
 * author's era has a plate (`eraSlug`, lib/eras/plates.ts) the initial sits in
 * the frame's gold, outlined dark, over a darkened window of that plate; the
 * window moves with `seed` (the author's slug) so a row of same-era authors
 * does not repeat one image. With no era it is the plain vellum arch, pure SVG.
 * With `imageUrl` the photo is drawn as an HTML <img> with object-fit: cover
 * (so it always fills the opening, cropping the overflow rather than
 * letterboxing) and clipped to the arch; the gold tracery is laid over it.
 * object-fit: cover is used instead of an SVG <image preserveAspectRatio>
 * because Chrome ignores "slice" when the <image> source is itself an SVG.
 *
 * Both variants carry the 200:380 ratio themselves, so they size identically
 * wherever they are placed. The portrait variant is a plain <div> whose
 * children are all absolutely positioned, so height: 100% alone collapses it
 * to zero inside any auto-height parent — while the SVG variant, being a
 * replaced element with an intrinsic ratio, still draws. That asymmetry hid
 * the seasonal panel's portrait entirely the day its author first had one
 * (see CHANGELOG 2026-09-15); `aspect-ratio` here removes the trap rather
 * than relying on every caller nesting the component just so.
 */

import { archPlateCrop, eraArchPlate } from '@/lib/eras/plates'

// The outer lancet outline in the 200×380 SVG coordinate space — used for the
// vellum fill, the initial-only backing, and the gold keyline.
const ARCH_PATH =
  'M25 350 L25 200 A150 150 0 0 1 100 70 A150 150 0 0 1 175 200 L175 350 Z'

// The same outline normalised to objectBoundingBox units (x/200, y/380) so a
// CSS clip-path scales with the element regardless of its rendered size. The
// container's aspect ratio is 200:380, so the shape is undistorted.
const ARCH_PATH_BB =
  'M0.125 0.921053 L0.125 0.526316 A0.75 0.394737 0 0 1 0.5 0.184211 A0.75 0.394737 0 0 1 0.875 0.526316 L0.875 0.921053 Z'

// The arch's own bounds inside the 200×380 box, stroke included: the apex sits
// at y=70 and the sills at y=350, so the full box carries 18% of empty frame
// above the arch and 8% below. A `tight` arch draws only this window.
const TIGHT = { x: 24, y: 69, w: 152, h: 282 }

// ARCH_PATH normalised to the tight window, for the clip-path.
const ARCH_PATH_TIGHT_BB = (() => {
  const X = (x: number) => +((x - TIGHT.x) / TIGHT.w).toFixed(6)
  const Y = (y: number) => +((y - TIGHT.y) / TIGHT.h).toFixed(6)
  const rx = +(150 / TIGHT.w).toFixed(6)
  const ry = +(150 / TIGHT.h).toFixed(6)
  return `M${X(25)} ${Y(350)} L${X(25)} ${Y(200)} A${rx} ${ry} 0 0 1 ${X(100)} ${Y(70)} A${rx} ${ry} 0 0 1 ${X(175)} ${Y(200)} L${X(175)} ${Y(350)} Z`
})()

/** The aspect ratio a `tight` arch's container should carry (width / height). */
export const LANCET_TIGHT_RATIO = `${TIGHT.w} / ${TIGHT.h}`

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
// `fixedStroke` keeps the keylines at 2px and 1px however large the arch is
// drawn (the tight rail portrait is ~2x the 200px it was designed at).
function ArchTracery({ fixedStroke = false }: { fixedStroke?: boolean }) {
  const ve = fixedStroke ? 'non-scaling-stroke' : undefined
  return (
    <>
      <path d={ARCH_PATH} fill="none" stroke="var(--gold)" strokeWidth="2" vectorEffect={ve} />
      <path
        vectorEffect={ve}
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
  /**
   * Defer the portrait until it nears the viewport. For long grids (the
   * /authors index) where most portraits start off-screen: portraits are
   * Supabase Storage egress on every view, so the ones never scrolled to
   * should never be fetched. Leave off for portraits on the first screen.
   */
  lazy?: boolean
  /**
   * 'frame' (default): the 200:380 box, with empty frame above and below the
   * arch, which grid callers rely on to line portraits up.
   * 'tight': the box is cropped to the arch itself (ratio LANCET_TIGHT_RATIO),
   * so the arch's apex is the element's top edge. The reader's author rail uses
   * it: at rail width the full box left ~60px of blank space over the portrait.
   */
  fit?: 'frame' | 'tight'
  /**
   * The author's era slug. With no portrait, an era that has a plate puts a
   * darkened window of it behind the initial; otherwise the vellum arch.
   */
  eraSlug?: string | null
  /** Picks the plate window (the author's slug); defaults to `label`. */
  seed?: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function LancetArch({ initial, label, imageUrl, focusX, focusY, zoom, lazy, fit = 'frame', eraSlug, seed }: Props) {
  const tight = fit === 'tight'
  const viewBox = tight ? `${TIGHT.x} ${TIGHT.y} ${TIGHT.w} ${TIGHT.h}` : '0 0 200 380'
  const ratio = tight ? LANCET_TIGHT_RATIO : '200 / 380'
  const plateSrc = imageUrl ? null : eraArchPlate(eraSlug)
  // ── Image variants: HTML <img> (object-fit: cover) clipped to the arch ──
  // A portrait, or, with no portrait, the era plate behind the initial.
  const src = imageUrl || plateSrc
  if (src) {
    const plate = !imageUrl && plateSrc ? archPlateCrop(seed ?? label, eraSlug!) : null
    const clipId = clipIdFor(src + (seed ?? label) + (tight ? '#tight' : ''))
    const clip = `url(#${clipId})`
    // Normalise framing, defaulting to the centred / un-zoomed look so an
    // unframed portrait renders exactly as it did before framing existed.
    const fx = plate ? plate.x : clamp(focusX ?? 50, 0, 100)
    const fy = plate ? plate.y : clamp(focusY ?? 50, 0, 100)
    const z = plate ? plate.zoom : clamp(zoom ?? 1, 1, 5)
    const position = `${fx}% ${fy}%`
    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%', aspectRatio: ratio }}
        role="img"
        aria-label={label}
      >
        {/* Clip-path definition (0×0, off-layout) */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <path d={tight ? ARCH_PATH_TIGHT_BB : ARCH_PATH_BB} />
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
            src={src}
            alt=""
            loading={lazy ? 'lazy' : undefined}
            decoding={lazy ? 'async' : undefined}
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
          {/* The plate is darkened so the gold initial reads over any part
              of it (a token, so the tint is tuned in one place). */}
          {plate && <div style={{ position: 'absolute', inset: 0, background: 'var(--plate-tint)' }} />}
          {/* A broad pool of shadow centred on the initial. The token centres
              it 56% down, where the letter sits in the full box; in the tight
              box the letter sits 51% down, so the layer is lifted 5%. */}
          {plate && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: tight ? '-5%' : 0,
                bottom: tight ? '5%' : 0,
                background: 'var(--plate-pool)',
              }}
            />
          )}
        </div>
        {/* Gold tracery overlaid, unclipped so the keyline stays crisp */}
        <svg
          viewBox={viewBox}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
          aria-hidden
        >
          <ArchTracery fixedStroke={tight} />
          {plate && (
            <>
            {/* A broad, soft shadow behind the letter: the darkening is
                local to the initial, so the rest of the plate stays visible.
                This is the tight half, a blur of the letter itself so the
                shadow follows its shape; the broad pool is --plate-pool. */}
            <defs>
              <filter id={`${clipId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>
            <text
              x="100"
              y="255"
              textAnchor="middle"
              fontFamily="var(--serif)"
              fontSize="120"
              fill="var(--plate-glow)"
              stroke="var(--plate-glow)"
              strokeWidth="12"
              strokeLinejoin="round"
              filter={`url(#${clipId}-glow)`}
              aria-hidden
            >
              {initial}
            </text>
            <text
              x="100"
              y="255"
              textAnchor="middle"
              fontFamily="var(--serif)"
              fontSize="120"
              fill="var(--gold)"
              stroke="var(--plate-letter-edge)"
              // A slight edge: the tight arch is drawn ~1.7x larger, so it
              // takes a thinner stroke to land at the same 2–3px.
              strokeWidth={tight ? 2 : 3.5}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {initial}
            </text>
            </>
          )}
        </svg>
      </div>
    )
  }

  // ── Initial variant: pure SVG ────────────────────────────────────────────
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path d={ARCH_PATH} fill="var(--vellum)" />
      <ArchTracery fixedStroke={tight} />
      <text
        x="100"
        y="255"
        textAnchor="middle"
        fontFamily="var(--serif)"
        fontSize="120"
        fill="var(--ink)"
        opacity="0.85"
      >
        {initial}
      </text>
    </svg>
  )
}
