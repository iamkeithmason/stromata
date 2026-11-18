/**
 * ESLint config for The Stromata.
 *
 * Beyond Next's defaults this encodes the one design-system rule that has to be
 * machine-checked rather than merely documented: NO raw colour literals in
 * `style` props. Colours must come from the design tokens in app/globals.css
 * (see the /design reference page for the palette). A documented convention is
 * a probability an LLM follows most of the time; a lint rule run in CI is a
 * contract — a green PR is safe to merge without eyeballing every colour by
 * hand. LLM-generated UI reliably reaches for reasonable-but-off-palette values
 * (rgba(245,240,230,…), a second slightly-different gold, bg-gray-100), so this
 * makes the token the only expressible choice on the primary styling surface.
 *
 * Scope & limits: it targets colour literals (hex / rgb(a) / hsl(a)) inside
 * `style` JSX attributes — the dominant styling surface here, since components
 * style via inline `style={{ … var(--token) }}` rather than Tailwind colour
 * utilities. It does NOT catch colours in Tailwind arbitrary classes
 * (`bg-[#…]`) or in style objects declared as separate consts; those stay a
 * convention. Shadow/gradient colours belong in a token too (see
 * --shadow-panel, --season-*), not hand-authored inline.
 */

/**
 * The analytics race rule — the second thing that has to be machine-checked.
 *
 * `window.umami?.track(...)` fired from a mount effect is a silent coin toss.
 * The tracker loads `defer` + `afterInteractive`, React's effects routinely run
 * first, `window.umami` is undefined, and the optional chaining swallows the
 * event leaving no trace anywhere. `lib/analytics/track-when-ready.ts` exists to
 * fix exactly this, and was written up with the production evidence — and then
 * three of the four mount-effect components were never moved onto it. Over the
 * site's whole history `reader-return` (the Growth Model's North Star, measured
 * as an event) and `weekly-reader` never fired once, and `era-page-view` and
 * `scripture-lookup-view` never reached Umami at all. A doc comment did not stop
 * that; a lint rule would have.
 *
 * Scope: only `.track()` on a `*.umami` object, and only INSIDE a useEffect or
 * useLayoutEffect callback. Event handlers — a click, a submit, a scroll
 * threshold — are deliberately untouched: by the time a reader interacts, the
 * tracker has long since loaded, and those call sites are correct as written.
 * The rule is about mount timing, not about the call shape.
 */
const noMountEffectTrackSelectors = [
  {
    selector:
      ":matches(CallExpression[callee.name='useEffect'], CallExpression[callee.name='useLayoutEffect']) CallExpression[callee.property.name='track'][callee.object.property.name='umami']",
    message:
      "Umami track() fired directly from a mount effect — the tracker is deferred, so this usually runs before `window.umami` exists and the event is silently dropped. Use whenTrackerReady() from lib/analytics/track-when-ready.ts, and put any ledger write (a 'fired' flag, a session marker) INSIDE its callback so a dropped event isn't recorded as reported.",
  },
]

/**
 * The fake-small-caps rule — the third thing worth machine-checking.
 *
 * `text-transform: uppercase` plus heavy letter-spacing is what you reach for
 * when your typeface has no small caps, and it is the most recognisable tell of
 * machine-generated editorial design. A reader named it on the site in
 * September 2026 ("screams Claude/ChatGPT/Whatever") before anyone here had.
 * The body face now carries a real OpenType `smcp` table, so the imitation has
 * no remaining excuse: use the .kicker / .kicker-gold / .smallcaps classes,
 * which set the family AND `font-feature-settings: "smcp" 1` together.
 *
 * Why a rule and not a note: 29 call sites had drifted into the imitation one
 * at a time, each individually reasonable. Prose would not have held them, and
 * the failure is invisible in review — it looks like a styling choice.
 *
 * Scope & limits: like the colour rule, it targets `style` JSX attributes only.
 * It does NOT catch the Tailwind `uppercase` utility class; those were migrated
 * by hand in the same change and stay a convention. Genuine full capitals — a
 * masthead, a cover imprint — are a real typographic form and belong in the
 * allowlist below with a reason, not in a disable comment.
 */
