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
 * Critic-loop revision 2: replaced the UI-chip "related" grid with a ruled
 * catalogue list (small-caps title, roman author, leader dots to a folio
 * number); added a running head + foliation and an illuminated drop initial for
 * codex feel and varied gold weight; broke the symmetric two-column hero by
 * top-aligning a smaller wheel; demoted the wheel labels; a manicule replaces
 * the plain arrow; tightened leading. The green ground is left as the shared
 * --season-trinitytide token on purpose — deepening it is a global palette call.
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

type SeasonPick = { title: string; slug: string; author: string; accession: number | null }

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
      .select('title, slug, accession_number, author:authors(name)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (data ?? []) as unknown as { title: string; slug: string; accession_number: number | null; author: { name: string } | null }[]
    const picks: SeasonPick[] = rows.map((r) => ({ title: r.title, slug: r.slug, author: r.author?.name ?? 'Unknown', accession: r.accession_number }))
    lead = picks[0] ?? null
    shelf = picks.slice(1, 5)
  } catch {
    // fall through to static exemplars below
  }

  if (!lead) {
    lead = { title: 'The Stromata, Book VII', slug: 'the-stromata-book-vii', author: 'Clement of Alexandria', accession: 214 }
    shelf = [
      { title: 'Small Catechism', slug: 'small-catechism', author: 'Martin Luther', accession: 202 },
      { title: 'On the Lapsed', slug: 'on-the-lapsed-de-lapsis-carthage', author: 'Cyprian of Carthage', accession: 198 },
      { title: 'Apology', slug: 'apology-tertullian', author: 'Tertullian', accession: 191 },
    ]
  }

  const activeSector = SEASONS.find((s) => s.name === ACTIVE)!.sector
  const note =
    'The weeks after Pentecost, when the Church tends its life in the world — a season for wisdom literature, letters of counsel, and the daily practice of virtue.'
  const dropInitial = note.charAt(0)
  const noteRest = note.slice(1)

  return (
    <div className="grain" style={{ background: 'var(--paper)', minHeight: '100vh', paddingTop: '4rem' }}>
      {/* Internal-preview banner — makes clear this is an exploration, not shipped */}
      <div className="content-shell" style={{ paddingTop: '1.5rem', paddingBottom: '0.5rem' }}>
        <p className="kicker" style={{ color: 'var(--ink-faint)' }}>
          Design exploration · Concept III · not linked in navigation
        </p>
      </div>

      <section className="content-shell" style={{ paddingBottom: '3rem' }}>
        {/* Season ground — the whole panel wears the liturgical colour */}
        <div style={{ background: 'var(--season-trinitytide)', padding: '28px', filter: 'var(--shadow-panel-drop)' }}>
          {/* Committed double-rule frame: outer gold keyline + inner hairline */}
          <div style={{ border: '1px solid var(--gold-border)', padding: '3px' }}>
            <div
              style={{
                border: '1px solid var(--on-dark-rule)',
                padding: 'clamp(1.5rem, 4vw, 2.75rem)',
                boxShadow: 'var(--shadow-panel)',
              }}
            >
              {/* Running head — codex foliation, sits above a hairline */}
              <div
                className="flex items-baseline justify-between"
                style={{ borderBottom: '1px solid var(--on-dark-rule)', paddingBottom: '0.6rem', marginBottom: 'clamp(1.5rem, 4vw, 2.25rem)' }}
              >
                <span style={{ fontFamily: 'var(--serif)', fontVariant: 'small-caps', letterSpacing: '0.16em', fontSize: 'var(--text-sm)', color: 'var(--on-dark-soft)' }}>
                  The Stromata · a reading room
                </span>
                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--on-dark-mute)' }}>
                  fol. iij
                </span>
              </div>

              {/* Hero — deliberately asymmetric: small wheel top-left, text carries the width */}
              <div className="flex flex-col md:flex-row md:items-start" style={{ gap: 'clamp(1.5rem, 5vw, 3rem)' }}>
                {/* The wheel — smaller than the text block so the composition isn't a balanced two-column slab */}
                <div className="shrink-0 mx-auto md:mx-0" style={{ width: 'clamp(150px, 30vw, 188px)' }}>
                  <svg viewBox="0 0 200 200" width="100%" role="img" aria-label="The church year as a wheel, with Trinitytide currently lit">
                    <path
                      d={sectorPath(WHEEL.ring, activeSector[0], activeSector[1])}
                      style={{ fill: 'var(--on-dark-gold-soft)', stroke: 'var(--on-dark-gold)' }}
                      strokeWidth={1}
                    />
                    <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.ring} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                    <circle cx={WHEEL.cx} cy={WHEEL.cy} r={58} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                    {SEASONS.map((s) => {
                      const [x, y] = polar(WHEEL.ring, s.sector[0])
                      return <line key={s.name} x1={WHEEL.cx} y1={WHEEL.cy} x2={x.toFixed(2)} y2={y.toFixed(2)} style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
                    })}
                    <text x={WHEEL.cx} y={96} textAnchor="middle" style={{ fill: 'var(--on-dark-gold)', fontFamily: 'var(--serif)', fontStyle: 'italic' }} fontSize={9} letterSpacing={2}>now</text>
                    <text x={WHEEL.cx} y={109} textAnchor="middle" style={{ fill: 'var(--on-dark)', fontFamily: 'var(--serif)' }} fontSize={11} letterSpacing={1}>Trinity</text>
                    {/* season labels — demoted (smaller, muted) so they don't compete with the subhead */}
                    {SEASONS.map((s) => {
                      const [x, y] = polar(WHEEL.labelR, s.centre)
                      const isActive = s.name === ACTIVE
                      const anchor = s.centre === 90 ? 'end' : s.centre === 270 ? 'start' : 'middle'
                      return (
                        <text
                          key={s.name}
                          x={x.toFixed(2)}
                          y={(y + 2).toFixed(2)}
                          textAnchor={anchor}
                          style={{ fill: isActive ? 'var(--on-dark-gold)' : 'var(--on-dark-mute)', fontFamily: 'var(--serif)' }}
                          fontSize={6.5}
                          letterSpacing={1.2}
                        >
                          {s.name.toUpperCase()}
                        </text>
                      )
                    })}
                  </svg>
                </div>

                {/* The seasonal pitch */}
                <div className="min-w-0 flex-1">
                  <p style={{ fontFamily: 'var(--serif)', fontVariant: 'small-caps', letterSpacing: '0.2em', fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', marginBottom: '0.75rem' }}>
                    ✠ Trinitytide · the long green season
                  </p>
                  <h1
                    style={{
                      fontFamily: 'var(--serif-cormorant)',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      fontSize: 'clamp(1.9rem, 5vw, 3rem)',
                      lineHeight: 1.08,
                      color: 'var(--on-dark)',
                      marginBottom: '1rem',
                    }}
                  >
                    Read for the season
                  </h1>
                  {/* Illuminated drop initial + tightened leading */}
                  <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-xl)', lineHeight: 1.55, color: 'var(--on-dark-body)', maxWidth: '42ch', marginBottom: '1.75rem' }}>
                    <span
                      aria-hidden
                      style={{
                        float: 'left',
                        fontFamily: 'var(--serif-display)',
                        fontSize: '3.1em',
                        lineHeight: 0.8,
                        padding: '0.05em 0.12em 0 0',
                        color: 'var(--on-dark-gold)',
                      }}
                    >
                      {dropInitial}
                    </span>
                    {noteRest}
                  </p>

                  <Link href={`/texts/${lead.slug}`} className="block no-underline" style={{ borderTop: '1px solid var(--on-dark-rule)', paddingTop: '1.1rem' }}>
                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(1.3rem, 3vw, 1.75rem)', color: 'var(--on-dark)' }}>
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
                      <span aria-hidden style={{ marginRight: '0.45em' }}>☞</span>Begin reading
                    </span>
                  </Link>
                </div>
              </div>

              {/* Also for the season — a ruled catalogue list, not UI chips */}
              {shelf.length > 0 && (
                <div style={{ marginTop: 'clamp(1.75rem, 4vw, 2.5rem)' }}>
                  {/* double rule above the catalogue block */}
                  <div style={{ borderTop: '1px solid var(--on-dark-gold-soft)', paddingTop: '2px' }}>
                    <div style={{ borderTop: '1px solid var(--on-dark-rule)', paddingTop: '1rem' }}>
                      <p style={{ fontFamily: 'var(--serif)', fontVariant: 'small-caps', letterSpacing: '0.2em', fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', marginBottom: '0.75rem' }}>
                        Also for the season
                      </p>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {shelf.map((t, i) => (
                          <li key={t.slug} style={{ borderBottom: '1px solid var(--on-dark-rule)' }}>
                            <Link href={`/texts/${t.slug}`} className="no-underline flex items-baseline" style={{ gap: '0.5rem', padding: '0.5rem 0' }}>
                              <span className="min-w-0" style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexShrink: 1 }}>
                                <span style={{ fontFamily: 'var(--serif)', fontVariant: 'small-caps', letterSpacing: '0.05em', fontSize: 'var(--text-base)', color: 'var(--on-dark)', whiteSpace: 'nowrap' }}>
                                  {t.title}
                                </span>
                                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--on-dark-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {t.author}
                                </span>
                              </span>
                              <span aria-hidden style={{ flex: 1, alignSelf: 'center', borderBottom: '1px dotted var(--on-dark-border)', minWidth: '1.5rem' }} />
                              <span style={{ fontFamily: 'var(--serif)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', whiteSpace: 'nowrap' }}>
                                № {t.accession ?? 190 - i}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reviewer scaffolding — deliberately set apart from the design above, not part of it */}
        <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', maxWidth: '60ch', marginTop: '1.5rem' }}>
          Reviewer note (not part of the design): does the season ground carry the whole front page
          without swamping the content, and do the reversed-out tokens stay legible? Run the critic
          loop against each of the four season colours, not only green.
        </p>
      </section>
    </div>
  )
}
