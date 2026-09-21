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
  'app/collections/\\[slug\\]/page.tsx',
  'app/components/AuthorsBrowser.tsx',
  'app/components/DownloadLinks.tsx',
  'app/components/MarkdownEditor.tsx',
  'app/components/ReaderSettings.tsx',
  'app/components/TableOfContents.tsx',
  'app/components/TextsBrowser.tsx',
  'app/eras/\\[slug\\]/page.tsx',
  'app/locations/\\[country-slug\\]/page.tsx',
  'app/locations/page.tsx',
  'app/page.tsx',
  'app/scripture/\\[ref\\]/page.tsx',
  'app/scripture/page.tsx',
  'app/search/page.tsx',
  'app/texts/\\[slug\\]/page.tsx',
  'app/themes/\\[slug\\]/page.tsx',
]

module.exports = {
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    'no-restricted-syntax': ['error', ...noRawColourSelectors, ...noMountEffectTrackSelectors],
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
      rules: { 'no-restricted-syntax': ['error', ...noMountEffectTrackSelectors] },
    },
  ],
}
