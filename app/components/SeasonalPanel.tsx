/**
 * SeasonalPanel — an inset liturgical season panel.
 *
 * Visual targets from the approved mock:
 *   - Double border: outer panel border + inset gold keyline ~28px inside
 *   - "✠ THE CHRISTIAN YEAR" in gold spaced small caps
 *   - Large italic Cormorant season name
 *   - Subtitle in gold italic (not muted)
 *   - Body text in warm cream at comfortable measure and leading
 *   - "Read for the season" in gold small caps above the CTA
 *   - CTA link in gold with underline
 *   - Arch emblem right (§ glyph when no pick; text initial when pick set)
 *
 * Driven entirely by CURRENT_SEASON — no DB model, no season resolution.
 * Update the config object to change season. Out of scope: curated seasonal
 * collections, church-year row destinations, feast-day variant.
 *
 * The whole panel is a single click target (one <Link> wraps everything),
 * so the CTA text and arch emblem below are plain visual affordances, not
 * separate interactive elements — this avoids nesting <a> inside <a> and
 * keeps it to exactly one text-open event per click.
 *
 * Analytics: text-open on the panel link, from="seasonal-panel".
 */

import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { LancetArch } from './LancetArch'

type SeasonPick = {
  title: string
  author: string
  href: string
  /** Optional author portrait for the arch; falls back to the initial when unset. */
  imageUrl?: string | null
}

type SeasonConfig = {
  name: string
  subtitle: string
  colour: string          // panel background (liturgical)
  note: string            // evergreen season note (~50–60 chars measure)
  pick: SeasonPick | null
}

// ── Liturgical colours ───────────────────────────────────────────────────────
//   Advent / Lent:   #4A3F6B  (violet)
//   Eastertide:      #7A6020  (gold-ochre)
//   Trinitytide:     #3F5A43  (green)
//   Feast days:      #5A3020  (dark ochre)
// ── Update this config to change the active season ──────────────────────────
const CURRENT_SEASON: SeasonConfig = {
  name: 'Trinitytide',
  subtitle: 'The season after Pentecost · Green',
  colour: '#3F5A43',
  note: 'We are in the long green season after Pentecost — the weeks after Trinity in which the Church tends its life in the world. A season for wisdom literature, for letters of counsel, for texts on the daily practice of virtue.',
  pick: { title: 'A Short Rule of Life', author: 'John Wycliffe', href: '/texts/a-short-rule-of-life' },
}
// ────────────────────────────────────────────────────────────────────────────

// Reversed-out palette on the liturgical colour ground
const R = {
  title:      'rgba(245,240,230,0.95)',
  note:       'rgba(245,240,230,0.88)',
  rule:       'rgba(245,240,230,0.16)',
  dim:        'rgba(245,240,230,0.55)',
  gold:       'rgb(224,200,134)',
  goldFaint:  'rgba(224,200,134,0.55)',
  cta:        'rgb(224,200,134)',
}

// Small-caps label style — reused for "THE CHRISTIAN YEAR" and "READ FOR THE SEASON"
const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: 'var(--text-sm)',
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: R.gold,
}

// Concave corner radius — increase for more dramatic plaque cut, decrease to soften
const CORNER_R = 14

