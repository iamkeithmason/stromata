/**
 * LancetArch — a pointed Gothic (lancet) arch frame for author portraits.
 *
 * Geometry: long vertical sides, pointed Gothic head — clearly taller than
 * wide (~1:1.9). The SVG uses preserveAspectRatio="xMidYMid meet" so it
 * scales correctly inside a cell pinned to aspect-ratio: 200/380.
 *
 * Place inside a container with:
 *   style={{ aspectRatio: '200 / 380', maxWidth: Npx }}
 *
 * When `imageUrl` is supplied the photo is clipped to the arch opening and the
 * gold tracery is drawn over it; otherwise the author's `initial` is shown.
 */

// The outer lancet outline, shared by the fill, the clip path, and the stroke
// so the photo, its mask, and the gold keyline stay perfectly aligned.
const ARCH_PATH =
  'M25 350 L25 200 A150 150 0 0 1 100 70 A150 150 0 0 1 175 200 L175 350 Z'

// Deterministic id from the image URL so the <clipPath> is unique per portrait
// without a client-only hook (LancetArch renders inside Server Components).
function clipIdFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return `lancet-clip-${(h >>> 0).toString(36)}`
}

type Props = {
  /** Single initial letter displayed in the arch when there is no photo */
  initial: string
  /** aria-label for the SVG */
  label: string
  /** Optional portrait; clipped to the arch. Falls back to the initial when absent. */
  imageUrl?: string | null
}

export function LancetArch({ initial, label, imageUrl }: Props) {
  const clipId = imageUrl ? clipIdFor(imageUrl) : null

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
      {clipId && (
        <defs>
          <clipPath id={clipId}>
            <path d={ARCH_PATH} />
          </clipPath>
        </defs>
      )}

      {/* Outer lancet: long vertical sides, pointed Gothic head, closed base.
          Vellum fill sits behind the photo so any transparency reads warm. */}
      <path d={ARCH_PATH} fill="var(--vellum)" />

      {/* Portrait, clipped to the arch opening */}
      {imageUrl && clipId && (
        <image
          href={imageUrl}
          x="25"
          y="70"
          width="150"
          height="280"
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* Gold keyline — drawn last so it frames the photo cleanly */}
      <path d={ARCH_PATH} fill="none" stroke="var(--gold)" strokeWidth="2" />

      {/* Inner tracery line at the head */}
      <path
        d="M35 195 A130 130 0 0 1 100 82 A130 130 0 0 1 165 195"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        opacity="0.65"
      />
      {/* Apex ornament */}
      <circle cx="100" cy="103" r="3.5" fill="var(--gold)" />

      {/* Author initial, centred in the opening — only when there is no photo */}
      {!imageUrl && (
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
      )}
    </svg>
  )
}
