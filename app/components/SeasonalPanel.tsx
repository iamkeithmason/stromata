/**
 * SeasonalPanel — an inset liturgical season panel.
 *
 * Visual targets from the approved mock:
 *   - Double border: outer panel border + inset gold keyline ~28px inside
 *   - "✠ THE CHRISTIAN YEAR" in gold spaced small caps
 *   - Large italic season name
 *   - Subtitle in gold italic (not muted)
 *   - Body text in warm cream at comfortable measure and leading
 *   - "Read for the season" in gold small caps above the CTA
 *   - CTA link in gold with underline
 *   - Arch emblem right (§ glyph when no pick; text initial when pick set)
 *
 * The season comes from `resolveSeason()` (lib/liturgical/year.ts), so the
 * panel turns over on its own — Advent arrives without an edit and a deploy.
 * What stays hand-set is the *pick*: one text per season, chosen by Keith, in
 * SEASON_PICKS below. A season with no pick yet renders the designed no-pick
 * state (§ emblem, "Browse the library"), so the panel is always honest.
 * Out of scope: curated seasonal collections, feast days.
 *
 * The whole panel is a single click target (one <Link> wraps everything),
 * so the CTA text and arch emblem below are plain visual affordances, not
 * separate interactive elements — this avoids nesting <a> inside <a> and
 * keeps it to exactly one text-open event per click.
 *
 * Analytics: text-open on the panel link, from="seasonal-panel".
 */

import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { resolveSeason, type Season } from '@/lib/liturgical/year'
import { LancetArch } from './LancetArch'

type SeasonPick = {
  title: string
  author: string
  href: string
  /** Optional author portrait for the arch; falls back to the initial when unset. */
  imageUrl?: string | null
}

/** The author columns the arch needs — portrait plus its stored framing. */
type AuthorPortrait = {
  image_url: string | null
  image_focus_x: number | null
  image_focus_y: number | null
  image_zoom: number | null
}

type SeasonConfig = {
  name: string
  subtitle: string
  colour: string          // panel background (liturgical)
  note: string            // evergreen season note (~50–60 chars measure)
}

// ── Liturgical colours ───────────────────────────────────────────────────────
//   The season grounds live in globals.css as design tokens:
//     Advent / Lent        → var(--season-advent-lent)   (violet)
//     Eastertide           → var(--season-eastertide)    (gold-ochre)
//     Trinitytide          → var(--season-trinitytide)   (green)
//     Christmas / Epiphany → var(--season-feast)         (dark ochre)
//   Christmas and Epiphany take the feast ground: both are principal feasts,
//   and liturgical white cannot be a ground for cream-on-dark text.
// ────────────────────────────────────────────────────────────────────────────
const SEASON_COPY: Record<Season, SeasonConfig> = {
  advent: {
    name: 'Advent',
    subtitle: 'The weeks before the Nativity · Violet',
    colour: 'var(--season-advent-lent)',
    note: 'The weeks of waiting before the Nativity — a season that begins at the end, with the last things, and only then turns toward the manger. A season for texts on watchfulness, on judgement and mercy, and on the long patience of hope.',
  },
  christmas: {
    name: 'Christmastide',
    subtitle: 'The Twelve Days · White and gold',
    colour: 'var(--season-feast)',
    note: 'The Twelve Days — the Word made flesh, and the Church’s oldest astonishment that God should be born. A season for the Nativity sermons, for hymns of the Incarnation, for texts that dwell on eternity entering time.',
  },
  epiphany: {
    name: 'Epiphanytide',
    subtitle: 'The showing-forth · White and gold',
    colour: 'var(--season-feast)',
    note: 'The showing-forth — the light shown to the Gentiles, from the magi to the baptism in Jordan. A season for texts on manifestation and calling, on baptism, and on the slow work of recognising who has arrived.',
  },
  lent: {
    name: 'Lent',
    subtitle: 'Forty days to the Passion · Violet',
    colour: 'var(--season-advent-lent)',
    note: 'Forty days from the ashes to the tomb — the Church’s long turning, kept by fasting, almsgiving and prayer. A season for texts on repentance and self-examination, on the desert, and on the discipline that makes room for grace.',
  },
  eastertide: {
    name: 'Eastertide',
    subtitle: 'From Easter to Pentecost · White and gold',
    colour: 'var(--season-eastertide)',
    note: 'Fifty days from the empty tomb to the fire of Pentecost — the Church’s longest feast, kept standing rather than kneeling. A season for texts on resurrection and new life, on the sacraments of initiation, and on the Spirit given to the Church.',
  },
  trinitytide: {
    name: 'Trinitytide',
    subtitle: 'The season after Pentecost · Green',
    colour: 'var(--season-trinitytide)',
    note: 'We are in the long green season after Pentecost — the weeks after Trinity in which the Church tends its life in the world. A season for wisdom literature, for letters of counsel, for texts on the daily practice of virtue.',
  },
}

// ── The picks — one text per season, chosen by hand ──────────────────────────
//   This is the editorial layer and it stays human: the corpus carries almost
//   no season-marked texts (a title scan over 207 published texts returns
//   essentially nothing), so season-fit is a curator's judgement, not a query.
//   Set an entry as its text is chosen; `null` is a designed state, not a gap.
// ────────────────────────────────────────────────────────────────────────────
const SEASON_PICKS: Record<Season, SeasonPick | null> = {
  advent: null,
  christmas: { title: 'Sermon 21 (On the Feast of the Nativity)', author: 'Leo the Great', href: '/texts/sermon-21-on-the-feast-of-the-nativity' },
  epiphany: null,
  lent: null,
  eastertide: null,
  trinitytide: { title: 'A Short Rule of Life', author: 'John Wycliffe', href: '/texts/a-short-rule-of-life' },
}

