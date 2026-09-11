/**
 * /design/liturgical-wheel — a NOINDEX design exploration, not linked in nav.
 *
 * Concept III from the Sept 2026 "Stromata, Four Ways" design workshop: let the
 * homepage wear the *current* liturgical season. The whole ground takes the
 * season colour (here Trinitytide green, from --season-trinitytide), the church
 * year is a small marginal diagram, and the featured reading is chosen for the
 * season. It is an evolution of the existing SeasonalPanel — the season becomes
 * the page, not a panel within it.
 *
 * This route exists so the change can be rendered and screenshotted for the
 * design-critic loop (scripts/design/critic-loop.mjs) WITHOUT touching the live
 * homepage. It reuses real published texts for authenticity. All colour comes
 * from design tokens (globals.css) — the reversed-out --on-dark-* family, which
 * is deliberately not theme-flipped because it always sits on a dark ground.
 *
 * Critic-loop revision 3 (7/10 → folio): broke the symmetric card into a folio
 * with a true outer margin — the season wheel is demoted to a small marginal
 * diagram and the type carries the page; added a press-grain texture over the
 * green so the ground isn't flat; a thick/thin rule frame; oldstyle figures on
 * the foliation and catalogue numbers; a three-part running head anchored by a
 * centred ornament; a heavier, optically-aligned drop initial in a tighter
 * measure; a text-presentation printer's fist. The green ground stays the shared
 * --season-trinitytide token — deepening it is a global palette call.
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

// Press-grain texture (grayscale fractal noise, no colour literals) — the same
// device app/globals.css uses for .page-vellum, laid over the season ground so
// it reads as ink-on-vellum rather than a flat modern fill.
const PRESS_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")"

// ── The wheel geometry ───────────────────────────────────────────────────────
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

// A small marginal version of the church-year wheel.
function MarginWheel() {
  const activeSector = SEASONS.find((s) => s.name === ACTIVE)!.sector
  return (
    <svg viewBox="0 0 200 200" width="100%" role="img" aria-label="The church year as a wheel, with Trinitytide currently lit">
      <path d={sectorPath(WHEEL.ring, activeSector[0], activeSector[1])} style={{ fill: 'var(--on-dark-gold-soft)', stroke: 'var(--on-dark-gold)' }} strokeWidth={1} />
      <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.ring} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
      <circle cx={WHEEL.cx} cy={WHEEL.cy} r={58} fill="none" style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
      {SEASONS.map((s) => {
        const [x, y] = polar(WHEEL.ring, s.sector[0])
        return <line key={s.name} x1={WHEEL.cx} y1={WHEEL.cy} x2={x.toFixed(2)} y2={y.toFixed(2)} style={{ stroke: 'var(--on-dark-rule)' }} strokeWidth={1} />
      })}
      <text x={WHEEL.cx} y={96} textAnchor="middle" style={{ fill: 'var(--on-dark-gold)', fontFamily: 'var(--serif)', fontStyle: 'italic' }} fontSize={9} letterSpacing={2}>now</text>
      <text x={WHEEL.cx} y={109} textAnchor="middle" style={{ fill: 'var(--on-dark)', fontFamily: 'var(--serif)' }} fontSize={11} letterSpacing={1}>Trinity</text>
      {SEASONS.map((s) => {
        const [x, y] = polar(WHEEL.labelR, s.centre)
        const isActive = s.name === ACTIVE
        const anchor = s.centre === 90 ? 'end' : s.centre === 270 ? 'start' : 'middle'
        return (
          <text key={s.name} x={x.toFixed(2)} y={(y + 2).toFixed(2)} textAnchor={anchor} style={{ fill: isActive ? 'var(--on-dark-gold)' : 'var(--on-dark-mute)', fontFamily: 'var(--serif)' }} fontSize={6.5} letterSpacing={1.2}>
            {s.name.toUpperCase()}
          </text>
        )
      })}
    </svg>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function LiturgicalWheelPreview() {
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

  const note =
    'The weeks after Pentecost, when the Church tends its life in the world — a season for wisdom literature, letters of counsel, and the daily practice of virtue.'
  const dropInitial = note.charAt(0)
  const noteRest = note.slice(1)

  const SMALLCAPS = { fontFamily: 'var(--serif)', fontVariant: 'small-caps', letterSpacing: '0.16em' } as const
  const OLDSTYLE = { fontVariantNumeric: 'oldstyle-nums' } as const

  return (
    <div className="grain" style={{ background: 'var(--paper)', minHeight: '100vh', paddingTop: '4rem' }}>
      <div className="content-shell" style={{ paddingTop: '1.5rem', paddingBottom: '0.5rem' }}>
        <p className="kicker" style={{ color: 'var(--ink-faint)' }}>
          Design exploration · Concept III · not linked in navigation
        </p>
      </div>

      <section className="content-shell" style={{ paddingBottom: '3rem' }}>
        {/* Season ground with press-grain texture */}
        <div style={{ backgroundColor: 'var(--season-trinitytide)', backgroundImage: PRESS_GRAIN, padding: '26px', filter: 'var(--shadow-panel-drop)' }}>
          {/* Thick/thin liturgical rule frame: heavier gold keyline, gap, inner hairline */}
          <div style={{ border: '2px solid var(--gold-border-strong)', padding: '4px' }}>
            <div style={{ border: '1px solid var(--on-dark-rule)', padding: 'clamp(1.5rem, 4vw, 2.75rem)', boxShadow: 'var(--shadow-panel)' }}>

              {/* Running head — three parts anchored by a centred ornament, over a hairline */}
              <div className="flex items-baseline" style={{ borderBottom: '1px solid var(--on-dark-rule)', paddingBottom: '0.55rem', marginBottom: 'clamp(1.5rem, 4vw, 2.5rem)', gap: '0.75rem' }}>
                <span style={{ ...SMALLCAPS, fontSize: 'var(--text-sm)', color: 'var(--on-dark-soft)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  The Stromata · a reading room
                </span>
                <span aria-hidden style={{ fontFamily: 'var(--serif-display)', fontSize: 'var(--text-base)', color: 'var(--on-dark-gold)', lineHeight: 1 }}>✠</span>
                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--on-dark-mute)', flex: 1, textAlign: 'right', ...OLDSTYLE }}>
                  fol. iij
                </span>
              </div>

              {/* Folio body: true outer margin (wheel as marginalia) + main text column */}
              <div className="lw-folio">
                {/* Outer margin — the wheel is now a small marginal diagram */}
                <aside className="lw-margin">
                  <div style={{ width: 'clamp(104px, 20vw, 132px)' }}>
                    <MarginWheel />
                  </div>
                  <p style={{ ...SMALLCAPS, fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', marginTop: '0.75rem' }}>
                    Trinitytide
                  </p>
                  <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--on-dark-mute)', lineHeight: 1.4, marginTop: '0.15rem' }}>
                    the long green season after Pentecost
                  </p>
                </aside>

                {/* Main text column carries the page */}
                <div className="lw-main">
                  <h1 style={{ fontFamily: 'var(--serif-cormorant)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(2rem, 5vw, 3.1rem)', lineHeight: 1.05, color: 'var(--on-dark)', margin: 0 }}>
                    Read for the season
                  </h1>

                  <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-xl)', lineHeight: 1.5, color: 'var(--on-dark-body)', maxWidth: '34ch', marginTop: '1rem' }}>
                    <span
                      aria-hidden
                      style={{
                        float: 'left',
                        fontFamily: 'var(--serif-display)',
                        fontSize: '3.7em',
                        lineHeight: 0.66,
                        padding: '0.02em 0.1em 0 0',
                        marginTop: '0.04em',
                        color: 'var(--on-dark-gold)',
                      }}
                    >
                      {dropInitial}
                    </span>
                    {noteRest}
                  </p>

                  <Link href={`/texts/${lead.slug}`} className="block no-underline" style={{ borderTop: '1px solid var(--on-dark-rule)', paddingTop: '1.1rem', marginTop: '1.6rem' }}>
                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(1.35rem, 3vw, 1.8rem)', color: 'var(--on-dark)' }}>
                      {lead.title}
                    </span>
                    <span style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 'var(--text-base)', color: 'var(--on-dark-soft)', marginTop: '0.25rem' }}>
                      {lead.author}
                    </span>
                    <span style={{ display: 'inline-block', marginTop: '0.9rem', ...SMALLCAPS, fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', borderBottom: '1px solid var(--on-dark-gold-soft)', paddingBottom: '2px' }}>
                      <span aria-hidden style={{ marginRight: '0.4em', fontVariantEmoji: 'text' }}>{'☞︎'}</span>Begin reading
                    </span>
                  </Link>

                  {/* Also for the season — a ruled catalogue, oldstyle folio numbers */}
                  {shelf.length > 0 && (
                    <div style={{ marginTop: '1.75rem' }}>
                      <div style={{ borderTop: '2px solid var(--on-dark-gold-soft)', paddingTop: '3px' }}>
                        <div style={{ borderTop: '1px solid var(--on-dark-rule)', paddingTop: '1rem' }}>
                          <p style={{ ...SMALLCAPS, fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', marginBottom: '0.6rem' }}>
                            Also for the season
                          </p>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {shelf.map((t, i) => (
                              <li key={t.slug} style={{ borderBottom: '1px solid var(--on-dark-rule)' }}>
                                <Link href={`/texts/${t.slug}`} className="no-underline flex items-baseline" style={{ gap: '0.5rem', padding: '0.5rem 0' }}>
                                  <span className="min-w-0" style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexShrink: 1 }}>
                                    <span style={{ ...SMALLCAPS, letterSpacing: '0.05em', fontSize: 'var(--text-base)', color: 'var(--on-dark)', whiteSpace: 'nowrap' }}>{t.title}</span>
                                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: 'var(--on-dark-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.author}</span>
                                  </span>
                                  <span aria-hidden style={{ flex: 1, alignSelf: 'center', borderBottom: '1px dotted var(--on-dark-border)', minWidth: '1.5rem' }} />
                                  <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-sm)', color: 'var(--on-dark-gold)', whiteSpace: 'nowrap', ...OLDSTYLE }}>№ {t.accession ?? 190 - i}</span>
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
          </div>
        </div>

        <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', maxWidth: '60ch', marginTop: '1.5rem' }}>
          Reviewer note (not part of the design): does the season ground carry the whole front page
          without swamping the content, and do the reversed-out tokens stay legible? Run the critic
          loop against each of the four season colours, not only green.
        </p>
      </section>

      {/* Folio layout: stacked on mobile, asymmetric outer-margin grid on wider screens */}
      <style>{`
        .lw-folio { display: flex; flex-direction: column; gap: 1.75rem; }
        .lw-margin { display: flex; flex-direction: column; align-items: center; text-align: center; }
        @media (min-width: 768px) {
          .lw-folio { display: grid; grid-template-columns: 150px 1fr; column-gap: clamp(1.75rem, 4vw, 3rem); align-items: start; }
          .lw-margin { align-items: flex-start; text-align: left; position: sticky; top: 5rem; }
        }
      `}</style>
    </div>
  )
}