export async function SeasonalPanel() {
  const s = CURRENT_SEASON
  const hasNoPick = s.pick === null

  // Slug for analytics — derived from the href rather than hardcoded, so it
  // stays correct if CURRENT_SEASON.pick.href ever changes.
  const pickSlug = s.pick ? s.pick.href.split('/').filter(Boolean).pop() : undefined

  // Portrait for the arch. A config `imageUrl` wins (manual override); otherwise
  // resolve the pick text's author from the DB and use their stored portrait,
  // falling back to the author initial when there is none.
  let pickImageUrl: string | null = s.pick?.imageUrl ?? null
  if (s.pick && !pickImageUrl && pickSlug) {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('texts')
      .select('author:authors(image_url)')
      .eq('slug', pickSlug)
      .eq('published', true)
      .single()
    const author = data?.author as unknown as { image_url: string | null } | null
    pickImageUrl = author?.image_url ?? null
  }

  const panelHref = s.pick ? s.pick.href : '/texts'
  const panelUmamiProps = s.pick
    ? {
        'data-umami-event': 'text-open',
        'data-umami-event-from': 'seasonal-panel',
        'data-umami-event-text': pickSlug,
        'data-umami-event-author': s.pick.author,
      }
    : {}

  // CSS radial-gradient technique for concave (inverted) corner cuts.
  // Four gradients, one per corner, each covering a 51%×51% quadrant.
  // Transparent at the corner, panel colour at radius CORNER_R — creates
  // the concave spandrel. Transparent areas reveal var(--paper) behind.
  const concaveBg = [
    `radial-gradient(circle at 0% 0%,     transparent ${CORNER_R}px, ${s.colour} ${CORNER_R}px)`,
    `radial-gradient(circle at 100% 0%,   transparent ${CORNER_R}px, ${s.colour} ${CORNER_R}px)`,
    `radial-gradient(circle at 0% 100%,   transparent ${CORNER_R}px, ${s.colour} ${CORNER_R}px)`,
    `radial-gradient(circle at 100% 100%, transparent ${CORNER_R}px, ${s.colour} ${CORNER_R}px)`,
  ].join(', ')

  return (
    <section className="content-shell">
      {/* ── Outer panel: concave-corner plaque shape ── */}
      <div
        style={{
          backgroundImage: concaveBg,
          backgroundSize: '51% 51%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left, top right, bottom left, bottom right',
          padding: '28px',
          filter: 'drop-shadow(0px 2px 0px rgba(30,30,25,0.05)) drop-shadow(0px 22px 40px rgba(30,30,25,0.35))',
        }}
      >
        {/* ── Inset gold keyline border — the whole panel's click target ── */}
        <Link
          href={panelHref}
          {...panelUmamiProps}
          className="block no-underline border border-[rgba(201,148,58,0.32)] transition-[border-color,transform,box-shadow] duration-200 ease-out hover:border-[rgba(201,148,58,0.6)] hover:-translate-y-0.5 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9943A] focus-visible:border-[rgba(201,148,58,0.6)]"
          style={{
            padding: '1.75rem 2rem',
            boxShadow: 'rgba(30,30,25,0.05) 0px 2px 0px, rgba(30,30,25,0.45) 0px 22px 50px -28px',
          }}
        >
          <div
            className={`flex gap-10 ${hasNoPick
              ? 'flex-col sm:flex-row sm:items-center'
              : 'flex-col sm:flex-row sm:items-start'
            }`}
          >
            {/* ── Left: text content ──────────────────────────────── */}
            <div className="flex-1 min-w-0">

              {/* Section label: ✠ THE CHRISTIAN YEAR */}
              <p style={{ ...LABEL_STYLE, fontSize: 'var(--text-base)', marginBottom: '1rem' }}>
                ✠ The Christian Year
              </p>

              {/* Season name */}
              <h2
                style={{
                  fontFamily: 'var(--serif-cormorant)',
                  fontStyle: 'italic',
                  fontSize: 'clamp(2.25rem, 5vw, 3.25rem)',
                  fontWeight: 400,
                  color: R.title,
                  lineHeight: 1.05,
                  marginBottom: '0.4rem',
                }}
              >
                {s.name}
              </h2>

              {/* Subtitle — gold italic */}
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 'var(--text-base)',
                  color: R.gold,
                  letterSpacing: '0.02em',
                  marginBottom: '1.5rem',
                }}
              >
                {s.subtitle}
              </p>

              <hr
                style={{
                  borderColor: R.rule,
                  borderTopWidth: '1px',
                  marginBottom: '1.25rem',
                }}
              />

              {/* Body note — warm cream, comfortable measure */}
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 'var(--text-xl)',
                  lineHeight: 1.75,
                  color: R.note,
                  maxWidth: '46ch',
                }}
              >
                {s.note}
              </p>

              {/* "Read for the season" + CTA (visual affordance only — the
                  whole panel is the click target, see the wrapping Link above) */}
              <div style={{ marginTop: '1.5rem' }}>
                <p style={{ ...LABEL_STYLE, marginBottom: '0.4rem' }}>
                  Read for the season
                </p>
                {s.pick ? (
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 'var(--text-xl)',
                      color: R.cta,
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                      textDecorationColor: R.goldFaint,
                    }}
                  >
                    {s.pick.title} →
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontStyle: 'italic',
                      fontSize: 'var(--text-xl)',
                      color: R.cta,
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                      textDecorationColor: R.goldFaint,
                    }}
                  >
                    Browse the library →
                  </span>
                )}
              </div>
            </div>

            {/* ── Right: arch emblem (visual only — see wrapping Link above) ── */}
            <div
              className="shrink-0 mx-auto sm:mx-0"
              style={{
                width: hasNoPick ? 'clamp(90px, 14vw, 130px)' : 'clamp(110px, 18vw, 150px)',
                aspectRatio: '200 / 380',
              }}
            >
              {s.pick ? (
                <div className="opacity-90">
                  <LancetArch
                    initial={s.pick.author.charAt(0)}
                    label={`${s.pick.title} by ${s.pick.author}`}
                    imageUrl={pickImageUrl}
                  />
                  <div className="mt-2 text-center">
                    <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: R.title, lineHeight: 1.3 }}>
                      {s.pick.title}
                    </p>
                    <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-sm)', color: R.dim, marginTop: '0.2rem' }}>
                      {s.pick.author}
                    </p>
                  </div>
                </div>
              ) : (
                /* No pick — § emblem, deliberate and present */
                <div style={{ opacity: 0.72 }}>
                  <LancetArch initial="§" label="Seasonal emblem" />
                </div>
              )}
            </div>

          </div>
        </Link>
      </div>
    </section>
  )
}