// ────────────────────────────────────────────────────────────────────────────

// Reversed-out palette on the liturgical colour ground — the cream-on-dark
// tokens from globals.css. See the "Reversed-out palette" block there.
const R = {
  title:      'var(--on-dark)',
  note:       'var(--on-dark-body)',
  rule:       'var(--on-dark-rule)',
  dim:        'var(--on-dark-mute)',
  gold:       'var(--on-dark-gold)',
  goldFaint:  'var(--on-dark-gold-soft)',
  cta:        'var(--on-dark-gold)',
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

type Props = {
  /** Defaults to today's season; passed in by the page so panel and row agree. */
  season?: Season
}

export async function SeasonalPanel({ season = resolveSeason().season }: Props = {}) {
  const copy = SEASON_COPY[season]
  const configuredPick = SEASON_PICKS[season]

  // Slug for analytics — derived from the href rather than hardcoded, so it
  // stays correct if a pick's href ever changes.
  const pickSlug = configuredPick ? configuredPick.href.split('/').filter(Boolean).pop() : undefined

  // One query does two jobs: it confirms the pick's text is actually published,
  // and it brings back the author's portrait and stored framing (focal point +
  // zoom, migration 017) so the panel crops the same way the author band does.
  //
  // The published check matters because a pick can be set for a season months
  // ahead of the text leaving /admin/drafts — as this Christmastide pick was.
  // Rather than link the homepage at a page that isn't there, an unpublished or
  // missing pick falls back to the panel's designed no-pick state.
  let pickImageUrl: string | null = configuredPick?.imageUrl ?? null
  let pickFocusX: number | null = null
  let pickFocusY: number | null = null
  let pickZoom: number | null = null
  let pickIsLive = false

  if (configuredPick && pickSlug) {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('texts')
      .select('id, author:authors(image_url, image_focus_x, image_focus_y, image_zoom)')
      .eq('slug', pickSlug)
      .eq('published', true)
      .maybeSingle()
    pickIsLive = Boolean(data?.id)
    if (pickIsLive) {
      const author = data?.author as unknown as AuthorPortrait | null
      pickImageUrl = pickImageUrl ?? author?.image_url ?? null
      pickFocusX = author?.image_focus_x ?? null
      pickFocusY = author?.image_focus_y ?? null
      pickZoom = author?.image_zoom ?? null
    }
  }

  const s = { ...copy, pick: pickIsLive ? configuredPick : null }
  const hasNoPick = s.pick === null

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
      {/* ── Outer panel: concave-corner plaque shape ──
          The hover lift lives HERE, on the same element as the drop-shadow
          filter, and not on the link inside it. A filtered element is
          rasterised into its own layer, extended by the shadow's 40px blur;
          when a *descendant* animates `transform`, WebKit invalidates only
          part of that layer and leaves artefacts — a flashing outline at the
          layer bounds, and un-repainted blocks below the panel where the blur
          overlaps the next section (both seen in Safari, 2026-09-15). With
          filter and transform on one element the whole layer is composited and
          simply moved, so there is nothing to partially invalidate.
          `has-[a:hover]` keeps the trigger area exactly the link — the click
          target — rather than the 28px plaque padding around it. ── */}
      <div
        className="transition-transform duration-200 ease-out has-[a:hover]:-translate-y-0.5 has-[a:focus-visible]:-translate-y-0.5"
        style={{
          backgroundImage: concaveBg,
          backgroundSize: '51% 51%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left, top right, bottom left, bottom right',
          padding: '28px',
          filter: 'var(--shadow-panel-drop)',
        }}
      >
        {/* ── Inset gold keyline border — the whole panel's click target ── */}
        <Link
          href={panelHref}
          {...panelUmamiProps}
          className="block no-underline border border-[color:var(--gold-border)] transition-[border-color] duration-200 ease-out hover:border-[color:var(--gold-border-strong)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)] focus-visible:border-[color:var(--gold-border-strong)]"
          style={{
            padding: '1.75rem 2rem',
            boxShadow: 'var(--shadow-panel)',
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
                  fontFamily: 'var(--serif)',
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

            {/* ── Right: arch emblem (visual only — see wrapping Link above) ──
                The ratio box holds the arch and nothing else, with the caption
                as a sibling below it — the same shape FeaturedAuthors uses.
                Putting the caption inside the box made it overflow, and the
                extra wrapper it needed collapsed the portrait variant to zero
                height (see LancetArch's note). */}
            <div
              className="shrink-0 mx-auto sm:mx-0"
              style={{ width: hasNoPick ? 'clamp(90px, 14vw, 130px)' : 'clamp(110px, 18vw, 150px)' }}
            >
              {s.pick ? (
                <>
                  <div className="opacity-90" style={{ aspectRatio: '200 / 380' }}>
                    <LancetArch
                      initial={s.pick.author.charAt(0)}
                      label={`${s.pick.title} by ${s.pick.author}`}
                      imageUrl={pickImageUrl}
                      focusX={pickFocusX}
                      focusY={pickFocusY}
                      zoom={pickZoom}
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)', color: R.title, lineHeight: 1.3 }}>
                      {s.pick.title}
                    </p>
                    <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-sm)', color: R.dim, marginTop: '0.2rem' }}>
                      {s.pick.author}
                    </p>
                  </div>
                </>
              ) : (
                /* No pick — § emblem, deliberate and present */
                <div style={{ opacity: 0.72, aspectRatio: '200 / 380' }}>
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
