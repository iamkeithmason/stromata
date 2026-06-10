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
 * A photo can later drop in as <image> inside the arch path — the
 * component is built to support this future use.
 */

type Props = {
  /** Single initial letter displayed in the arch */
  initial: string
  /** aria-label for the SVG */
  label: string
}

export function LancetArch({ initial, label }: Props) {
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
      {/* Outer lancet: long vertical sides, pointed Gothic head, closed base */}
      <path
        d="M25 350 L25 200 A150 150 0 0 1 100 70 A150 150 0 0 1 175 200 L175 350 Z"
        fill="var(--vellum)"
        stroke="var(--gold)"
        strokeWidth="2"
      />
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
      {/* Author initial, centred in the opening */}
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
