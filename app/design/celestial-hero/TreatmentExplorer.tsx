'use client'

import { useState } from 'react'
import Link from 'next/link'
import SearchBar from '@/app/SearchBar'
import { CelestialField } from '@/app/components/CelestialField'
import { CelestialRingField } from '@/app/components/CelestialRingField'

const DEMO_AUTHORS = [
  ['Augustine of Hippo', 'augustine-of-hippo'],
  ['Basil the Great', 'basil-the-great'],
  ['John Chrysostom', 'john-chrysostom'],
  ['Anselm of Canterbury', 'anselm-of-canterbury'],
  ['John Wycliffe', 'john-wycliffe'],
] as const

const TREATMENTS = [
  {
    id: 'current',
    name: 'Original',
    source: 'The earlier celestial hero',
    note: 'The restrained dark-blue composition, retained as a baseline for comparing the new ring treatments.',
  },
  {
    id: 'illuminated',
    name: 'Illuminated blue',
    source: 'Inspired by the Oresme spheres',
    note: 'Broad, softly irregular bands alternate ultramarine and misty blue. Gold stars sit inside the painted spheres; the inked frame remains.',
  },
  {
    id: 'spheres',
    name: 'Pale spheres',
    source: 'Inspired by the concentric cosmograph',
    note: 'Many narrower, evenly measured cobalt-and-pale-blue spheres with crisp dividers. A more diagrammatic reading of the second reference.',
  },
  {
    id: 'nocturne',
    name: 'Nocturne · flat',
    source: 'Inspired by the parchment universe',
    note: 'Wider muted bands, fine double copper rules and tiny measuring ticks. The darkest, most bookish reading of the parchment universe.',
  },
  {
    id: 'nocturne-gradient',
    name: 'Nocturne · graded',
    source: 'A gentle wash of light across the chart',
    note: 'The same rings and copper rules, with their pigment gradually shifting from slate blue to midnight. No shine or extra movement.',
  },
] as const

type Treatment = (typeof TREATMENTS)[number]['id']

export function TreatmentExplorer() {
  const [treatment, setTreatment] = useState<Treatment>('nocturne-gradient')
  const active = TREATMENTS.find((item) => item.id === treatment)!

  return (
    <div className="celestial-study" data-treatment={treatment}>
      <div className="celestial-study-switcher" role="group" aria-label="Celestial visual treatments">
        <span className="celestial-study-switcher-label">Visual study</span>
        {TREATMENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="celestial-study-option"
            aria-pressed={treatment === item.id}
            onClick={() => setTreatment(item.id)}
          >
            <span className={`celestial-study-swatch celestial-study-swatch-${item.id}`} aria-hidden="true" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      <section className="celestial-hero">
        {treatment === 'current' ? <CelestialField /> : <CelestialRingField treatment={treatment} />}

        <div className="celestial-hero-content">
          <h1>The Stromata</h1>
          <p className="celestial-byline">A reading room for the works of the ages.</p>
          <p className="celestial-description">
            Public-domain Christian texts, edited for legibility
          </p>

          <SearchBar tone="celestial" />

          <nav className="celestial-authors" aria-label="Recommended authors">
            <span className="celestial-authors-label">Start with</span>
            <span className="celestial-authors-rule" aria-hidden="true" />
            <span className="celestial-authors-links">
              {DEMO_AUTHORS.map(([name, slug], index) => (
                <span key={slug}>
                  {index > 0 && <span className="celestial-author-dot" aria-hidden="true">·</span>}
                  <Link href={`/authors/${slug}`}>{name}</Link>
                </span>
              ))}
            </span>
          </nav>
        </div>
      </section>

      <section className="celestial-study-controls content-shell" aria-labelledby="treatment-heading">
        <p className="kicker">Visual treatment study</p>
        <h2 id="treatment-heading">Same reading room, different heavens</h2>
        <p className="celestial-study-intro">
          Choose a treatment to compare it at full size. The public homepage is unchanged until the new design is released.
        </p>

        <div className="celestial-study-caption" aria-live="polite">
          <p className="kicker">{active.source}</p>
          <p>{active.note}</p>
        </div>
      </section>
    </div>
  )
}
