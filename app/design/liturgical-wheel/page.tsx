/**
 * /design/liturgical-wheel — a NOINDEX design exploration, not linked in nav.
 *
 * Concept III from the Sept 2026 "Stromata, Four Ways" design workshop: let the
 * homepage wear the *current* liturgical season. The whole ground takes the
 * season colour (here Trinitytide green, from --season-trinitytide), the church
 * year is a wheel with today lit, and the featured reading is chosen for the
 * season. It is an evolution of the existing SeasonalPanel — the season becomes
 * the page, not a panel within it.
 *
 * This route exists so the change can be rendered and screenshotted for the
 * design-critic loop (scripts/design/critic-loop.mjs) WITHOUT touching the live
 * homepage. It reuses real published texts for authenticity. All colour comes
 * from design tokens (globals.css) — the reversed-out --on-dark-* family, which
 * is deliberately not theme-flipped because it always sits on a dark ground.
 *
 * NOT a shipping decision: nothing here is wired into navigation.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Liturgical Wheel (exploration) — The Stromata',
  robots: { index: false, follow: false },
}

// ── The wheel geometry ───────────────────────────────────────────────────────
// Four seasons around the year, clockwise from the top in liturgical order.
// Angles are degrees with 0° at the top, increasing clockwise.
const WHEEL = { cx: 100, cy: 100, ring: 82, labelR: 95 }
const SEASONS = [
  { name: 'Advent',      centre: 0,   sector: [315, 405] },
  { name: 'Lent',        centre: 90,  sector: [45, 135] },
  { name: 'Eastertide',  centre: 180, sector: [135, 225] },
  { name: 'Trinitytide', centre: 270, sector: [225, 315] },
]
const ACTIVE = 'Trinitytide'

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [WHEEL.cx + r * Math.cos(rad), WHEEL.cy + r * Math.sin(rad)]
}

function sectorPath(r: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(r, startDeg)
  const [x2, y2] = polar(r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${WHEEL.cx} ${WHEEL.cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

type SeasonPick = { title: string; slug: string; author: string }

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function LiturgicalWheelPreview() {
  // Real content for the exploration: a lead pick + a small seasonal shelf.
  // Guarded so the preview still renders if the query returns nothing.
  let lead: SeasonPick | null = null
  let shelf: SeasonPick[] = []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('texts')
      .select('title, slug, author:authors(name)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (data ?? []) as unknown as { title: string; slug: string; author: { name: string } | null }[]
    const picks: SeasonPick[] = rows.map((r) => ({ title: r.title, slug: r.slug, author: r.author?.name ?? 'Unknown' }))
    lead = picks[0] ?? null
    shelf = picks.slice(1, 5)
  } catch {
    // fall through to static exemplars below
  }

  if (!lead) {
    lead = { title: 'The Stromata, Book VII', slug: 'the-stromata-book-vii', author: 'Clement of Alexandria' }
    shelf = [
      { title: 'Small Catechism', slug: 'small-catechism', author: 'Martin Luther' },
      { title: 'On the Lapsed', slug: 'on-the-lapsed-de-lapsis-carthage', author: 'Cyprian of Carthage' },
      { title: 'Apology', slug: 'apology-tertullian', author: 'Tertullian' },
    ]
  }

  const activeSector = SEASONS.find((s) => s.name === ACTIVE)!.sector

  return (
    <div className="grain" style={{ background: 'var(--paper)', minHeight: '100vh', paddingTop: '4rem' }}>
      {/* Internal-preview banner — makes clear this is an exploration, not shipped */}
      <div
        className="content-shell"
        style={{ paddingTop: '1.5rem', paddingBottom: '0.5rem' }}
      >
        <p className="kicker" style={{ color: 'var(--ink-faint)' }}>
          Design exploration · Concept III · not linked in navigation
        </p>
      </div>

      <section className="content-shell" style={{ paddingBottom: '3rem' }}>
        {/* Season ground — the whole panel wears the liturgical colour */}
        <div
          style={{
            background: 'var(--season-trinitytide)',
            padding: '28px',
            filter: 'var(--shadow-panel-drop)',
          }}
        >
          <div
            className="border transition-colors"
            style={{
              borderColor: 'var(--gold-border)',
              padding: 'clamp(1.5rem, 4vw, 2.75rem)',
              boxShadow: 'var(--shadow-panel)',
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center" style={{ gap: 'clamp(1.5rem, 5vw, 3rem)' }}>

              {/* The wheel */}
              <div className="shrink-0 mx-auto md:mx-0" style={{ width: 'clamp(180px, 40vw, 232px)' }}>
                <svg viewBox="0 0 200 200" width="100%" role="img" aria-label="The church year as a wheel, with Trinitytide currently lit">
                  {/* lit sector for the active season */}
                  <path
                    d={sectorPath(WHEEL.ring, activeSector[0], activeSector[1])}
                    style={{ fill: 'var(--on-dark-gold-soft)', stroke: 'var(--on-dark-gold)' }}
                    strokeWidth={1}
                  />
                  {/* rings */}
                  <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.ring} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                  <circle cx={WHEEL.cx} cy={WHEEL.cy} r={58} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                  {/* spokes between the four sectors */}
                  {SEASONS.map((s) => {
                    const [x, y] = polar(WHEEL.ring, s.sector[0])
                    return <line key={s.name} x1={WHEEL.cx} y1={WHEEL.cy} x2={x.toFixed(2)} y2={y.toFixed(2)} style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                  })}
                  {/* centre label */}
                  <text x={WHEEL.cx} y={96} textAnchor="middle" style={{ fill: 'var(--on-dark-gold)', fontFamily: 'var(--serif)', fontStyle: 'italic' }} fontSize={9} letterSpacing={2}>now</text>
                  <text x={WHEEL.cx} y={109} textAnchor="middle" style={{ fill: 'var(--on-dark)', fontFamily: 'var(--serif)' }} fontSize={11} letterSpacing={1}>Trinity</text>
                  {/* season labels around the ring */}
                  {SEASONS.map((s) => {
                    const [x, y] = polar(WHEEL.labelR, s.centre)
                    const isActive = s.name === ACTIVE
                    const anchor = s.centre === 90 ? 'end' : s.centre === 270 ? 'start' : 'middle'
                    return (
                      <text
                        key={s.name}
                        x={x.toFixed(2)}
                        y={(y + 2.5).toFixed(2)}
                        textAnchor={anchor}
                        style={{ fill: isActive ? 'var(--on-dark-gold)' : 'var(--on-dark-soft)', fontFamily: 'var(--serif)' }}
                        fontSize={7.5}
                        letterSpacing={1.5}
                      >
                        {s.name.toUpperCase()}
                      </text>
                    )
                  })}
                </svg>
              </div>

              {/* The seasonal pitch */}
              <div className="min-w-0 flex-1">
                <p
                  style={{
                    fontFamily: 'var(--serif)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.24em',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--on-dark-gold)',
                    marginBottom: '0.9rem',
                  }}
                >
                  ✠ Trinitytide · the long green season
                </p>
                <h1
                  style={{
                    fontFamily: 'var(--serif-cormorant)',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: 'clamp(1.9rem, 5vw, 3rem)',
                    lineHeight: 1.1,
                    color: 'var(--on-dark)',
                    marginBottom: '1rem',
                  }}
                >
                  Read for the season
                </h1>
                <p
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-xl)',
                    lineHeight: 1.7,
                    color: 'var(--on-dark-body)',
                    maxWidth: '44ch',
                    marginBottom: '1.75rem',
                  }}
                >
                  The weeks after Pentecost, when the Church tends its life in the world — a season for
                  wisdom literature, letters of counsel, and the daily practice of virtue.
                </p>

                <Link
                  href={`/texts/${lead.slug}`}
                  className="block no-underline"
                  style={{
                    borderTop: '1px solid var(--on-dark-rule)',
                    paddingTop: '1.25rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontStyle: 'italic',
                      fontSize: 'clamp(1.3rem, 3vw, 1.75rem)',
                      color: 'var(--on-dark)',
                    }}
                  >
                    {lead.title}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 'var(--text-base)', color: 'var(--on-dark-soft)', marginTop: '0.25rem' }}>
                    {lead.author}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '0.9rem',
                      fontFamily: 'var(--serif)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--on-dark-gold)',
                      borderBottom: '1px solid var(--on-dark-gold-soft)',
                      paddingBottom: '2px',
                    }}
                  >
                    Begin reading →
                  </span>
                </Link>
              </div>
            </div>

            {/* Also for the season — a small reversed-out shelf */}
            {shelf.length > 0 && (
              <div style={{ marginTop: 'clamp(1.75rem, 4vw, 2.5rem)', borderTop: '1px solid var(--on-dark-rule)', paddingTop: '1.25rem' }}>
                <p
                  style={{
                    fontFamily: 'var(--serif)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.24em',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--on-dark-gold)',
                    marginBottom: '0.9rem',
                  }}
                >
                  Also for the season
                </p>
                <div className="flex flex-wrap" style={{ gap: '0.6rem' }}>
                  {shelf.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/texts/${t.slug}`}
                      className="no-underline"
                      style={{
                        border: '1px solid var(--on-dark-border)',
                        color: 'var(--on-dark-body)',
                        fontFamily: 'var(--serif)',
                        fontSize: 'var(--text-sm)',
                        padding: '5px 12px',
                      }}
                    >
                      {t.title}
                      <span style={{ color: 'var(--on-dark-mute)' }}> · {t.author}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* A footer note for whoever reviews this exploration */}
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 'var(--text-base)',
            color: 'var(--ink-mute)',
            maxWidth: '60ch',
            marginTop: '2rem',
          }}
        >
          What to judge: does the season ground carry the whole front page without swamping the
          content, and do the reversed-out tokens stay legible? The critic loop screenshots this
          route — try it against each of the four season colours, not only green.
        </p>
      </section>
    </div>
  )
}
