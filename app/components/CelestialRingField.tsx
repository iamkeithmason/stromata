export type RingTreatment = 'illuminated' | 'spheres' | 'nocturne' | 'nocturne-gradient'

const PAINTED_RADII = [731, 626, 520, 414, 310, 207, 106] as const
const SPHERE_RADII = [744, 691, 638, 585, 532, 479, 426, 373, 320, 267, 214, 161, 108] as const
const CHART_RADII = [736, 656, 576, 496, 416, 336, 256, 176, 96] as const

const RING_CENTRE = { x: 600, y: 540 }

function StudyStars({ radii, scale }: { radii: readonly number[]; scale: number }) {
  return (
    <g className="celestial-study-stars">
      {radii.flatMap((radius, ringIndex) =>
        Array.from({ length: 8 }, (_, starIndex) => {
          const angle = starIndex * 45 + ringIndex * 13
          const radians = angle * Math.PI / 180
          const x = Number((RING_CENTRE.x + Math.cos(radians) * radius).toFixed(3))
          const y = Number((RING_CENTRE.y + Math.sin(radians) * radius).toFixed(3))
          const size = scale * (0.74 + ((starIndex * 3 + ringIndex) % 5) * 0.065)
          return (
            <g key={`${radius}-${starIndex}`} transform={`translate(${x} ${y}) rotate(${(starIndex * 19 + ringIndex * 7) % 35}) scale(${size})`}>
              <path
                d="M0-20 3.8-5.5 14-14 5.8-3.2 21 0 5.5 3.7 14 15 3.2 6 0 22-3.5 6-15 15-6 3.3-21 0-5.8-3.6-14-14-3.6-5.6Z"
                fill="url(#study-star-gold)"
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

function PaintedBands() {
  return (
    <>
      <g filter="url(#study-painted-edge)" fill="none">
        {PAINTED_RADII.map((radius, index) => {
          const width = [91, 88, 94, 89, 93, 88, 90][index]
          return (
            <g key={radius}>
              <circle cx="600" cy="540" r={radius} stroke={index % 2 ? 'var(--study-band-dark)' : 'var(--study-band-light)'} strokeWidth={width} opacity={index % 2 ? 0.62 : 0.52} />
              <circle cx="600" cy="540" r={radius + width / 2} stroke="var(--cosmos-night)" strokeWidth="4" opacity="0.76" />
              <circle cx="600" cy="540" r={radius - width / 2} stroke="var(--cosmos-gold-light)" strokeWidth="1.8" opacity="0.65" />
              <circle cx="600" cy="540" r={radius - width / 2 + 6} stroke="var(--study-band-highlight)" strokeWidth="2" opacity="0.3" />
            </g>
          )
        })}
      </g>
      <StudyStars radii={PAINTED_RADII} scale={0.65} />
    </>
  )
}

function NestedSpheres() {
  return (
    <>
      <g fill="none">
        {SPHERE_RADII.map((radius, index) => (
          <g key={radius}>
            <circle cx="600" cy="540" r={radius} stroke={index % 2 ? 'var(--study-sphere-dark)' : 'var(--study-sphere-light)'} strokeWidth="45" opacity={index % 2 ? 0.46 : 0.59} />
            <circle cx="600" cy="540" r={radius + 23} stroke="var(--cosmos-night)" strokeWidth="2.6" opacity="0.75" />
            <circle cx="600" cy="540" r={radius - 23} stroke="var(--study-sphere-highlight)" strokeWidth="2" opacity="0.7" />
          </g>
        ))}
      </g>
      <StudyStars radii={SPHERE_RADII} scale={0.55} />
    </>
  )
}

function ChartRings({ graded = false }: { graded?: boolean }) {
  return (
    <>
      <g fill="none" filter="url(#study-chart-edge)">
        {CHART_RADII.map((radius, index) => (
          <g key={radius}>
            <circle
              cx="600"
              cy="540"
              r={radius}
              stroke={graded
                ? `url(#study-chart-gradient-${index % 2 ? 'alt' : 'main'})`
                : index % 2 ? 'var(--study-chart-band-alt)' : 'var(--study-chart-band)'}
              strokeWidth={index % 2 ? 63 : 67}
              opacity={graded ? 0.43 : 0.34}
            />
            <circle cx="600" cy="540" r={radius + 31} stroke="var(--study-chart-ink)" strokeWidth="3.8" opacity="0.84" />
            <circle cx="600" cy="540" r={radius - 31} stroke="var(--study-chart-copper)" strokeWidth="1.5" opacity="0.6" />
            <circle cx="600" cy="540" r={radius - 24} stroke="var(--study-chart-copper)" strokeWidth="0.75" opacity="0.4" />
          </g>
        ))}
      </g>
      <g className="celestial-chart-ticks" stroke="var(--study-chart-copper)" strokeWidth="1.2" opacity="0.36">
        {CHART_RADII.flatMap((radius, ringIndex) =>
          Array.from({ length: 24 }, (_, tickIndex) => {
            const angle = tickIndex * 15 + ringIndex * 4
            const radians = angle * Math.PI / 180
            const inner = radius + 30
            const outer = inner + (tickIndex % 3 === 0 ? 9 : 5)
            return (
              <line
                key={`${radius}-${tickIndex}`}
                x1={Number((600 + Math.cos(radians) * inner).toFixed(3))}
                y1={Number((540 + Math.sin(radians) * inner).toFixed(3))}
                x2={Number((600 + Math.cos(radians) * outer).toFixed(3))}
                y2={Number((540 + Math.sin(radians) * outer).toFixed(3))}
              />
            )
          })
        )}
      </g>
      <StudyStars radii={CHART_RADII} scale={0.55} />
    </>
  )
}

export function CelestialRingField({ treatment }: { treatment: RingTreatment }) {
  return (
    <div className="celestial-field celestial-study-field" aria-hidden="true">
      <div className="celestial-orbit">
        <svg viewBox="-240 -240 1680 1680" role="presentation">
          <defs>
            <linearGradient id="study-star-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--cosmos-gold-light)" />
              <stop offset="0.5" stopColor="var(--cosmos-gold)" />
              <stop offset="1" stopColor="var(--cosmos-gold-deep)" />
            </linearGradient>
            <linearGradient id="study-chart-gradient-main" gradientUnits="userSpaceOnUse" x1="-140" y1="-180" x2="1340" y2="1260">
              <stop offset="0" stopColor="var(--study-chart-light)" />
              <stop offset="0.52" stopColor="var(--study-chart-band)" />
              <stop offset="1" stopColor="var(--study-chart-shadow)" />
            </linearGradient>
            <linearGradient id="study-chart-gradient-alt" gradientUnits="userSpaceOnUse" x1="-140" y1="-180" x2="1340" y2="1260">
              <stop offset="0" stopColor="var(--study-chart-alt-light)" />
              <stop offset="0.52" stopColor="var(--study-chart-band-alt)" />
              <stop offset="1" stopColor="var(--study-chart-alt-shadow)" />
            </linearGradient>
            <filter id="study-painted-edge" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="2" seed="12" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="B" />
            </filter>
            <filter id="study-chart-edge" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="31" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>

          {treatment === 'illuminated' && <PaintedBands />}
          {treatment === 'spheres' && <NestedSpheres />}
          {treatment === 'nocturne' && <ChartRings />}
          {treatment === 'nocturne-gradient' && <ChartRings graded />}
        </svg>
      </div>
      <div className="celestial-vignette" />
      <div className="celestial-paper-grain" />
    </div>
  )
}
