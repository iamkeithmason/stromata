/**
 * ChurchYearRow — a non-interactive display of the liturgical year position.
 *
 * Interim treatment: seasons are displayed as plain text (no links, no hover),
 * with the active season marked in gold italic. This is intentionally muted —
 * it conveys "we are in Trinitytide" without implying navigation that doesn't
 * exist yet.
 *
 * The real fix (each season → curated seasonal collection) depends on the
 * seasonal-model decision and is out of scope. This component will be updated
 * once destinations are resolved.
 */

const SEASONS = [
  { name: 'Advent',      slug: 'advent' },
  { name: 'Lent',        slug: 'lent' },
  { name: 'Eastertide',  slug: 'eastertide' },
  { name: 'Trinitytide', slug: 'trinitytide' },
  { name: 'A feast day', slug: 'feast' },
]

type Props = {
  /** Slug of the currently active season */
  currentSeason: string
}

export function ChurchYearRow({ currentSeason }: Props) {
  return (
    <section className="max-w-5xl mx-auto px-6 pb-10">
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2"
        style={{ fontFamily: 'var(--serif)', fontSize: '0.8rem' }}
      >
        <span
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            fontFamily: 'var(--serif)',
            flexShrink: 0,
          }}
        >
          Church year
        </span>

        {SEASONS.map((season, i) => {
          const isActive = season.slug === currentSeason
          return (
            <span key={season.slug} className="flex items-center gap-x-5">
              {i > 0 && (
                <span
                  aria-hidden
                  style={{
                    color: 'var(--rule-soft)',
                    fontSize: '0.65rem',
                    marginRight: '-1rem',
                    userSelect: 'none',
                  }}
                >
                  ·
                </span>
              )}
              <span
                style={{
                  color: isActive ? 'var(--gold)' : 'var(--ink-faint)',
                  fontStyle: isActive ? 'italic' : 'normal',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {season.name}
              </span>
            </span>
          )
        })}
      </div>
    </section>
  )
}
