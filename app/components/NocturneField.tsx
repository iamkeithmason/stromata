const RING_RADII = [736, 656, 576, 496, 416, 336, 256, 176, 96] as const

// Coordinates are rounded so server and browser produce identical SVG values.
function polarPoint(radius: number, degrees: number) {
  const radians = degrees * Math.PI / 180
  return {
    x: Number((600 + Math.cos(radians) * radius).toFixed(3)),
    y: Number((540 + Math.sin(radians) * radius).toFixed(3)),
  }
}

function RingStars() {
  return (
    <g opacity="0.9">
      {RING_RADII.flatMap((radius, ringIndex) =>
        Array.from({ length: 8 }, (_, starIndex) => {
          const { x, y } = polarPoint(radius, starIndex * 45 + ringIndex * 13)
          const size = 0.55 * (0.74 + ((starIndex * 3 + ringIndex) % 5) * 0.065)
          return (
            <g
              key={`${radius}-${starIndex}`}
              transform={`translate(${x} ${y}) rotate(${(starIndex * 19 + ringIndex * 7) % 35}) scale(${size})`}
            >
              <path
                d="M0-20 3.8-5.5 14-14 5.8-3.2 21 0 5.5 3.7 14 15 3.2 6 0 22-3.5 6-15 15-6 3.3-21 0-5.8-3.6-14-14-3.6-5.6Z"
                fill="url(#nocturne-star-gold)"
                stroke="var(--cosmos-gold-light)"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle r="2.7" fill="var(--cosmos-gold-light)" opacity="0.82" />
            </g>
          )
        })
      )}
    </g>
  )
}

/** Decorative graded manuscript rings; all homepage content remains HTML above it. */
export function NocturneField() {
  return (
    <div className="celestial-field" aria-hidden="true">
      <div className="celestial-orbit">
        <svg viewBox="-240 -240 1680 1680" role="presentation">
          <defs>
            <linearGradient id="nocturne-star-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--cosmos-gold-light)" />
              <stop offset="0.5" stopColor="var(--cosmos-gold)" />
              <stop offset="1" stopColor="var(--cosmos-gold-deep)" />
            </linearGradient>
            <linearGradient id="nocturne-band-main" gradientUnits="userSpaceOnUse" x1="-140" y1="-180" x2="1340" y2="1260">
              <stop offset="0" stopColor="var(--nocturne-band-light)" />
              <stop offset="0.52" stopColor="var(--nocturne-band)" />
              <stop offset="1" stopColor="var(--nocturne-band-shadow)" />
            </linearGradient>
            <linearGradient id="nocturne-band-alt" gradientUnits="userSpaceOnUse" x1="-140" y1="-180" x2="1340" y2="1260">
              <stop offset="0" stopColor="var(--nocturne-band-alt-light)" />
              <stop offset="0.52" stopColor="var(--nocturne-band-alt)" />
              <stop offset="1" stopColor="var(--nocturne-band-alt-shadow)" />
            </linearGradient>
            <filter id="nocturne-ink-edge" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="31" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>

          <g fill="none" filter="url(#nocturne-ink-edge)">
            {RING_RADII.map((radius, index) => (
              <g key={radius}>
                <circle
                  cx="600"
                  cy="540"
                  r={radius}
                  stroke={`url(#nocturne-band-${index % 2 ? 'alt' : 'main'})`}
                  strokeWidth={index % 2 ? 63 : 67}
                  opacity="0.43"
                />
                <circle cx="600" cy="540" r={radius + 31} stroke="var(--nocturne-ink)" strokeWidth="3.8" opacity="0.84" />
                <circle cx="600" cy="540" r={radius - 31} stroke="var(--nocturne-copper)" strokeWidth="1.5" opacity="0.6" />
                <circle cx="600" cy="540" r={radius - 24} stroke="var(--nocturne-copper)" strokeWidth="0.75" opacity="0.4" />
              </g>
            ))}
          </g>

          <g stroke="var(--nocturne-copper)" strokeWidth="1.2" opacity="0.36">
            {RING_RADII.flatMap((radius, ringIndex) =>
              Array.from({ length: 24 }, (_, tickIndex) => {
                const angle = tickIndex * 15 + ringIndex * 4
                const inner = polarPoint(radius + 30, angle)
                const outer = polarPoint(radius + 30 + (tickIndex % 3 === 0 ? 9 : 5), angle)
                return (
                  <line
                    key={`${radius}-${tickIndex}`}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                  />
                )
              })
            )}
          </g>

          <RingStars />
        </svg>
      </div>
      <div className="celestial-vignette" />
      <div className="celestial-paper-grain" />
    </div>
  )
}
