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
 *
 * The active season is no longer hand-set: it comes from `resolveSeason()`
 * (lib/liturgical/year.ts) via the page, so this row and the seasonal panel
 * cannot disagree. The six seasons listed here are the ones that tile the
 * year in that module — the earlier four left January and the Twelve Days
 * with nowhere to sit.
 */

import type { Season } from '@/lib/liturgical/year'

const SEASONS = [
  { name: 'Advent',        slug: 'advent' },
  { name: 'Christmastide', slug: 'christmas' },
  { name: 'Epiphanytide',  slug: 'epiphany' },
  { name: 'Lent',          slug: 'lent' },
  { name: 'Eastertide',    slug: 'eastertide' },
  { name: 'Trinitytide',   slug: 'trinitytide' },
]

type Props = {
  /** Slug of the currently active season — from resolveSeason(), via the page */
  currentSeason: Season
}

export function ChurchYearRow({ currentSeason }: Props) {
  return (
    <section className="content-shell pb-10">
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-base)' }}
      >
        <span className="kicker shrink-0">Texts through the year</span>

        <span aria-hidden style={{ color: 'var(--gold)', fontSize: 'var(--text-sm)', userSelect: 'none' }}>—</span>

        {SEASONS.map((season, i) => {
          const isActive = season.slug === currentSeason
          return (
            <span key={season.slug} className="flex items-center gap-x-3">
              <span
                style={{
                  color: isActive ? 'var(--gold)' : 'var(--ink-faint)',
                  fontStyle: isActive ? 'italic' : 'normal',
                  textDecorationLine: isActive ? 'underline' : 'none',
                  textDecorationColor: 'var(--gold)',
                  textUnderlineOffset: '3px',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {season.name}
              </span>
              {/* Separator after the name so a wrapped line never starts with a dot. */}
              {i < SEASONS.length - 1 && (
                <span
                  aria-hidden
                  style={{ color: 'var(--rule-soft)', userSelect: 'none' }}
                >
                  ·
                </span>
              )}
            </span>
          )
        })}
      </div>
    </section>
  )
}
