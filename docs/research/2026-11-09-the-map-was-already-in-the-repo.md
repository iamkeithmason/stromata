# The map was already in the repo

*The Stromata · 9 November 2026 · from the site canvas trial ([#209](https://github.com/iamkeithmason/stromata/pull/209))
and its expansion to theme, location and search pages*

## In one line

A "canvas view" of the site, prompted by a LinkedIn post about designers leaving Figma, took one
session to build. Its parts were already in the repo: the screens manifest listed the pages, and the
analytics `from` vocabulary listed the routes between them.

## Where it came from

Keith shared a post arguing that engineers want "the scope on a canvas", meaning the whole shape of
the work, zoomed out, with connections visible, which a prototype's single path hides. He asked
whether Stromata could have one. The obvious reading was a new tool: a Figma or FigJam board,
or a hand-arranged design canvas.

## What we did

1. Before choosing a tool, we asked what in the repo already held the data. Two things did.
   `scripts/screens/manifest.json` lists every key page and is rendered at both widths each release,
   so it supplied the nodes. The Umami `from` vocabulary in CLAUDE.md names the surface every
   navigational click starts on, so each value is the start of a line, and it supplied the edges.
2. We built the canvas as a generated page, not a drawn one. The `canvas` and `links` fields go on
   manifest pages, a script lays out the release-day screenshots, and each line's weight is that
   route's Umami click count.
3. We turned the prose vocabulary into code (`scripts/lib/from-surfaces.mjs`), with a test that parses
   the `from` row of CLAUDE.md and fails if the two differ. The canvas refuses a link whose value is
   not on the list, and refuses a click counted on two lines.
4. We split the code for reuse: generic graph and drawing modules, plus one small Stromata adapter for
   the palette, the Umami client and the data notes.
5. We expanded the canvas to nine pages after Keith reviewed the first six.

## What worked

- **Generated, not drawn.** The canvas rebuilds from the manifest and the analytics, so it can't drift
  from the site. Drift is how `/design` failed when its token values were typed by hand. This is the
  second time this project has hit that lesson.
- **The view audited the instrumentation.** The canvas shows how much of each event its lines account
  for, and it shows "no data" rather than a silent zero. Those two choices surfaced three facts nobody
  had asked about:
  - only 92 of 882 `text-open` events carry a `from`, because of the legacy on-load firing;
  - `search-chip` is on the homepage, not the search page;
  - the search results page sent no clicks in 90 days, against 5 searches submitted.
- **Reading the code before drawing the line.** Checking every JSX attribute for the expansion found the
  misplaced `search-chip` and the legacy `theme-click`/`source` property. Without that check, the canvas
  would have drawn wrong lines confidently.

## What didn't, and why

- **The first `from`-only model could not draw the route into theme pages.** `theme-click` records its
  surface as `source`, a documented legacy exception. A link now names the property it reads. Legacy
  values skip the vocabulary check, because they were never part of the vocabulary.
- **Small numbers.** Ninety days gives dozens of clicks per line, not hundreds, so the readings are leads
  to investigate, not findings to act on.

## The principle, stated generally

When asked for a new view of a system, first look for what the repository already holds: page lists,
event vocabularies, schemas, manifests. Generate the view from those sources so it cannot drift, and
make the view report how much of the data it covers. A generated view that shows its own coverage
doubles as an audit of the data behind it.

## Where else it fits

- Paideia: a canvas of lesson flows from its route list and event names, the same shape.
- Any project with a prose vocabulary in a CLAUDE.md or README that code depends on: put the list in
  code, with a test that parses the prose.
- Portfolio or client work: the generic modules lift out as they are; only the adapter changes.

## Rules of thumb

- Ask "what in the repo already holds this?" before "what tool should we add?"
- A diagram drawn by hand is a second copy of the truth. Generate it, or expect it to drift.
- When code depends on a vocabulary written in prose, keep a copy in code and test the two against
  each other.
- Show coverage and "no data" in any view built on analytics. A silent zero hides instrumentation bugs.
- Read the instrumentation before drawing a line from it. Attribute names lie less than surface names.
