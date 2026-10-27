---
version: alpha
name: Stromata Library
description: A reading-room library for timeless Christian texts. Antique serif type with real small caps, warm parchment pages, a cool slate-blue accent beside gilt rules, and book covers coloured by tradition.
source_of_truth: app/globals.css
colors:
  primary: "#2C4A6B"        # --accent
  primary-hover: "#1E3552"  # --accent-hover
  secondary: "#C9943A"      # --gold (rules, large glyphs)
  secondary-ink: "#8A5F1E"  # --gold-ink (gold TEXT, AA on paper)
  neutral: "#F5F0E6"        # --paper (page ground)
  neutral-deep: "#EDE6D6"   # --paper-deep
  surface: "#FAF6EC"        # --vellum (raised panels, popovers)
  on-surface: "#1E2D3D"     # --ink
  on-surface-soft: "#3D4B5C" # --ink-soft
  muted: "#61697A"          # --ink-mute (AA on paper)
  border: "#C9BFA8"         # --rule
  border-soft: "#DDD3BD"    # --rule-soft
  reader-text: "#1B1B1B"    # --reader-text (long-form body)
  hero-ground: "#1E2D3D"    # --hero-ground (dark frontispiece)
  footer-ground: "#1C1814"  # --dark
  on-dark: "rgba(245,240,230,0.95)"
  on-dark-gold: "rgb(224,200,134)"
  error: "#92400E"          # --notice-text (amber notice, not red)
typography:
  hero:
    fontFamily: "IM Fell English"
    fontSize: "clamp(3.7rem, 8vw, 6.5rem)"   # homepage masthead
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  display:
    fontFamily: "IM Fell English"
    fontSize: "clamp(2.75rem, 5vw, 4rem)"    # --text-hero, reader frontispiece title
    fontWeight: 400
    lineHeight: 1.1
  headline:
    fontFamily: "Junicode"
    fontSize: "3rem"                          # --text-display
    fontWeight: 400
    lineHeight: 1.2
  headline-italic:
    fontFamily: "Junicode"
    fontStyle: italic
    fontSize: "clamp(1.4rem, 3vw, 2rem)"      # featured-lead titles, section headers
    fontWeight: 400
    lineHeight: 1.2
  body-lg:
    fontFamily: "Junicode"
    fontSize: "1.5rem"                        # --text-xl
    lineHeight: 1.5
  prose:
    fontFamily: "Junicode"
    fontSize: "1.25rem"                       # --text-prose, the reading body
    lineHeight: 2                             # leading-loose
  body:
    fontFamily: "Junicode"
    fontSize: "1rem"                          # --text-base
    lineHeight: 1.55
  label:
    fontFamily: "Junicode"
    fontSize: "0.875rem"                      # --text-label
    lineHeight: 1.3
  kicker:
    fontFamily: "Junicode"
    fontFeatureSettings: "\"smcp\" 1"         # REAL small caps; never text-transform
    fontSize: "1rem"                          # --text-smallcaps
    letterSpacing: "0.08em"
  caption:
    fontFamily: "Junicode"
    fontSize: "0.8rem"                        # --text-sm
    letterSpacing: "0.12em"
rounded:
  none: 0px
  hairline: 2px
  sm: 4px
spacing:
  grid-column: 52px
  grid-gutter: 32px
  content-area: 976px      # 12 columns
  content-max: 1024px
  reading-measure: 808px   # 10 columns
  frame-max: 1440px
  rail-width: 200px
motion:
  ease: "cubic-bezier(.2,.6,.2,1)"
  fast: 120ms
  base: 200ms
  slow: 320ms
components:
  book-cover:
    backgroundColor: "lib/tradition-colors.ts (maroon / ink / forest grounds by tradition)"
    textColor: "{colors.on-dark}"
    aspectRatio: "2/3"
    rounded: "{rounded.none}"
  text-link:
    textColor: "{colors.secondary-ink}"
    typography: "{typography.label}"
    border: "1px solid --gold-rule (underline)"
  kicker:
    typography: "{typography.kicker}"
    textColor: "{colors.muted}"   # .kicker-gold uses secondary-ink
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "small caps, 0.8rem, 0.08em tracking"
    border: "1px solid --rule (--on-dark-border on dark)"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  rule:
    borderTop: "1px solid --gold-rule (rule-gold) or --rule (rule-muted)"
  search-input:
    backgroundColor: "transparent"
    border: "single underline that draws in on focus"
    rounded: "{rounded.none}"
  popover:
    backgroundColor: "{colors.surface}"
    border: "1px solid --gold-rule"
    rounded: "{rounded.hairline}"
---

# Stromata Library

> This file describes the design as built. **`app/globals.css` `:root` is the source of truth**; the
> values above are copied from it, and `/design` renders every token live. If the two disagree,
> `globals.css` wins and this file is stale.

## Overview
The Stromata is a library, not a magazine. Nothing on it is news; every text is centuries old and meant to
be read slowly. The design should feel like a reading room in an old college library: quiet, warm,
ordered, and serious without being severe. Two moods share the site. The **public rooms** (homepage, index
and entity pages) are a library catalogue: shelves of book covers, labels in small caps, gilt rules.
The **reader** (`/texts/[slug]`) is a printed book: a dark frontispiece, then a single 808px column of
large, loosely leaded serif prose with a drop cap and marginalia.

