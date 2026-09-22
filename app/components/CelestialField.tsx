// Populate the entire circumference: a partial cluster rotates out of the
// crop and leaves the hero starless for part of its eight-minute revolution.
// Every star sits on a ring's centreline and remains inside its 24px half-width.
const STAR_RING_ANGLES = [
  [720, [6, 49, 96, 142, 184, 231, 277, 323]],
  [648, [18, 62, 108, 153, 199, 243, 290, 336]],
  [576, [2, 46, 93, 138, 182, 228, 274, 319]],
  [504, [14, 59, 105, 151, 195, 239, 285, 330]],
  [432, [7, 52, 98, 143, 188, 233, 278, 324]],
  [360, [22, 67, 112, 158, 203, 248, 293, 339]],
  [288, [11, 56, 101, 146, 191, 236, 281, 326]],
  [216, [26, 71, 116, 161, 206, 251, 296, 341]],
  [144, [9, 54, 99, 144, 189, 234, 279, 324]],
  [72, [24, 69, 114, 159, 204, 249, 294, 339]],
] as const

const STAR_SCALES = [0.48, 0.62, 0.52, 0.68, 0.46, 0.58, 0.5, 0.64] as const
const ORBITING_STARS = STAR_RING_ANGLES.flatMap(([radius, angles], ringIndex) =>
  angles.map((angle, starIndex) => [
    radius,
    angle,
    STAR_SCALES[(starIndex + ringIndex * 3) % STAR_SCALES.length],
    (starIndex * 17 + ringIndex * 11) % 34,
  ] as const)
)

function ManuscriptStar({
  x,
  y,
  scale,
  rotation,
}: {
  x: number
  y: number
  scale: number
  rotation: number
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      <path
        d="M0-20 3.8-5.5 14-14 5.8-3.2 21 0 5.5 3.7 14 15 3.2 6 0 22-3.5 6-15 15-6 3.3-21 0-5.8-3.6-14-14-3.6-5.6Z"
        fill="url(#celestial-gold)"
        stroke="var(--cosmos-gold-light)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle r="2.7" fill="var(--cosmos-gold-light)" opacity="0.82" />
    </g>
  )
}

/**
 * An original, scalable celestial diagram inspired by medieval cosmologies.
 * It is decorative: the hero owns the accessible content and reduced-motion
 * rules in globals.css stop the single rotating layer.
 */
export function CelestialField() {
  return (
    <div className="celestial-field" aria-hidden="true">
      <div className="celestial-orbit">
        <svg viewBox="-240 -240 1680 1680" role="presentation">
          <defs>
            <linearGradient id="celestial-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--cosmos-gold-light)" />
              <stop offset="0.48" stopColor="var(--cosmos-gold)" />
              <stop offset="1" stopColor="var(--cosmos-gold-deep)" />
            </linearGradient>
            <filter id="celestial-waver" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="17" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>

          <g>
            <g filter="url(#celestial-waver)" fill="none">
              {[720, 648, 576, 504, 432, 360, 288, 216, 144, 72].map((radius, index) => (
                <g key={radius}>
                  <circle
                    cx="600"
                    cy="540"
                    r={radius}
                    stroke={index % 2 === 0 ? 'var(--cosmos-ring)' : 'var(--cosmos-ring-alt)'}
                    strokeWidth="48"
                    opacity={index % 2 === 0 ? 0.22 : 0.14}
                  />
                  <circle cx="600" cy="540" r={radius + 24} stroke="var(--cosmos-night)" strokeWidth="4.5" opacity="0.84" />
                  <circle cx="600" cy="540" r={radius - 24} stroke="var(--cosmos-gold-light)" strokeWidth="1.4" opacity="0.48" />
                </g>
              ))}
            </g>

            <g opacity="0.9">
              {ORBITING_STARS.map(([radius, angle, scale, rotation]) => {
                const radians = angle * Math.PI / 180
                const x = 600 + Math.cos(radians) * radius
                const y = 540 + Math.sin(radians) * radius
                return (
                  <ManuscriptStar
                    key={`${radius}-${angle}`}
                    x={x}
                    y={y}
                    scale={scale}
                    rotation={rotation}
                  />
                )
              })}
            </g>
          </g>
        </svg>
      </div>
      <div className="celestial-vignette" />
      <div className="celestial-paper-grain" />
    </div>
  )
}