const noFakeSmallCapsSelectors = [
  {
    selector:
      "JSXAttribute[name.name='style'] Property[key.name='textTransform'] > Literal[value='uppercase']",
    message:
      'Fake small caps: `textTransform: uppercase` in a style prop. The body face has a real smcp table — use the .kicker / .kicker-gold / .smallcaps class, which sets the family and font-feature-settings together. Setting the family alone renders ordinary lowercase and fails silently. If you genuinely want full capitals (a masthead or cover imprint), add the file to deliberateUppercase in .eslintrc.cjs with a reason.',
  },
]

// Files where full capitals are deliberate, not an imitation of small caps.
// Unlike the colour ratchet this is not expected to shrink to zero — these are
// correct as they stand — but every entry needs a stated reason.
const deliberateUppercase = [
  // Book-cover band and reading-time imprints. Letterspaced capitals are the
  // real form for an imprint stamped on a cover, and the display face
  // (IM Fell English) has no smcp table to substitute from.
  'app/components/BookCover.tsx',
  // Renders the fake version on purpose, beside the real one, as the
  // before/after in the type comparison.
  'app/design/type/page.tsx',
]

const noRawColourSelectors = [
  {
    selector:
      "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3}|rgba?\\(|hsla?\\(/]",
    message:
      'Raw colour literal in a `style` prop. Use a design token instead — var(--token) from app/globals.css (see /design for the palette). If no token fits, add one; don\'t hardcode.',
  },
  {
    selector:
      "JSXAttribute[name.name='style'] TemplateElement[value.raw=/#[0-9a-fA-F]{3}|rgba?\\(|hsla?\\(/]",
    message:
      'Raw colour literal in a `style` prop. Use a design token instead — var(--token) from app/globals.css (see /design for the palette). If no token fits, add one; don\'t hardcode.',
  },
]

// Ratchet — files that still carry pre-rule colour literals in `style`. The
// rule is OFF for these and ON everywhere else, so new and freshly-migrated
// files are protected immediately while this list only ever shrinks. To retire
// an entry: replace its `style` colour literals with var(--token) tokens (add a
// token to app/globals.css if none fits), confirm `npm run lint` is clean, then
// delete the file from this list. Never add to it — a new violation is a bug.
// NB: `[` and `]` are escaped so ESLint's glob matcher reads them as literal
// path characters (Next dynamic-route dirs) rather than character classes.
const legacyRawColour = [
  'app/about/page.tsx',
  'app/components/MarkdownEditor.tsx',
  'app/components/ReaderSettings.tsx',
  'app/components/TableOfContents.tsx',
  'app/locations/\\[country-slug\\]/page.tsx',
  'app/locations/page.tsx',
  'app/scripture/\\[ref\\]/page.tsx',
  'app/scripture/page.tsx',
  'app/search/page.tsx',
  'app/texts/\\[slug\\]/page.tsx',
  'app/themes/\\[slug\\]/page.tsx',
]

module.exports = {
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    'no-restricted-syntax': [
      'error',
      ...noRawColourSelectors,
      ...noMountEffectTrackSelectors,
      ...noFakeSmallCapsSelectors,
    ],
  },
  overrides: [
    {
      // The ratchet exempts COLOUR only. Both rules share one rule id, so
      // switching `no-restricted-syntax` off here would have quietly exempted
      // these files from the analytics rule too — and three of them
      // (AuthorsBrowser, TextsBrowser, ReaderSettings) already call
      // umami.track. Re-declare with the analytics selectors instead of
      // disabling, so the exemption stays as narrow as it reads.
      files: legacyRawColour,
      rules: {
        'no-restricted-syntax': [
          'error',
          ...noMountEffectTrackSelectors,
          ...noFakeSmallCapsSelectors,
        ],
      },
    },
    {
      // Deliberate full capitals — colour and analytics rules still apply.
      files: deliberateUppercase,
      rules: {
        'no-restricted-syntax': [
          'error',
          ...noRawColourSelectors,
          ...noMountEffectTrackSelectors,
        ],
      },
    },
  ],
}