The homepage opens on a dark night-sky hero (`NocturneField`) with the masthead in IM Fell English. The
seasonal panel below it follows the liturgical year, so the home page changes colour with the Church
calendar.

## Colors
- **Paper (#F5F0E6)** is the page ground everywhere outside the hero and footer. `--paper-deep` and
  `--paper-edge` step it darker for bands; `--vellum` (#FAF6EC) lifts it for panels and popovers. Pure
  white is not used.
- **Ink (#1E2D3D)** is a navy-black for UI text. Long-form reading text is a near-neutral `--reader-text`
  (#1B1B1B), because a tinted ink tires the eye over forty minutes.
- **Accent (#2C4A6B)** is a cool slate blue, the only cool accent among comparable editorial sites. It
  echoes the night-sky hero and the ink.
- **Gold (#C9943A)** is the warm partner: gilt hairlines, ornaments, editorial labels. Use `--gold` for
  rules and large glyphs and `--gold-ink` (#8A5F1E) for any gold *text*, which is the AA-compliant variant.
- **Tradition grounds** (`lib/tradition-colors.ts`) give each book cover a dark, bookbinding colour by
  tradition: oxblood for Patristic, forest for Reformed, slate for Anglican, and so on.
- **Liturgical seasons** (`--season-*`): violet for Advent and Lent, gold-ochre for Eastertide, green for
  Trinitytide, dark ochre for feasts.
- **Reversed-out cream** (`--on-dark*`) is paper's RGB at varying alpha, for text on covers, the hero, the
  seasonal panel and the footer.

## Typography
One serif family, Junicode, does nearly all the work: body, headings, labels and captions. It is a
scholar's face, built for medieval texts, with a variable weight axis and a genuine small-caps table.
**IM Fell English**, a 17th-century Oxford face, is reserved for display: the masthead, the reader's
frontispiece title, and the drop cap. There is no sans-serif on the public site today. A deliberately
chosen humanist sans for UI furniture (navigation, chips, metadata) is planned under the Distinctive
Visual Identity epic; until that face is chosen, `body` is set in the serif so nothing falls back to
the browser's default sans.

- **Prose** is 1.25rem on a loose leading, in an 808px column. This is the most important type on the site.
  Quotes and dashes are made typographic at render time (`lib/markdown/smart-punctuation.ts`), so the
  stored text stays as imported.
- **Labels and kickers** use real small caps (`.kicker`, `.kicker-gold`, `.smallcaps`): sentence-case
  source, `font-feature-settings: "smcp" 1`, letter-spacing 0.08em, at 1rem so the small caps carry the
  same weight as the surrounding text. Never letterspaced uppercase, which is the tell of a face without
  small caps.
- **Headings** are mostly regular-weight italic Junicode; weight stays at 400 throughout. Hierarchy comes
  from size, italic, and space, not bold.
- Use the `--text-*` scale in components, never raw rem values.

## Layout
A 12-column grid of 52px columns and 32px gutters gives a 976px content area inside a 1024px shell. The
reading column is 10 columns (808px). On wide screens (≥1400px) a 200px marginalia rail sits outside the
measure, inside a 1440px frame, for the author aside and table of contents.

Sections are separated by generous vertical space and hairline rules rather than boxes. Index pages are
grids of 2:3 book covers; feature slots pair one cover with a kicker, an italic title, a byline and a short
paragraph.

## Elevation & Depth
Mostly flat. The one deliberate exception is the **seasonal panel**, which casts `--shadow-panel` so it
reads as a pressed card lying on the page. Popovers get a soft shadow. Nothing else is raised, and
shadows are always tokens, never hand-written `rgba()`.

## Shapes
Rectangular. Covers, panels, chips and inputs are square-cornered; popovers and reader-settings controls
take 2–4px at most. The only round shapes are on the reader-settings toggle and the hero's orbits.

## Components
- **Book cover** (`BookCover.tsx`): tradition-coloured ground, top band with the Stromata mark and an
  accession number (№ 07) above a cream hairline, then title and author in cream. The library's
  signature object.
- **Text links / CTAs** are typographic: gold-ink text with a gold hairline underline. There are no filled
  buttons on the public site.
- **Search** is a single underline that draws in on focus, with no box.
- **Theme chips** are small-caps tags in a square hairline frame, in a light and a dark tone.
- **Scripture references** carry a dotted gold underline and open a vellum popover with the KJV verse.
- **Reader settings** let a reader switch to a warm dark theme (`[data-reader-theme="dark"]`), which flips
  the paper and ink tokens only. Covers, the hero, and seasonal grounds stay as they are.

## Do's and Don'ts
- Do let the texts lead: the reader page is the product, and every other page is a way into it.
- Do use real small caps for labels, and gold-ink for gold text.
- Do use tokens for every colour in a `style` prop. The lint rule in `.eslintrc.cjs` enforces this in CI.
- Do keep shadows for the seasonal panel and popovers only.
- Don't add a sans-serif except the one the identity epic chooses, and then only for furniture, never
  inside a text.
- Don't add a filled CTA button or a second accent colour.
- Don't letterspace uppercase labels.
- Don't use pure white or pure black on the public site.
- Don't crowd the reading column; 808px and loose leading are deliberate.
