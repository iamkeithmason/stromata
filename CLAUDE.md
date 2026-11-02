# The Stromata — Claude Code Instructions

The Stromata is a curated digital library of public-domain Christian theological texts, built with Next.js 15 App Router and Supabase. This file governs the weekly content pipeline agent.

---

## Notion access — this workspace is on the free tier

Any time you use the Notion MCP tools against this workspace (not just for the content pipeline —
this applies to the Feature Backlog, Growth Tracker, and any other Notion database too), some
query paths are plan-gated and fail with a 400 "requires a Business plan" error. **The gating is
narrower than this file claimed until 2026-09-21 — query first, don't assume.**

**Works on this plan — verified 2026-09-21 against the Content Prospect List** (291 rows), so
reach for these before falling back:

- **`notion-query-data-sources` in SQL mode against a single data source.** Full read-only SQLite:
  `SELECT`, `WHERE`, `GROUP BY … HAVING`, CTEs, `group_concat`. Use the `collection://…` URL as the
  table name. This is the cheapest way to read the list, because you project just the columns you
  need — pulling whole rows drags every prospect's long `Editorial notes` into context.
- **`notion-query-data-sources` in `rows` mode.** Faithful rich text (mentions, links, formatting
  survive, which SQL text flattens). Max 100 rows, no pagination cursor — partition with a filter
  (e.g. ranges of `userDefined:ID`) when there are more.

**Both are metered, off one shared budget — `rows` is NOT a fallback for an exhausted SQL quota.**
On a non-Business plan `notion-query-data-sources` draws on a shared workspace usage limit and
starts answering `reached the usage limit for Query Data Source`. Verified 2026-09-21: the budget
ran out three times in an afternoon, and once it does, **`rows` mode refuses with the same error as
SQL** — they are one quota, not two. (An earlier version of this section implied `rows` could be
used to keep going; it cannot.) It does replenish — roughly 45 minutes between exhaustion and the
next successful query that day — so a refusal is a wait, not a dead end.

Budget it: prefer one precise query to ten exploratory ones, project only the columns you need,
and get page ids in the same query you read fields with, so you don't pay twice for the same rows.
When the budget is gone, **`notion-search` and `notion-fetch` still work and are not metered** —
slower and page-at-a-time, but enough to finish a job you have already planned.

**View mode works and is not metered — verified 2026-10-27.** `notion-query-data-sources` with
`mode: "view"` and a `view://…` URL ran the Feature Backlog's *Agent queue, approved* view
(`view://3d2d9194-805d-8188-9ddb-000c4cbc0eba`) with its saved filter and sort, and the tool states
view mode has no plan quota. This file called it gated until that date. Prefer a saved view over SQL
whenever one already answers the question; `/next-agent-card` step 1 now does. Formula columns come
back as `formulaResult://…` references rather than values, and rows arrive whole, so keep
`page_size` small. `notion-search` + `notion-fetch` remain the right tools for *finding* a page by
keyword and for reading one page's full properties and body.

Two footguns when reading this database with SQL:

- **SQL text is lossy.** Rich-text mentions and link destinations flatten. Never conclude a
  property is corrupt from SQL output — re-read it with `rows` mode or `notion-fetch` before
  rewriting anything.
- **Titles are written two ways.** Scout-created rows are titled `Author — Work`; hand-created
  rows carry a bare work title, with the author in the `Author` property. Grouping on `Title`
  alone therefore misses cross-format duplicates — key on `Author` plus the title's post-em-dash
  remainder as well, and take the union. On 2026-09-21 the `Title`-only pass found 12 duplicate
  groups and the author-keyed pass found 3 more that it had missed.

---

## Admin UI access — you can't sign in, verify via Supabase instead

`/admin` (including `/admin/drafts`, `/admin/texts/[id]/edit`, `/admin/authors/[id]/edit`) requires
Keith's own login. Claude Code has no credentials for it and must never try to obtain or enter any —
navigating there just redirects to a sign-in page. This means **you cannot visually confirm a
pipeline import, a draft's contents, or an author-edit-form state by loading the admin UI.**

**Verify the same facts directly against the database instead:** use the Supabase MCP tools
(`list_tables`, `execute_sql`) to check that a text row exists with the right `slug`/`published`/
`genre_id`/theme associations, that an author was created as `draft: true`, etc. This is not a
fallback — for this project it's the *only* way to verify pipeline output end-to-end, so build it
into the plan from the start rather than discovering the block after already trying to preview
`/admin` in the browser.

**The Supabase MCP connector IS authorized for this project — the "requires authentication" banner
is a false alarm.** The harness prints a `supabase requires authentication` / "non-interactive,
cannot run OAuth" reminder at session start and on every MCP reconnect, but that's a *static
config check, not a live probe*: the tools (`execute_sql`, `list_tables`, …) return real data.
Don't conclude the DB is unreachable from that banner — **just make a call** (e.g.
`list_projects`) to confirm, then proceed. (`stromata` project id: `hhfjfbuiuhhdhwhfwlpv`.)

---

## Review queue — `/admin/review` (Stage 5b, phone-first)

Draft → publish in batches from a phone. Run `npm run generate:review-drafts` first (fills
`summary_draft`, any missing `note_draft`, and `collections.description_draft`; `--collection <slug>`,
`--dry-run`, `--force`; prints its token cost). Then per collection: verify provenance (nothing can be
approved until you do), approve the description, edit + Approve/Hold each card (edits autosave; the
queue reopens at the first pending card), then "Publish N approved". Every publish goes through
`lib/publishing/publish-text.ts` — the one publish path, which the admin edit form now shares; never
add a second one.

## Pipeline GUI — `/admin/pipeline` (local operator UI, for Keith not Claude)

There is a browser GUI for the whole pipeline, living inside the existing admin app at
**`/admin/pipeline`** (linked from the admin dashboard's "Pipeline" nav card). It's an
alternative to hand-editing JSON and typing `node scripts/...`, built for Keith to drive locally.
It does **not** replace the agent-judgment stages (copyright/provenance verification, theme
choices, note_draft authoring) — those still need a Claude Code run. It makes the mechanical parts
pleasant: queue management, one-click stage runs, and staged-output review.

What it exposes:

- **Prospect queue** — view/filter by status, add/edit/reject prospects via a form whose
  tradition / era / genre / source_type / theme inputs are dropdowns bound to the controlled
  vocabularies below. The queue API (`/api/admin/pipeline/queue`) re-validates against those
  vocabularies and caps themes at 6, so HARD CONSTRAINTS 4 & 5 can't be violated through the UI.
  Writes go to `prospect-queue.json` atomically (temp-file + rename).
- **The visible ladder** — the UI models the real chain: **Fetch/Extract → Review → Mark staged →
  Run import → Drafts → publish**. `fetch-texts.mjs`/`extract-docx.mjs` don't touch the queue, so
  the run route advances a prospect to `stage-2-done` itself on a clean exit; the operator then
  reviews and clicks **Mark staged** (sets `staged`) before import. The default filter is "Active"
  (hides `imported`/`rejected`). Rows detect existing output on disk (`_hasOutput`) so a prospect
  fetched in a prior session still offers Review/Stage instead of only Fetch. **Fetch is only Stage
  2 — it puts nothing on the site; import lands texts in Drafts as `published:false`.**
- **One-click runners** (`/api/admin/pipeline/run`, **dev-only — returns 403 when
  `NODE_ENV === 'production'`**): per-prospect **Fetch** (generates `scripts/ingestion/config.js`
  from the prospect, then runs `fetch-texts.mjs`) and **Extract** (`extract-docx.mjs --slug=…`,
  needs the prospect's `docx_path` field); a toolbar **Run import** runs `pipeline-import.mjs` over
  all `staged` prospects, and a toolbar **Find duplicate drafts** runs `dedup-draft-texts.mjs
  --fuzzy` (**report only — no `--write`**, so the GUI can never delete a text; removal stays a
  deliberate CLI run). `archive_ocr` prospects get no one-click button (they need manual
  landmarks) — the row shows an "OCR · manual" tag. Script stdout/stderr streams live into a log
  pane. The runner is a fixed script whitelist — the action is an enum and args come from the
  queue, never free text.
- **Staged-output review** (`/api/admin/pipeline/output`) — renders the output markdown
  (single-file or multi-chapter dir) and edits **title / genre / themes** in the frontmatter before
  import. (Those are the per-text fields `pipeline-import.mjs` reads from frontmatter; tradition/era
  are author-level and come from the prospect, so they're edited on the prospect, not here.)
- **Research from URL** (`/api/admin/pipeline/research`) — paste a source URL; the route fetches the
  page, has Claude (`claude-opus-4-7`) extract metadata and return a **SAFE/HOLD copyright verdict**,
  then pre-fills the New Prospect form for the operator to confirm. It never imports and the verdict
  is advisory — HARD CONSTRAINT 3 stays a human call. Basic SSRF guard (public http(s) only).

Constraints preserved: import still flows through `pipeline-import.mjs` unchanged (`published:
false`, never `editorial_introduction`, draft authors only). The GUI adds no write that could
publish a text or promote an author, and strips UI-only `_`-prefixed fields before writing the
queue. Publish stays manual in the text edit form (Stage 5b).

Relevant files: `app/admin/pipeline/{page.tsx,PipelineClient.tsx}`,
`app/api/admin/pipeline/{queue,run,output,research}/route.ts`, and
`lib/pipeline/{vocab,queue,runner,outputs}.ts`. `lib/pipeline/vocab.ts` mirrors the
controlled-vocabulary tables at the bottom of this file — keep the two in sync if either changes.

**Claude can't verify the rendered GUI** — same reason as the Admin UI note above: `/admin` needs
Keith's login. Verify GUI changes via `tsc --noEmit`, `next build`, middleware probes, and direct
checks against `prospect-queue.json` / Supabase; leave the visual eyeballing to Keith.

---

## Analytics — Umami event conventions and the verification rule

The site uses Umami (`cloud.umami.is`, script in `app/layout.tsx`). Most events are declarative
`data-umami-event*` attributes on links; a few are programmatic `window.umami?.track(...)`.
The canonical list lives in Notion: **The Stromata: Growth Tracker → Events Register**. Add a row
there whenever you add an event or a new property *value* — the register is the only place the
full property vocabulary is written down, and a value that isn't recorded there is effectively
undiscoverable later.

### The verification rule — this is the one that matters

**An analytics change is not done when the attribute is in the JSX. It is done when you have
observed the outgoing request carrying the expected payload.**

This is not pedantry. The seasonal panel shipped 2026-07-12 for a 4-week engagement test with the
event name present but no `from` property; nobody checked the wire, and the test produced four
weeks of unusable data. Adding an attribute and reasoning that it "should" fire is exactly the
failure mode.

**The sweep is a command now: `node scripts/verify-analytics.mjs --url=<preview>`.** (Previews are
opt-in — ask Keith before tagging a commit `[preview]`; see "Vercel usage" below.) It drives a
real browser over a real deployment, intercepts every request to Umami's collection endpoint,
records the payload and then **aborts** it — so a verification run never lands a synthetic event in
the dataset. It prints a pass/fail table and exits non-zero on any failure. `--only=a,b` narrows it;
`--prod` is required (and sufficient) to point it at production. A Vercel preview with Deployment
Protection on answers 302 to `vercel.com/sso-api` for everything, so the sweep sees a login page
rather than the site: pass `--bypass-token=<automation bypass secret>` (Vercel → Project → Settings →
Deployment Protection → Protection Bypass for Automation), or set
`VERCEL_AUTOMATION_BYPASS_SECRET`. Behind a TLS-inspecting proxy, where Chromium rejects the
re-signed certificate, `--via-node` routes each request through Playwright's Node-side stack
instead — certificates are still verified, just by Node. The assertion half lives in
`scripts/lib/wire-check.mjs` and is unit-tested, so the sweep cannot go green by looking in the
wrong place. Two things it deliberately does not do: block the tracker script (that would leave
`window.umami` undefined and every check would "pass" by firing nothing) and treat a page that
failed to *load* as a surface that is merely absent.

To verify by hand instead, intercept the beacon rather than trusting the dashboard:

```js
// paste in the browser console, then click the thing
sessionStorage.removeItem('__cap')
const rec = (u, b) => { if (!String(u).includes('umami')) return
  const p = JSON.parse(sessionStorage.getItem('__cap') || '[]'); p.push(String(b))
  sessionStorage.setItem('__cap', JSON.stringify(p)) }
const of_ = window.fetch
window.fetch = function (...a) { rec(typeof a[0] === 'string' ? a[0] : a[0]?.url || '', a[1]?.body); return of_.apply(this, a) }
const os = navigator.sendBeacon.bind(navigator)
navigator.sendBeacon = (u, d) => { rec(u, d); return os(u, d) }
// after the click (sessionStorage survives the navigation):
JSON.parse(sessionStorage.getItem('__cap')).map(b => JSON.parse(b).payload)
```

Two traps worth knowing:

- **Umami is blocked by common ad/tracking blockers** — including in Keith's own Chrome, where
  `window.umami` is `undefined` and the script request fails outright. So "no event appeared" is
  ambiguous: it may mean the code is broken *or* that the script never loaded. Always check
  `typeof window.umami` before concluding anything from an absence.
- **Synthetic key and pointer events are unreliable** in both the Browser pane and the
  claude-in-chrome extension — a dispatched `Tab` often won't move focus and `:hover` may not
  render, even though `element.matches(':hover')` returns true. `getComputedStyle` can also return
  stale values over CDP. For focus/hover states, verify by **screenshot comparison** of the same
  zoomed region, or by rewriting `:hover`/`:focus-visible` to another pseudo-class in the live
  stylesheet (preserves specificity and source order) and reading the result. Don't trust a single
  computed-style read.

### Property vocabulary

| Property | Meaning | Value form |
|---|---|---|
| `from` | the surface the click originated on | kebab-case surface name. Homepage: `seasonal-panel`, `featured-lead`, `homepage-grid`, `featured-band`, `reading-history`. Reader: `text-reader`, `text-page`, `related-figures`, `read-next`. Browse and index: `texts-index`, `authors-index`, `locations-index`, `search-results`, `search-chip`. Entity pages: `author-page`, `collection-page`, `theme-page`, `era-page`, `tradition-page`, `scripture-page`, `location-page`. **The list is the vocabulary — a new surface gets a new value here, in the Events Register, and nowhere else.** |
| `text` | which text was opened | **slug**, never the title |
| `collection` | which collection was opened | **slug** |
| `author` | which author | display name (matches `authors.name`) |
| `country` | which location | display name |
| `depth` | how many distinct texts this session has reached | integer, `1` or `2` only (`text-session-depth`) |
| `pick` | which rule chose a `read-next` pick, or the editor | `editorial` \| `author` \| `theme` \| `genre` (on `text-open` from `read-next` only) |
| `state`, `direction` | qualifiers | short enum-ish string |

Rules:

1. **`from` is mandatory on every navigational event.** Without it a click is indistinguishable
   from search and direct arrivals, which is precisely what made the panel test worthless.
2. **Identifiers are slugs, not titles.** Slugs are stable, match the URL, and join cleanly to
   Supabase; titles get edited and then silently split one series into two in Umami.
3. **One event name per user-meaningful action.** `text-open` is for texts only; collections fire
   `collection-open`. Don't overload one name across two content types — it can't be un-merged
   after the fact.
4. **Make `from` unconditional.** Attach qualifiers like `state` conditionally if you must, but
   never gate `from` behind a condition — `ReadingHistorySection` did exactly that and only
   in-progress reads were attributable.

### Threshold events — no `from`, at most once per session

`text-read` (75% scroll depth) and `text-session-depth` (1st and 2nd **distinct** text of a session)
describe where a reader got to, not where they came from, so rule 1 does not apply to them and they
carry no `from`. `text-session-depth` exists because first→second conversion has to be answerable
from **one** event with no session joins: each depth fires at most once per session, so conversion is
`count(depth=2) ÷ count(depth=1)`. It is mounted on `/texts/[slug]` only and keyed on
`sessionStorage['stromata-session-texts']`, so it counts every route onto a text page — organic
landing included — not just the ones that fire a click event. Depth 3+ is deliberately not
instrumented. The ledger is `lib/session-depth.ts`; its tests are the specification.

### The Monthly Log row — `node scripts/monthly-metrics.mjs --month 2026-09`

Prints returning readers, avg texts/session, first→second conversion, organic-search share, top
referrer and the corpus counts. Two things it does differently from the old by-hand row:

- **Avg texts/session counts `/texts/<slug>` pageviews, not `text-open` clicks.** `text-open` fires
  on clicks, so every reader arriving on a text straight from a search engine counted as zero. That
  is why the July row read 0.2; on the same corpus the pageview basis reads ~0.8.
- **It refuses to report a silent zero.** `/stats?event=<name>` would give unique visitors per
  event, but a **share token ignores the filter and answers 0** — indistinguishable from "nobody
  did that". The script probes the filter against an event known to have fired and falls back to
  the raw event count, saying in the output which basis it used.

Admin devices opt out of Umami entirely (`localStorage['umami.disabled']`, set on admin login,
cleared from the admin header), so the founder's own browsing never inflates these numbers.

### Known legacy exceptions (deliberate, for data continuity)

- `theme-click` and `ko-fi-click` use **`source`** rather than `from` for the same concept, and
  `theme-click` sends the theme's **display name** rather than its slug. Left as-is on purpose:
  renaming would fork those series mid-dataset for little analytical gain. Use `from` + slugs for
  anything new; only revisit these if you're already accepting a break on them.
- On **2026-08-06** the `text-open` property values changed from titles to slugs, and collection
  clicks moved from `text-open` to `collection-open`. Data before and after that date is not
  directly comparable for those properties — Umami stores what was sent and cannot be backfilled.
- On **2026-09-02** `text-read` (fired at read-depth by `ReadingProgressBar`) changed its `text`
  property from the title to the **slug**, aligning it with `text-open` and the slug rule. Before
  this date `text-read` values are titles and don't join to Supabase; after, they're slugs — the two
  spans aren't directly comparable. Surfaced by the `stromata-analytics` digest's Events Register
  reconciliation on its first run.

---

## Design system — tokens and the LLM-safe colour rule

The site's visual design is **token-driven**. `app/globals.css` `:root` is the single source of
truth for colour, the type scale (`--text-*`), the layout grid (`--grid-*`, `--content-*`,
`--reading-measure`, …), and motion (`--ease`, `--dur*`). Components consume these through inline
`style={{ … color: 'var(--token)' }}` — the dominant styling surface here; Tailwind is used for
**layout** (flex/grid/spacing), not for colour. There is **no `components/ui` primitives library**;
reuse happens through tokens plus the semantic `@layer components` classes (`.kicker`,
`.kicker-gold`, `.caption`, `.rule-gold`, `.rule-muted`).

### Colour token families

- **Surface / ink / rule / accent / gold / highlights** — the parchment-surface palette. Gold has
  three text-vs-rule variants: `--gold` (rules, large glyphs), `--gold-ink` (text, AA-compliant),
  `--gold-rule` (hairlines), plus `--gold-border` / `--gold-border-strong` (keylines at rest /
  hover).
- **Reversed-out** (`--on-dark`, `--on-dark-body`, `--on-dark-soft`, `--on-dark-mute`,
  `--on-dark-border`, `--on-dark-rule`, `--on-dark-gold`, `--on-dark-gold-soft`) — cream text/rules
  for content sitting **on a dark or liturgical ground** (book covers, the seasonal panel,
  dark-tone chips). The cream is `--paper`'s RGB at varying alpha.
- **`--cover-mid`** — the book-cover inner panel cream.
- **Liturgical seasons** (`--season-advent-lent`, `--season-eastertide`, `--season-trinitytide`,
  `--season-feast`) — SeasonalPanel selects one via `CURRENT_SEASON.colour`.
- **Elevation** (`--shadow-panel`, `--shadow-panel-drop`) — composite shadows as whole tokens so
  components never hand-author shadow `rgba()` inline.

**Theme note:** the reader dark theme (`[data-reader-theme="dark"]`, opt-in per reader — the only
dark mode) flips the surface/ink tokens through the cascade. The reversed-out, season, cover, and
`--hero-ground` tokens are deliberately **not** flipped there — they always sit on their own dark
ground, independent of page theme. When adding a token that sits on a dark ground, add it to `:root`
only; do **not** add it to the reader-dark override block.

### The reference page — `/design` (can't drift)

`/admin`-free internal page at **`/design`** (`noindex`). Its swatches read each token's value
**live from the computed CSS** (`app/design/LiveToken.tsx`), so the page can never disagree with
`globals.css` — add or change a token and the gallery follows. (It used to hand-type values and
drifted: `--ink-mute` showed its pre-AA value long after the token was darkened. Fixed.) To surface
a new token there, add a `<ColourSwatch token="--your-token" />` — the value renders itself.

### The rule that matters — no raw colour literals in `style`

Colours in a `style` prop **must** be a token (`var(--token)`), never a hex/`rgb(a)`/`hsl(a)`
literal. This is enforced, not just documented: **`.eslintrc.cjs`** encodes it as a
`no-restricted-syntax` rule and **`.github/workflows/ci.yml`** runs `npm run lint` (+ `tsc`) on every
PR. A documented convention is a probability an LLM follows most of the time; a lint rule in CI is a
contract — a green PR carries no new off-palette colour, with no hand-review of every colour needed.
This matters precisely because most UI here is now written with an LLM in the loop, and LLMs reach
for reasonable-but-off-palette values (a second slightly-different gold, `rgba(245,240,230,…)`,
`bg-gray-100`).

- **Scope / limits:** it targets colour literals inside `style` JSX attributes — the dominant
  surface. It does **not** catch colours in Tailwind arbitrary classes (`bg-[#…]`; use
  `[color:var(--token)]` arbitrary syntax instead) or in style objects declared as separate
  `const`s — those stay a convention. Shadows/gradients get a token too (`--shadow-*`, `--season-*`).
- **The ratchet:** `.eslintrc.cjs` carries a `legacyRawColour` list — files that still hold pre-rule
  literals, where the rule is OFF. The rule is ON everywhere else, so new and freshly-migrated files
  are protected immediately while the list only shrinks. **To retire an entry:** replace its `style`
  colour literals with tokens (add a token to `globals.css` if none fits), confirm `npm run lint` is
  clean, then delete the file from the list. **Never add to it** — a new violation is a bug, not an
  exemption.

Relevant files: `app/globals.css` (tokens), `app/design/{page.tsx,LiveToken.tsx}` (reference),
`.eslintrc.cjs` (the rule + ratchet), `.github/workflows/ci.yml` (CI gate), `lib/tradition-colors.ts`
(the separate maroon/ink book-cover ground map — its own TS source of truth).

### The design-critic loop — a repeatable taste check (after Chimala)

`scripts/design/critic-loop.mjs` screenshots a live route and has Claude judge it against a
studio-quality bar, per Anshu Chimala's "world-class designer" method (Technique 3: a fresh-context
critic scores the screenshot; you iterate). It is for *executing* a design direction well, not
choosing one. Run the app, then in a second terminal:

```
npm run design:critic -- --url=http://localhost:3000/<route> --aesthetic="<the look it's going for>"
```

It captures with Playwright (a devDependency — run `npx playwright install chromium` once), prints a
score out of 10 plus specific gaps and the single highest-impact next change; you edit and re-run.
`--screenshot=<path>` skips capture if Playwright isn't set up. **No image or video generation** —
deliberately omitted on cost grounds; the loop needs neither. The matching prose-critic loop for
`note_draft`s lives in `scripts/lib/note-prompt.mjs` (`generateNoteWithCritic`) — same idea, other
medium. Both need `ANTHROPIC_API_KEY`.

Two lessons the loop taught, worth keeping:

- **The `--aesthetic` brief is load-bearing.** The critic optimises for the string you hand it, so a
  brief describing the site's *default* look silently caps the score and drags the design back toward
  that default. Brief it for the concept you are actually building, not the house style.
- **Taste and direction stay human.** The loop sharpens craft; it cannot choose the concept. When the
  critic starts arguing the concept rather than the execution — and the score stops climbing, usually
  around 8 — that is the signal to stop and make a call, not to keep grinding.

Relevant files: `scripts/design/critic-loop.mjs`; `app/design/liturgical-wheel/page.tsx` as a worked
example (a NOINDEX exploration, not linked in nav).

---

## Screens reference — look at the site before changing it

**`docs/screens/stromata-screens.pdf`** holds the key public pages as they currently look, at phone (390px) and
desktop (1440px): home, the reader (top landing text, its end-of-text module, dark theme, a short text), the
library, authors and an author page, a collection, a theme, an era, a tradition, Scripture, search and the 404.
The cover says when it was rendered and from which code. **Any session doing UI work reads it first**, so
changes start from how the site actually looks rather than from the code alone. A copy sits in the claude.ai
project "3 - Stromata", so ordinary chats can review the interface too (the practice Paideia uses).

- **Regenerate it after each release:** `npm run screens`. The pages come from `scripts/screens/manifest.json`,
  where you can add a page or an extra shot further down one. The PDF commit is docs-only (`docs/screens/` is on
  `SITE_IRRELEVANT`), so it goes straight to `main` and deploys nothing. Then replace the copy in the claude.ai
  project.
- **From a cloud session, render the code, not the live site.** Vercel's bot checkpoint stops a cloud browser on
  thestromata.com and on previews, and that protection is not to be bypassed. Check out the code, write a
  throwaway `.env.local` with the public anon key (Supabase MCP `get_publishable_keys`) plus dummy `ADMIN_*`
  values, run `next dev`, then `npm run screens -- --url=http://localhost:3000`. Delete `.env.local` afterwards.
  From Keith's laptop, plain `npm run screens` renders production.
- **Meters:** one run is about 30 shots against the live database, a few MB of Supabase egress (and, against
  production, a little Fluid CPU). Once per release; don't re-run it for polish.
- `--png` also writes each shot to `docs/screens/png/` (gitignored); `--only=<name>` renders a subset.

---

## Mobile-first — design at 390px, then add width

Adopted by Keith on 27 Oct 2026. The site was built desktop-first and adapted for phones afterwards, and
every phone fix since has been found by accident or a one-off audit. About a third of readers are on
phones, and most arrive from search straight onto a text, so **new public UI starts at 390px** and widens
from there.

- **Write the phone layout first.** Unprefixed Tailwind classes and base CSS are the phone; `md:`/`lg:` and
  `min-width` media queries add the wider tiers. A `max-width` override to rescue a desktop layout on
  phones (as `.frontispiece` had to do in PR #167) is a sign the work started at the wrong end.
- **The checklist every public change meets at 390px:** the first screen shows what the reader came for
  (on a text, the text); tap targets are at least 44px; nothing scrolls sideways (long URLs and slugs
  wrap); furniture collapses before content does; text reads without zoom; nothing fixed covers content.
- **Look at it before calling it done.** Render the changed pages at 390px as well as 1440px, from a local
  build against the live data (`npm run screens -- --url=http://localhost:3000 --only=<page>`, see
  "Screens reference" above), and put the phone shot in the PR. A new page added to
  `scripts/screens/manifest.json` gets both widths.
- **Existing pages** are being brought up to this standard by the backlog card "Mobile-first audit: bring
  every public page up to phone-first standard". Until a page has been through it, don't assume its phone
  layout was designed; check it.

---

## Vercel usage — previews are opt-in, and batch small changes

Stromata is on Vercel's **Hobby (free) tier**, and in Sept 2026 it went over the Fluid Active CPU
allowance (see CHANGELOG 2026-09-29 and 2026-10-04). A few habits keep it under, and all apply to
every session:

**1. Previews only build when asked.** `vercel.json` → `scripts/vercel-ignore-build.sh` skips every
preview build unless the pushed head commit's message contains **`[preview]`**. Production (merges
to `main`) always builds. So by default a pushed branch gets **no preview URL** — don't tell Keith to
"check the preview" unless one was requested.

- **When a preview would genuinely help, ask Keith first — don't add `[preview]` on your own.**
  Good reasons: a visual or layout change he should eyeball, or an analytics change that the
  verification rule says must be observed on the wire (`verify-analytics.mjs` needs a deployment).
  Say why in one line and prompt him to ask for it explicitly, e.g. *"This changes the reader
  header — want a preview to check it on your phone? If so, say 'build a preview'."*
- **When he says yes,** put `[preview]` in the message of the next commit you push (a real change,
  or the commit that carries his requested tweak). Only the head commit of a push counts, so a later
  push without the tag builds nothing — tag again if he wants the preview refreshed.
- **The tag matches anywhere in the head commit's message, body included** — a commit that merely
  *mentions* it builds a preview (this happened on #136). When you are not asking for a preview, don't
  write the literal string in a commit message; say "the preview tag" instead.

**2. Group small, related changes into one PR.** Every merge to `main` is a production deploy, and
every deploy starts with an empty page cache, so crawlers re-render the site after each one — merge
frequency, not reader traffic, drove the Sept 2026 spike (17 merges in 1–19 Sep, 37 in 20–29 Sep).
If a session turns up several small related fixes, ship them together in one PR rather than one PR
each; if Keith asks for a follow-up to a PR that is still open, add it to that PR. (Unrelated
changes still get separate PRs — this is about not splitting one piece of work into many.)

**Standing rule — one release a week, through a `release` branch (agreed with Keith 2026-10-10).** Production
deploys from `main` only, and every deploy empties the page cache, so site-changing work is collected on a
long-lived **`release`** branch and shipped to `main` once a week. **Permanent** (Keith, 2026-10-26): the
weekly release stays after the Usage page's 30-day Fluid Active CPU total is back under the 4h Hobby allowance
(expected between about 28 Oct and 5 Nov). The Monday release task reports every week, even when there is
nothing to ship.

- **Site-changing PRs open with base `release`, not `main`** — `/next-agent-card` PRs included. A merge into
  `release` deploys nothing (it is a preview branch, and previews are off unless asked), so those merges are
  free and don't use the weekly slot. The test for "site-changing": **any file in the PR that is not on
  `SITE_IRRELEVANT`** (below). Not sure? Base `release`.
- **Docs-only and content-only PRs go straight to `main`** — every file on `SITE_IRRELEVANT`. The ignore step
  skips them, so they cost nothing; the Monday digest and the pipeline runs already land this way.
- **The weekly release is the one slot.** Bring `release` up to date first (a PR with base `release` and head
  `main`, because automation and docs PRs land on `main` in between), then open **one** PR with base `main` and
  head `release`, titled "Release YYYY-MM-DD", listing the PRs it carries and any Supabase migration that must
  be applied before it ships (never assume one has run). Merge it with a **merge commit**, not a squash. That
  merge is the week's single production deploy.
  **Release day is Monday morning** (Keith, 2026-10-10): a weekly routine opens the draft release PR then, only
  if `release` is ahead of `main` with site-changing commits; Keith merges it.
- **Never merge the release PR yourself** — leave it open, say what it carries, and let Keith merge it. When a
  site-changing PR is ready, merge it into `release` only if Keith has said to; otherwise leave it open and
  tell him which PRs are queued.
- **The 100-deployments-a-day cap is shared with Paideia — check the release actually built.** Vercel's
  Hobby plan allows 100 deployments per day per *account*, and Stromata and Paideia share the account. Every
  push counts, **including the ones `vercel-ignore-build.sh` cancels**: skipping a build saves build minutes,
  not cap slots. On 2 Nov 2026 the cap was spent between 09:05 and 12:36 UTC, 86 of the 100 by Paideia
  (about ten Claude branches plus `main`, the morning GitHub Actions minutes reset), and a Stromata push then
  got `Resource is limited - try again in 24 hours (api-deployments-free-per-day)`. A release merge in that
  window would not deploy. So after the release PR merges, confirm a production deployment for its merge
  commit reached `READY` (Vercel MCP `list_deployments` with `target: production`, or the dashboard). If it
  was refused, wait for the window to roll over and redeploy that commit from the Vercel dashboard rather
  than pushing again, since another push only spends another slot.
- **A broken site or a security fix is the exception:** it goes straight to `main` (tell Keith), and `main` is
  then merged into `release` so the branches don't diverge.
- Publishing texts is fine in a batch (about 4 min of CPU once per sitting; batch it, don't trickle it).

Evidence for the rule: 6–9 Oct ran at roughly 4–6 min/day (target ≤ 8) after two real deploys in six days,
against 37 merges between 20 and 29 Sep. The weekly release is a guard against sliding back, not a claim that
one more deploy would hurt today.

**A backlog card counts as `Built` once its change is on `main`** (Keith, 2026-10-10) — not when its PR merges into
`release`. A card whose PR sits in `release` waiting for the weekly release is still `Planned`. Shipping is the
release PR's merge, so the reconciliation sweep checks that the PR's merge commit is reachable from `main`.

The `/next-agent-card` command (`.claude/commands/next-agent-card.md`) on `main` still has its old wording (it opens
its PR without naming a base, and its sweep flips `Built` at PR merge) until PR #147 ships in the first release.
**Until then, follow this section over the command.**

**Docs-only and content-only production commits don't deploy.** The same script skips a *production*
build when every file in the commit is on `SITE_IRRELEVANT` at the top of `scripts/vercel-ignore-build.sh`:
`CHANGELOG.md`, `CLAUDE.md`, `scripts/analytics/reports/`, and the content pipeline's own files —
`scripts/ingestion/run-log/`, `scripts/ingestion/prospect-queue.json`, `scripts/ingestion/output/` — chiefly so
the Monday analytics-digest commit and a pipeline run stop wiping the page cache. Rules: **a path goes on that
list only if nothing the *public* site builds or serves reads it — grep `app/` and `lib/` first**
(`scripts/analytics/aggregate.mjs` is *not* listed: `lib/analytics/dashboard.ts` imports it; nor is the code
in `scripts/ingestion/*.mjs`, which an admin route imports). **The accepted exception:** the admin pipeline and
sourcer screens read the queue, staged output and run logs from the filesystem, so on production those screens
show data as of the last *real* deploy — they are local operator tools, and Keith agreed to this on 2026-10-04.
Don't add anything else the admin side reads without asking. Every doubt builds (no parent commit, empty diff,
git error, a path not listed). To force a build of a docs-only commit, put the force-deploy tag in its
message — the literal string is `[deploy]`, and like the preview tag it matches anywhere in the message, so
don't write it unless you mean it. A known blind spot: a push of several commits at once relies on Vercel
supplying `VERCEL_GIT_PREVIOUS_SHA` to catch an earlier site change behind a final skippable commit (PR
merges and the digest are single commits, so this does not arise today). Tests:
`scripts/vercel-ignore-build.test.mjs`.

**3. Public pages are cached for a week, so every save must refresh what it changed.** Since
2026-10-04 the public pages (`/texts/[slug]`, authors, collections, eras, traditions, themes,
locations, `/scripture`) use `revalidate = 604800`, and the public Supabase client's data cache
(`CACHE_SECONDS` in `lib/supabase/public.ts`) matches — **the two must move together**, because Next
refreshes a page as often as its *shortest* data-cache entry. The week is only a safety net; freshness
comes from saves calling `revalidatePath`:

- Text publish/edit → `lib/publishing/publish-text.ts`; author saves → `lib/authors/revalidate.ts`;
  era/tradition/theme/location/collection saves → `revalidateEntity` in
  `lib/publishing/revalidate-entities.ts`.
- **Any new admin route or script that changes something the public site renders must call one of
  these** (or add an entity to `entitySurfaces`, with a test). A route that doesn't looks fine for an
  hour under the old window and silently stale for a week under this one.
- **`/scripture/[ref]` is the exception: daily, on purpose** (`revalidate: 86400`, passed to the client
  too), because publishing does not fan out to its ~4,000 leaves.
- An edit made straight to the database from a CLI script calls no `revalidatePath` and so takes up to
  a week to show. If that matters, refresh the affected page by saving it once in the admin app.

---

## Supabase limits — know which meter a job reads before you run it

Added 2026-10-06 (sizes measured the same day with `pg_total_relation_size`). **Stromata shares one Supabase organisation with Paideia, on the Free plan**, so the
allowances below are shared too: a Stromata job can spend Paideia's headroom, and the reverse. In the
17 Sep–17 Oct cycle the organisation went over two quotas and was warned of restriction from 7 Oct:
Egress (5.93 / 5 GB, most of it one Stromata day, 21 Sep) and Log Query (249.7 / 100 GB, Stromata
~29.6 GB on 21 Sep, most of the rest Paideia's simulator). Background, measured split and reasoning:
Paideia's `docs/research/2026-10-06-know-the-meter-before-you-run-the-script.md`.

| Meter | Free allowance (per org, per cycle) | What spends it |
|---|---|---|
| Egress | 5 GB | every byte the API, functions or storage send out: bulk exports, wide selects, re-downloads, polling. Here, chiefly `texts.body`: ~30 MB uncompressed across 566 texts, so one full-corpus body read is ~0.6% of the cycle and ~170 of them spend all of it |
| Log Query | 100 GB scanned (enforced from 2027) | every log read: the dashboard log explorer, `query_logs`, the Management API logs endpoint. One 24-hour scan is gigabytes |
| Database size | 500 MB | rows kept. Not the pressure here: 34 MB in total, of which `texts` is 19 MB and nothing else tops 1.5 MB |

The cycle runs from the 17th to the 17th. What is spent cannot be clawed back before the reset, so the
time to think is before the run.

1. **Never read logs for routine data.** What the site and pipeline did is in tables: `texts`,
   `authors`, `collections` for corpus state, `published`/`draft` flags for pipeline output, and Umami
   (not Supabase) for reader behaviour. Use `execute_sql` on those. A log query is a last resort for a
   one-off diagnosis, over the shortest window that answers it.
2. **Before any bulk job, say which meter it draws on and roughly what one run costs**, in the
   script's header and in the PR. The jobs that matter here select `body` across the corpus:
   `build-corpus-index.mjs`, `strip-source-chrome.mjs` and `rejoin-text-paragraphs.mjs` without a
   `--slug=`, `reformat-text-body.mjs`, `backfill-scripture-refs.ts`, `dedup-draft-texts.mjs`, and the
   `generate-note-drafts`/`generate-summaries`/`repair-summaries` backfills. If you
   cannot estimate it, run it scoped (`--slug=`, `--drafts`) first and measure.
3. **Fetch once, keep locally, and select only the columns you need.** A script that re-downloads
   every body on each run multiplies its egress by its run count. `data/corpus-frequency.json` is the
   pattern: built once from the DB, gitignored, reused. A Drive batch or pipeline run should touch
   only the rows it imports and verifies, never `select('*')` across `texts`.
4. **Scheduled routines use the cheapest source**, and their stored prompt or workflow names the
   meter they touch. The analytics digest (weekly), Scout (1st and 15th) and Sourcer (monthly) read
   metadata columns, not bodies; keep them that way. A daily log scan to answer a yes/no question a
   table already holds costs gigabytes a month.
5. **When a usage warning appears, read the per-project split first** (Usage page, project selector).
   Egress and Log Query are organisation totals; on 2026-10-06 the egress overrun was one Stromata
   day, not Paideia.
6. **A build is a recurring job too, and merges set its run count.** Every production build (and any
   preview) prerenders pages that read Supabase. The 21 Sep spike was ~40 builds × ~220 MB, from
   listing pages selecting `body` before `word_count` existed (CHANGELOG 2026-10-06).
   `lib/supabase/no-body-in-listings.test.ts` now fails CI if a public page or route selects `body`
   outside the reader and the downloads. Portraits are Storage egress on every page view, so the
   upload route stores them display-sized (`scripts/lib/portrait-resize.mjs`).

---

## Keeping the record current — which change goes where

Every automated routine produces a change; each one has exactly one authoritative record,
and the record must land in the *same act* as the change wherever possible, so the two can't
drift. Don't cross-post — a text import in CHANGELOG.md is noise; a code change buried only
in a run-log is invisible.

| Change | Authoritative record | When it's written |
|---|---|---|
| **Code / product change** (a `/next-agent-card` build, a bug fix, an infra change) | `CHANGELOG.md`, newest entry on top | **Inside the same PR** — the entry is committed on the branch and merges atomically with the code. A code PR should always touch CHANGELOG.md; this is enforced by convention (the mechanic + this doc), not a CI gate. |
| **Content import** (pipeline stages, Sourcer bundles) | `scripts/ingestion/run-log/YYYY-MM-DD.md` | At the end of the run. **Not** CHANGELOG.md. |
| **Analytics digest** | Notion Growth Digest DB (+ committed report under `scripts/analytics/reports/`) | Weekly, by the digest routine/workflow. |
| **Backlog card lifecycle** | Notion Feature Backlog `Status` | `Agent-ready` → `Planned` (at PR open, by the builder) → `Built` (once the change is on `main` — after the weekly release, not at the merge into `release` — by the next `/next-agent-card` run's reconciliation sweep, step 0, or by whoever merges the release). |

**The two loop-closers that make this self-healing:**

1. **The CHANGELOG rides in the PR.** Because the entry is part of the merged diff, the log
   can never lag behind what shipped — there is no separate "remember to update the log" step
   to forget.
2. **The weekly reconciliation sweep** (`/next-agent-card` step 0) flips `Planned` → `Built`
   for any card whose PR has since reached `main`, and backfills a CHANGELOG entry if one is somehow
   missing. This closes the merge-time gap without wiring a webhook from GitHub into Notion:
   `Built` is Keith's merge made visible, reconciled on the next run, not guessed at PR time.

If you ship a code change by hand (not via a routine), you own the same two acts: a CHANGELOG
entry in the PR, and flipping the backlog card to `Built` once it is on `main`.

---

## Research bank — capturing what we learn about working with AI

**0. A write-up is owed, before the session closes,** when any of these is true: the **method** changed, not just the artefact (a new loop, a new fan-out, a new gate); a working assumption was **reversed by evidence** (a ruling didn't survive the corpus, a borrowed pattern didn't fit); something was **built that will run again** (a linter, a check, a prompt that worked); a lesson was **paid for** (rounds spent, tokens burned, a round reverted) and the bill was large enough that you'd want to avoid paying it twice; or the same lesson surfaced for the **second** time. It is *not* owed for domain lessons (how Pilgrimage's rules work, which texts are safe) or one-off fixes. The write-up lives in this project, and uses this shape so extraction is cheap: *in one line / where it came from / what we did / what worked / what didn't, and why / the principle, stated generally / where else it fits / rules of thumb* — **the last two sections are what the bank reads.** Ask Keith before writing it: *"This session looks like it owes a write-up because \<trigger\>. Write it?"* Then run steps 2a–2c on it.

**1. The bank is cross-project and lives in Notion** — [parent page](https://app.notion.com/p/3dad9194805d81018e99fcd77f78bfdd) — with two data sources: **Findings** (collection `48b7c51c-8629-4874-b7c4-69f68e14ad98`) and **Conventions** (collection `aaffb2df-3777-4240-9edd-a277922f43fc`).

**2. When a session produces a working-practice note, a write-up, or a hard-won lesson about *how to work with AI*** (not a lesson about this project's domain), do this before closing the session:
   a. Extract each lesson as one **Findings** row: title as a single sentence, Kind, Project, Date, Source URL, a one-line Note, and *Generalises* set honestly at capture time. If most of a write-up's findings are "No", they belong in this repo, not the bank.
   b. Read the existing **Conventions**. For each finding, say whether it **supports, extends, or contradicts** an existing convention. Link it as Evidence to any it supports. If it contradicts one, **do not edit the convention — flag it to Keith.**
   c. Only propose a new convention if **two or more findings from different projects** point the same way. Create it as `Status: Candidate`, *Verified against corpus* unchecked, with Evidence linked and *Operationalised in* stating "nowhere yet".

**3. At the start of substantial work**, read the **Adopted** conventions whose *Applies to* includes this project or "All projects", and treat them as standing instructions. If one is marked *Enforced as: Prose* and this session could turn it into a check, say so.

**4. Subagents do not inherit Notion MCP auth.** Bank reads and writes stay in the orchestrating thread.

The conventions themselves are deliberately not restated here — the bank is the single copy.

---

## Pipeline Purpose

**Driver 3 — content breadth.** The pipeline finds, fetches, cleans, and stages new texts from public-domain sources. It does not discover authors or handle user-facing SEO — those are separate concerns.

Stages 1–4 are automated and produce staged markdown output. **Stage 5a (import) runs automatically** via `scripts/pipeline-import.mjs`, writing texts into Supabase as `published: false` so Keith can review them in the existing admin UI at `/admin/drafts` rather than copy-pasting from local files. **Stage 5b (publish) is always manual** — Keith reviews each draft in the text edit form and publishes at his own discretion.

---

## HARD CONSTRAINTS — Never Violate

1. **Never set `published: true` programmatically.**
2. **Never write or promote `note_draft` into `editorial_introduction` programmatically.** (Note: the database column is `editorial_introduction`, not `editorial_note` — this is the field shown above the text body, populated only by Keith via the "Use this draft" button in the text edit form.)
3. **Always verify `author.death_year < 1900` before Stage 1 exit.** If `translation_copyright_clear: true` is set explicitly in the prospect, a modern translation may be usable — but still verify before proceeding. If uncertain, reject. (`pipeline-import.mjs` re-verifies this at import time as well.)
4. **All `tradition` / `era` / `genre` / `theme` values must come from the controlled vocabularies at the bottom of this file.** Do not invent values.
5. **Assign at most 6 themes per text.**
6. **Never set `authors.draft: false` programmatically.** The import script may create draft author stubs (`draft: true`) when an author isn't yet in the database, but only Keith promotes an author out of draft, from the author edit form.

---

## Prospect Queue

**Location:** `scripts/ingestion/prospect-queue.json`

This is the Content Prospect List. Each item moves through a linear status chain:

```
pending → stage-1-done → stage-2-done → stage-3-done → staged → imported → [manual publish] → rejected
```

**Before starting a run, sync new prospects from Notion** (see Pre-run section below). Then process only items with `status: "pending"`. After each stage completes, update the item's `status` (and relevant fields) and write the file back before continuing to the next stage — this makes runs resumable.

### Queue schema

```json
{
  "prospects": [
    {
      "id": "unique-kebab-id",
      "status": "pending",
      "added": "YYYY-MM-DD",
      "author": "Display name",
      "death_year": 604,
      "tradition": "imperial",
      "era": "nicene-post-nicene",
      "title": "Book of Pastoral Rule",
      "genre": "Rule",
      "source_type": "newadvent",
      "source_url": "https://www.newadvent.org/fathers/...",
      "collection_slug": "pastoral-rule-gregory",
      "translation_copyright_clear": true,
      "translator": "James Barmby",
      "translator_death_year": 1887,
      "license": null,
      "stage_1_notes": "",
      "stage_2_output": "",
      "stage_3_themes": [],
      "rejection_reason": ""
    }
  ]
}
```

**`license`** — `null` (the default; omit the field entirely for a public-domain
prospect) or a slug into `lib/licenses.ts` (currently only `"cc-by-sa-4.0"`) for a
work offered under an open license rather than being in the public domain. This is
a genuinely different case from public domain: a licensed work carries its own
display+attribution obligation the site has to meet on the reader page, not just a
copyright status to verify. `fetch-texts.mjs` writes it into frontmatter only when
`cfg.knownFields.license` is set; `pipeline-import.mjs` **refuses to import** any
staged text with a non-null `license` unless `source_attribution` and `source_url`
are both also present, since an unattributed licensed text is worse than an
unattributed public-domain one. Do not set this field to queue or import a
CC-licensed text without Keith's explicit go-ahead on that specific source — the
schema/pipeline/reader support existing is not itself authorization to use it.

**source_type options:** `newadvent` | `gutenberg` | `wikisource` | `wittenberg` | `archive_online` | `archive_ocr`

- `archive_online` — Archive.org hosted clean HTML/text (fetched directly)
- `archive_ocr` — Archive.org djvu.txt scan that needs OCR cleanup
- `wittenberg` — Project Wittenberg (projectwittenberg.org) static HTML — see the Notes on Sources entry below

---

## Pre-run — Sync from Notion

Before each pipeline run, pull new candidates from the Notion Content Prospect List so that manual JSON editing is not required.

**Notion database:** [Content Prospect List](https://app.notion.com/p/4c842767c9384c50847f55e08914eecf) (ID: `4c842767-c938-4c50-847f-55e08914eecf`)

### Steps

1. **Query for ready prospects.** SQL mode works on this plan (see the "Notion access" note at
   the top of this file — it is *not* gated, whatever an older copy of this section said). Ask for
   the ranked shortlist in one call rather than searching page-by-page:

   ```sql
   SELECT "userDefined:ID", "Title", "Author", "Era", "Tradition", "Genre",
          "Cleared edition URL", "Reference URL", "Translation notes",
          "Value", "Complexity", "Effort",
          ("Value" * 1.0) / ("Complexity" + "Effort") AS score
   FROM "collection://e3236509-a018-494c-93cf-9a035f3d10a8"
   WHERE "Status" = 'Text available'
   ORDER BY score DESC
   ```

   **Compute Score yourself — the stored formula is unreadable from SQL.** The data source lists
   `Score` under `notAvailableInQuerySql`, so selecting it returns nothing; `Value`, `Complexity`
   and `Effort` are plain numbers, and Score is defined as `Value ÷ (Complexity + Effort)`, so the
   expression above reproduces it. (`rows` mode *can* sort on the formula directly if you need the
   stored value.)

   **The `* 1.0` is load-bearing — do not drop it.** The three inputs are stored as integers, so
   `"Value" / ("Complexity" + "Effort")` is **integer division**: a 3/(1+2) row scores `1`, not
   `1.5`, every row collapses onto a handful of integers, and `ORDER BY score DESC` silently
   returns an arbitrary order that still *looks* ranked. Verified 2026-09-21 — the uncast form
   really does return `1` for `Value 3 · Complexity 1 · Effort 2`. The schema declaring these
   columns `FLOAT` does not save you.

2. **Read anything the query flattened.** The projection above is enough to choose candidates.
   Fall back to `notion-fetch` on a page ID when you need `Editorial notes` with its links and
   mentions intact, or the page body — SQL flattens rich text (see the footguns note).

3. **Skip already-handled items.** Do not add a prospect if:
   - Its `Status` in Notion is `Live`, `In progress`, or `Needs investigation`
   - An entry with the same `collection_slug` already exists in the local queue (any status)
   - A text or collection with the same slug already exists in Supabase

4. **Map fields to queue schema.** Notion fields → queue fields:

   | Notion field | Queue field | Notes |
   |---|---|---|
   | Title | `title` | Use as-is |
   | Author | `author` | Use as-is |
   | Era | `era` | Convert label to slug (see mapping below) |
   | Tradition | `tradition` | Convert name to slug (see mapping below) |
   | Genre | `genre` | Use as-is (names match) |
   | **Cleared edition URL** → else Reference URL | `source_url` | **Prefer `Cleared edition URL` whenever it is populated**, and fall back to `Reference URL` only when it is empty. See the warning below. |
   | Translation notes | `translator` / `translator_death_year` | Parse name and death year from the note |
   | Editorial notes | `notes` | Carry over as a `notes` field for Stage 1 context |

   **Era label → slug:**
   `Apostolic` → `apostolic` · `Ante-Nicene` → `ante-nicene` · `Nicene & Post-Nicene` → `nicene-post-nicene` · `Early Medieval` → `early-medieval` · `High Medieval` → `high-medieval` · `Late Medieval` → `late-medieval` · `Reformation` → `reformation` · `Post-Reformation` → `post-reformation` · `Modern` → `modern`

   **Tradition name → slug:**
   `Early Church` → `early-church` · `Patristic` → `patristic` · `Imperial` → `imperial` (the Notion option was renamed from `Byzantine` on 2026-09-21; an old row reading `Byzantine` still maps to `imperial`) · `Oriental Orthodox` → `oriental-orthodox` · `Eastern Orthodox` → `eastern-orthodox` · `Roman Catholic` → `roman-catholic` · `Anglican` → `anglican` · `Reformed` → `reformed` · `Lutheran` → `lutheran` · `Ecumenical` → `ecumenical`

   > **Why the preference, and it is not cosmetic.** `Cleared edition URL` is the
   > exact edition an editor pinned and checked; `Reference URL` is whatever
   > candidate link the row was created with, and nothing has verified it. On
   > 2026-09-21 the *All of Grace* row carried a correct `Cleared edition URL`
   > (an Archive.org scan of the right book) **and** a `Reference URL` of
   > `gutenberg.org/ebooks/27570` — which is *Buchanan's Journal of Man, July
   > 1887*. The sync took `Reference URL`, Stage 2 fetched it, and 108 KB of the
   > wrong work was imported under Spurgeon's name. A row cleared against a
   > correct edition was fetched from an uncleared, wrong one. The Sourcer
   > already gets this right — `scripts/sourcer/gate.ts` refuses a row with no
   > `Cleared edition URL` at all — so this brings the agent-driven sync into
   > line with it.
   >
   > Record which field was used in `stage_1_notes`, and **verify the URL
   > resolves to the right work before Stage 2**, whichever field it came from:
   > fetch it and check the title and author in the first few hundred bytes. A
   > queue note saying "CONFIRM at Stage 2" is not a check; that exact note was
   > on the row above and Stage 2 fetched it anyway.

   **source_type inference from the chosen source URL:**
   - `newadvent.org` → `newadvent` (the June 2026 `/fathers/` breakage was **resolved by 2026-08-29** — chapter pages serve normally again, verified via direct URL + `curl` returning no redirect)
   - `gutenberg.org` → `gutenberg`
   - `wikisource.org` → `wikisource`
   - `projectwittenberg.org` → `wittenberg`
   - `archive.org/download/...djvu.txt` → `archive_ocr`
   - `archive.org` (other) → `archive_online`
   - Other clean HTML (e.g. anglicanhistory.org, ccel.org) → `archive_online`

   **death_year:** Not stored in Notion. Leave `null` — Stage 1 will research and fill it in. If the author's era strongly implies pre-1900 (e.g. Ante-Nicene, Early Medieval) it's safe to proceed.

5. **Add to queue.** Append new prospects with `status: "pending"` and `added: "<today's date>"`. Generate `collection_slug` as `{short-title-kebab}-{author-surname-kebab}` (e.g. `small-catechism-luther`). Set `id` to the same value as `collection_slug`.

6. **Limit new additions.** Add at most 5 new prospects per run to keep each run manageable. Prefer high Score (Value × inverse of Complexity) and low Effort items first.

---

## Stage 1 — Copyright Verification & Source Check

For each `status: "pending"` prospect:

0. **Existence check:** Before doing any work, verify the text isn't already in the database. Query Supabase for any text or collection whose slug matches or starts with `collection_slug`. Also check whether output files already exist in `scripts/ingestion/output/{collection_slug}`. If already imported, set `status: "imported"` and skip all remaining stages.

1. **Copyright check:** `death_year < 1900` OR `translation_copyright_clear: true` with a translator who died before 1928. If the check fails, set `status: "rejected"` and fill `rejection_reason`.

2. **Source reachability:**
   ```bash
   curl -sI "<source_url>" | head -1
   ```
   Must return HTTP 200 (or 301/302 with a valid final destination). If unreachable, set `status: "rejected"` with reason `"source URL returned <status>"`.

3. On both checks passing: set `status: "stage-1-done"` and fill `stage_1_notes` with copyright basis (e.g. `"Death year 604; translation by Barmby (d. 1887), public domain."`).

---

## Stage 2 — Text Ingestion

### Digital sources (`newadvent` | `gutenberg` | `wikisource` | `archive_online`)

Write `scripts/ingestion/config.js` with the prospect's metadata, then run:

```bash
node scripts/ingestion/fetch-texts.mjs
```

The script fetches, cleans (HTML → Markdown), and outputs to `scripts/ingestion/output/{slug}/`. It also generates `note_draft` inline via the Claude API using the prompt in `scripts/lib/note-prompt.mjs`, and auto-suggests themes via keyword matching.

**config.js template:**

```js
export default {
  collection: {
    name: "<title>",
    slug: "<collection_slug from queue>",
    author: "<author>",
    description: "",
  },
  urls: ["<source_url>"],              // array — list multiple URLs for multi-chapter works
  source: "<source_type>",            // newadvent | archive.org | gutenberg | wikisource
  knownFields: {
    genre: "<genre from controlled vocab>",
    sourceAttribution: "<e.g. Translated by James Barmby (NPNF Series II, Vol. XII).>",
    provenanceNotes: "Text sourced from <source>. Accessed <Month YYYY>.",
    translationNotes: "<Translator name (birth–death). Translation date; copyright status.>",
    copyrightSafe: true,
  },
};
```

On success, read the output directory, note the main output file path, set `status: "stage-2-done"` and `stage_2_output` (e.g. `"scripts/ingestion/output/pastoral-rule-gregory/"`).

If the script errors (network failure, parse failure), note the error in `stage_1_notes` and leave status at `"stage-1-done"` to retry next run.

### Archive OCR sources (`archive_ocr`)

1. **Check for source file:** `scripts/ingestion/sources/{collection_slug}-raw.txt`
   If absent, download it — **use `/download/`, not `/stream/`** (see the Archive.org note under "Notes on Sources" below: `/stream/` now returns an HTML viewer page with the text buried in a `<pre>` block, `/download/` returns the file itself):
   ```bash
   curl -L "https://archive.org/download/{archive_identifier}/{archive_identifier}_djvu.txt" \
     -o "scripts/ingestion/sources/{collection_slug}-raw.txt"
   ```

2. **Add an entry** to `scripts/ingestion/archive-ocr-config.mjs` following the template at the bottom of that file. At minimum set: `sourceFile`, `startLandmark`, `endLandmark`, `slug`, `title`, `author`, `genre`, `sourceAttribution`, `provenanceNotes`, `translationNotes`, `editorialNotes`. Leave `manualCorrections: {}` and `regexCorrections: []` — these are filled later by hand.

3. **Run:**
   ```bash
   node scripts/ingestion/clean-archive-ocr.mjs <config-key>
   ```

4. Read the output. OCR sources will need more manual correction later; this is expected. Set `status: "stage-2-done"`.

---

## Stage 3 — Theme & Tag Review

Read the output markdown file from Stage 2. The frontmatter will already contain `themes` (from `suggestThemes()`) and `genre`.

1. **Themes:** Review the auto-suggested list. Adjust to 2–6 themes from THEME_CLUSTERS below. Use slugs.
2. **Genre:** Confirm it's from GENRES below. Correct if needed.
3. **Tradition:** Confirm from TRADITIONS. Correct if needed.
4. **Era:** Confirm from ERAS. Correct if needed.

Edit the output markdown file's frontmatter directly. Set `status: "stage-3-done"` and fill `stage_3_themes` in the queue with the final theme slugs.

---

## Stage 4 — Note Draft Confirmation

Check that `note_draft` is present and non-empty in the output file's frontmatter. The `fetch-texts.mjs` script generates it inline — it should already be there.

If absent or empty, generate one using `scripts/lib/note-prompt.mjs`:
- ~80–120 words
- Museum-label / reviewer's-notes tone
- Ends by orienting the reader to the reading experience
- Call the Claude API (`claude-opus-4-8` model) with the NOTE_PROMPT as system prompt, and title + author + first 3000 chars of body as the user message

Write the draft back into the frontmatter. Set `status: "staged"`.

---

## Stage 5a — Import to Supabase (Automated)

Run after Stage 4 produces staged output for the run:

```bash
node scripts/pipeline-import.mjs
```

`scripts/pipeline-import.mjs` reads every `status: "staged"` prospect, parses the frontmatter + body from its output file(s), and:
- Resolves the author by name; if not found, creates a draft author stub (`draft: true`) with whatever metadata the prospect carries (name, death_year, tradition, era). Never sets `draft: false`.
- Resolves genre and theme IDs against the controlled vocabulary tables.
- Re-verifies copyright before inserting (HARD CONSTRAINT 3).
- Inserts each text with `published: false` and `note_draft` populated. **Never writes `editorial_introduction`** — that field stays null until Keith fills it in himself.
- Rejoins mid-sentence **page-break splits** in the body before insert (only the OCR page-break artifact where a printed page ended mid-sentence; a body with none is stored unchanged). The join count is recorded in the prospect's notes. Verse and scanno checks stay flag-only.
- For multi-chapter digital sources, creates/reuses a `collections` row (also `published: false`).
- Skips any text whose slug already exists **or** whose normalised title already exists under an author whose name normalises the same — so the same work isn't re-imported under a fresh slug, even when a draft author stub would give it a different `author_id` (the normalisation is shared with `dedup-draft-texts.mjs` via `scripts/lib/dedup-match.mjs`). Idempotent, safe to re-run.
- Sets the prospect's `status` to `"imported"` (or `"rejected"` if the copyright re-check fails).

---

## Stage 5b — Human Review & Publish (Manual — Never Automate)

**The pipeline stops here.** Imported texts sit in Supabase as `published: false`, visible at `/admin/drafts`.

Keith will:
1. Open `/admin/drafts` and pick a text to review
2. Open it in the text edit form (`/admin/texts/[id]/edit`) — body, themes, and genre are already filled in from the pipeline
3. Review `note_draft` and optionally click "Use this draft" to copy it into `editorial_introduction`, then edit it in his own voice
4. If the author was created as a draft stub, review/complete the author's bio at `/admin/authors/[id]/edit` and uncheck "Draft — needs review" when ready
5. Check the `published` checkbox and save when satisfied

---

## Run Log

After each run, append a log entry to `scripts/ingestion/run-log/`:

```bash
mkdir -p scripts/ingestion/run-log
```

Filename: `scripts/ingestion/run-log/YYYY-MM-DD.md`

```markdown
# Pipeline Run — YYYY-MM-DD

## Summary
- Processed: N pending items
- Staged: N (slugs: foo, bar)
- Rejected: N (slugs: baz — reason)
- Errors: N

## Details

### foo — On the Priesthood (Chrysostom)
Stage 1: copyright clear (d. 407; Schaff translation d. 1893 public domain). Source URL 200.
Stage 2: fetched 6 chapters via New Advent, 14,200 words. Output: scripts/ingestion/output/on-the-priesthood/
Stage 3: themes adjusted — added Ministry, removed Providence (not prominent). Final: Ministry, Vocation, Preaching.
Stage 4: note_draft present from fetch script.
Stage 5a: imported 6 texts as published:false. Author already existed (not draft).
Status: imported.
```

---

## Controlled Vocabularies

### Traditions (use `slug`)
| slug | name |
|------|------|
| `early-church` | Early Church (pre-Nicene) |
| `patristic` | Patristic |
| `imperial` | Imperial |
| `oriental-orthodox` | Oriental Orthodox |
| `eastern-orthodox` | Eastern Orthodox |
| `roman-catholic` | Roman Catholic |
| `anglican` | Anglican |
| `reformed` | Reformed |
| `lutheran` | Lutheran |
| `radical-reformation` | Radical Reformation |
| `methodist` | Methodist |
| `ecumenical` | Ecumenical |

### Eras (use `slug`)
| slug | label |
|------|-------|
| `apostolic` | Apostolic (to c. 100) |
| `ante-nicene` | Ante-Nicene (c. 100–325) |
| `nicene-post-nicene` | Nicene & Post-Nicene (325–600) |
| `early-medieval` | Early Medieval (600–1000) |
| `high-medieval` | High Medieval (1000–1350) |
| `late-medieval` | Late Medieval (1350–1500) |
| `reformation` | Reformation (1500–1600) |
| `post-reformation` | Post-Reformation (1600–1800) |
| `modern` | Modern (1800–1900) |

### Genres (use `name`, not slug)
Homily · Sermon · Letter · Treatise · Essay · Meditation · Rule · Prayer · Catechesis · Commentary · Dialogue · Hymn · Poem · Confession · Hagiography · Apology · Exegesis

`Hymn` is the liturgical and the sung; `Poem` is everything else in verse (narrative, allegorical,
didactic, devotional). A text that could be either is a hymn. Added 2026-09-21 — migration
`029_poem_genre.sql`; the Notion `Genre` select needs the option added by hand in the UI, because
the API specifies select options by name only and an ALTER that rewrites the set blanks the column
on every row.

### Theme Clusters (use `slug`, max 6 per text)

**The Interior Life:** `prayer` · `repentance` · `contemplation` · `humility` · `suffering` · `spiritual-warfare` · `desire` · `rest`

**The Christian Life:** `vocation` · `community` · `hospitality` · `fasting` · `poverty` · `obedience` · `marriage` · `work`

**Doctrine:** `trinity` · `christology` · `pneumatology` · `salvation` · `eschatology` · `creation` · `scripture` · `providence`

**The Church:** `liturgy` · `sacraments` · `ministry` · `monasticism` · `preaching` · `tradition`

**Moral & Ethical:** `justice` · `virtue` · `vice` · `death` · `conscience`

---

## "Next Drive batch" — Keith's shorthand for working through the Google Drive backlog

When Keith says "next Drive batch," "keep going on Drive," or similar, it means: continue working
top-down by **Score** through the Content Prospect List items sourced from Keith's Google Drive
`_READY TO PUBLISH` archive (already fully catalogued — see the 2026-07-12 CHANGELOG entries for
how that catalogue was built). No further explanation needed; run this procedure:

1. **Pick the next ~5-8 highest-scoring `Text available` items**, skipping `Rights unclear` /
   `Needs investigation` (those need their own resolution pass first) and multi-file folder
   collections (batch those separately — more effort per item).
2. **Extract each** with `node scripts/ingestion/extract-docx.mjs <file.docx> --slug=<slug>`
   (ask Keith for the local Drive path if it's not already known). This is the committed form of
   the previously-manual `zipfile`/`xml.etree` approach: it reads `word/document.xml` with Node
   built-ins, turns Heading styles into `##`, preserves bold/italic, writes a frontmatter stub to
   `output/<slug>.md`, and — because each Word paragraph lands as one line — runs
   `normalise-markdown.mjs` over its own output as the final step, inserting paragraph blanks and
   flagging any verse. There is no separate `[HeadingN]`→`##` or "hit Enter between paragraphs"
   pass to do afterwards.
3. **Read enough of each to check translation provenance before trusting it** — this is the step
   that actually matters, not a formality:
   - Original English composition (author wrote in English) → safe, no translation-copyright risk
     regardless of how modernized the spelling looks.
   - Matches the exact NPNF/ANF citation-format fingerprint (e.g. inline `Ephesians 4:11`-style
     verse links, the register of 19th-century Christian Literature Publishing Co. translations)
     → safe, standard 19th-century public domain translation.
   - Fluent, smooth **modern** prose on a work that had to be translated (not written in English
     originally) → **hold**, don't guess. This exact pattern caught real, actively-copyrighted
     modern editions twice on 2026-07-12 (a *Luther's Works* American Edition text, and a
     Katherine Parr modernization from a specific small press) — being fast here has a real cost.
   - **Register alone is not decisive — verify with a verbatim phrase match wherever possible.**
     The 2026-07-13 resolution pass found this cuts both ways: some fluent-sounding texts turned
     out to be genuinely old public-domain translations (Steinhaeuser's 1915-16 Luther, Vedder's
     1905 Hubmaier), while some archaic-flavored ones turned out to be actively-copyrighted modern
     modernizations (William Gross's 2011 Tyndale editions at onthewing.org). Pull a distinctive
     sentence from the extracted text and web-search for it; a verbatim or near-verbatim hit
     against a named, dated edition beats a prose-register guess every time.
   - **`onthewing.org` (William Gross) is a known risk source**, not just a hypothetical one — it
     hosts a large library of individually-copyrighted "modernized" Reformation and patristic
     texts. If a prospect reads as smooth modernized-but-archaic-flavored English, check it against
     onthewing.org by name before assuming it's a safe antiquarian modernization.
   - **A held item isn't always unfixable.** Sometimes the disqualifying issue is narrow: one
     modern editorial parenthetical spliced into an otherwise-clean PD scan (*The Examination of
     William Thorpe*, 2026-07-13 — a Golden Legend/Longinus gloss mid-sentence), or a second copy
     of the same underlying work sitting under a different title elsewhere in the same Drive folder
     (*Temporal Authority* was held; *Secular Authority*, a different file for the same 1523 Luther
     treatise, turned out to be the confirmed-PD Philadelphia Edition). Check for both before
     concluding a work is unreachable.
   - When holding: set Notion `Status` to `Rights unclear`, `Complexity` to 3, and record *why*
     (which edition it's suspected to be, what would resolve the ambiguity) in Editorial notes. If
     the specific in-copyright edition is identified with confidence (a named translator, a dated
     published volume — not just "no PD source found"), say so explicitly; Keith uses this to move
     the source `.docx` into his own `Copyright?` Drive folder.
4. **Clean, tag, draft**: headings and paragraph spacing are already handled by the extractor
   (step 2) — review any **verse runs it flagged**, then pick genre + up to 6 themes from
   the controlled vocabularies below, write a note_draft per the museum-label register in
   `scripts/lib/note-prompt.mjs`.
5. **Write output + queue entry**: `scripts/ingestion/output/{slug}.md` with the standard
   frontmatter (see any 2026-07-12 output file for the exact shape), `source_type: "gdrive_docx"`,
   `status: "staged"` in `scripts/ingestion/prospect-queue.json`.
6. **Run `node scripts/pipeline-import.mjs`**, then verify with a direct Supabase query
   (`published: false`, theme count, author draft status) — don't trust the script's console
   output alone as confirmation; it's fixed to fail loudly now (see the pipeline-import.mjs bugfix
   backlog entry) but a DB check is still the actual proof.
7. **Update Notion**: `Status` → `In progress` with a one-line Editorial note on what was verified,
   for everything actually imported; `Rights unclear` with reasoning for everything held back.
8. **Log to CHANGELOG.md** — what was processed, what was held and why, any new findings.

### Running batches with parallel research agents

Confirmed working 2026-07-13. Steps 2-3 (extract + verify provenance/identify author) are
independent per item — no cross-item dependency — so they parallelize well via subagents. Steps
5-8 (write the queue entry, run the import script, update Notion, log the changelog) all touch
shared files (`prospect-queue.json`, Supabase via the import script, `CHANGELOG.md`) and must stay
serial in the main thread — concurrent writers would race and clobber each other.

**Pattern:** spawn one subagent per candidate (`Agent` tool, `general-purpose`, run in parallel in
a single message) with the Drive file path and full context (the provenance-verification rules
above, the controlled vocabularies, the exact structured report format to return — title, author,
death year, tradition/era, translator + edition, source attribution string, SAFE/HOLD verdict with
reasoning, suggested genre/themes, and a note_draft if SAFE). Each agent extracts its own file,
does its own research, and returns a structured report — it does not touch the queue file, Notion,
Supabase, or git. Once all reports are back, do steps 5-8 yourself, serially, exactly as in a
normal batch.

This is also the natural way to run the deferred **"Needs investigation" batch** (prospects where
the filename alone doesn't give a confirmed author) — each item's identification-from-content is
exactly the same kind of independent per-item lookup, and it caught two wrong author guesses on
first use (a "Jerome (unconfirmed)" letter that was actually Gregory the Great; a
"Cyprian (unconfirmed)" letter that was actually Augustine).

**Generalizes beyond Drive batches — reach for this by default, not only when asked.** Adopted as a
standing convention 5 Sep 2026: any task here that decomposes into N independent items with one
shared write at the end fits this shape. Concretely: a Sourcer prospect batch's per-item
copyright/provenance research, a wire-verification pass across several analytics events and pages
(each event↔page pair is independent), or a backlog↔changelog reconciliation pass once the ranked
list is large enough that checking tickets one at a time is the bottleneck. The boundary stays the
same as above — don't force this onto sequential or judgment-chained work (a copyright verdict that
depends on a prior one, a design decision, anything needing Keith's own call).

### Multi-file collections

The single-file root of `_READY TO PUBLISH` is a finite, now-exhausted category (confirmed
2026-07-13 — every root-level `.docx` has been imported, held, or identified as a pre-existing
duplicate). What's left are ~18 subfolders, each a multi-chapter work. These need a different
mechanical shape, not a different research process — steps 2-3 above (extract + verify provenance)
still apply per-file, still parallelize the same way. What changes is Stage 2/5a:

1. **Output goes in a directory, not a flat file**: `scripts/ingestion/output/{collection_slug}/`,
   one `.md` file per chapter, each with its own unique `slug` and a `collection_order` integer in
   its frontmatter. `pipeline-import.mjs`'s `findOutputFiles()` checks for this directory *before*
   falling back to a flat `{collection_slug}.md` — the directory takes priority automatically.
2. **One queue entry per collection**, not per chapter — `collection_slug` on that single entry is
   what ties everything together; the import script creates the `collections` row (using that
   entry's `title`) the first time it sees more than one output file for that slug, and links
   every chapter's `texts` row to it via `collection_id` + `collection_order`. It deliberately
   leaves `collections.author_id` null — **a collection's byline is derived from its texts**
   (`lib/collections/author.ts`), so there is no second copy of the author to keep in step. The
   column is a manual override for the rare case where the collection's own attribution differs
   from its texts' (a compiler, an editor); null means "inherit". Derivation spans *all* texts,
   published or not, and a multi-author collection names everyone. Verify with a query joining
   `collections` → `texts`, not just a `texts` check — and don't read a null `author_id` as a
   missing author.
3. **Work smallest-to-largest.** Sort subfolders by file count first — a 2-file collection is a
   good way to validate the pattern before tackling a 30+ file one. First run (2026-07-13) did
   *The Consolation of Philosophy* (Alfred's Old English Boethius, 2 chapters: prose + verse) and
   *Canons of Ælfric* (2 chapters), both cleanly.
4. **A folder name can be wrong** — treat it as a claim to verify, not a given. The *Canons of
   Ælfric* folder was labeled "(Puttoc)," which turned out to name the *wrong* Archbishop of York
   (Wulfstan II, "Puttoc," became archbishop only after Ælfric's death; the real correspondent was
   Wulfstan I). Caught by simply reading the letter's content against known history — worth doing
   for any folder/file name that makes a specific factual claim.
5. **The publication-date-vs-translator-death-year distinction gets more important here.** Older
   Anglo-Saxon/medieval works are often only available in English via a small number of named,
   dated 19th/early-20th-century scholarly editions (Sedgefield 1900, Thorpe 1840, Sweet 1871,
   etc.) whose translators sometimes died well after 1928 (Sedgefield died 1945). CLAUDE.md's
   "translator died before 1928" is a simplified proxy for the real rule — under actual US
   copyright law, a translation *published* before 1929 is unconditionally public domain
   regardless of when the translator later died. When a named, dated pre-1929 edition is
   confirmed via verbatim phrase match, publication date wins over the simplified heuristic — note
   this explicitly in `translation_notes` and `stage_1_notes` when it applies, since it's a
   deliberate deviation from the shorthand rule, not an error.

---

## Existing Scripts — Do Not Duplicate Logic

| Script | Purpose | When to call |
|--------|---------|--------------|
| `scripts/ingestion/fetch-texts.mjs` | Fetch & clean digital sources; generate note_draft inline | Stage 2, digital |
| `scripts/ingestion/extract-docx.mjs` | Extract a Google Drive `.docx` → staged markdown; normalises paragraphs & flags verse | Stage 2, `gdrive_docx` |
| `scripts/normalise-markdown.mjs` | Insert paragraph block boundaries / flag verse / **rejoin mid-sentence page-break splits** (dry-run default, `--write` to apply) | Auto via extract-docx; manual cleanup; rejoin applied to the body in Stage 5a |
| `scripts/ingestion/clean-archive-ocr.mjs` | Clean Archive.org djvu.txt OCR | Stage 2, archive_ocr, PROSE |
| `scripts/ingestion/extract-djvu-xml.mjs` | Stage an Archive.org scan from its **`_djvu.xml`** instead of its `_djvu.txt`, so the page layout survives: one line per printed line, in reading order, with page numbers/catchwords/signature marks told from text by **where they sit on the page** rather than by what they look like. Writes a second `{slug}-review.md` listing every dropped line, every place the line pitch says the scan LOST a line, and every line the OCR itself was unsure of. Config lives in `archive-ocr-config.mjs` (`xmlFile`, `pages`, `headings`, `wordFixes`) | Stage 2, archive_ocr, **VERSE** or any layout-bearing scan |
| `scripts/ingestion/ocr-pages-vision.mjs` | Re-read a scan from its **page images** rather than anyone's OCR text. `prepare` crops every leaf via IIIF (geometry from the XML's own body block) and writes a manifest; `assemble` reads the transcripts back, **stops on any leaf whose line count disagrees with the XML's pitch prediction**, and writes the staged markdown plus a review file; **`push` sends that staged body to an already-imported draft** (refuses a published row; needs `.env.local`, so it runs locally). The transcription itself is deliberately not wired in — fill it with subagents (subscription tokens) or a scripted API pass; same crops, same verification either way. `push` reads only the committed `output/<slug>.md`, never the gitignored crops, so the machine with the DB credentials can always run it | Stage 2, `archive_ocr`, wherever the OCR is poor — **try this before `wordFixes`** |
| `scripts/lib/couplet-check.mjs` | The verse form as a checksum: pairs lines of a couplet poem and reports `garbled` (a numeral in the line, or an ending that is not a word — near enough always a fault) and `noRhyme` (deliberately noisy; this text rhymes seat/State). `rhymeRate` is the before/after number — 30.5% for the djvu OCR of the Psychomachia. Pure, unit-tested against real couplets from the 1743 | Auto via ocr-pages-vision; any verse text |
| `scripts/lib/djvu-layout.mjs` | The judgement half of the above — parse/classify/assemble/`stripStrayMarks`/`applyWordFixes`/`markVerseBreaks`, pure and unit-tested against real lines from the 1743 Psychomachia | Auto via extract-djvu-xml |
| `scripts/ingestion/split-into-chapters.mjs` | Split one long text (OCR/markdown) into a per-chapter collection: detects `CHAPTER N`/`BOOK N`/etc. boundaries, extracts titles from the body, de-interleaves footnotes, reflows each chapter, writes the `output/{slug}/` multi-file layout. **Footnotes are dropped by default** (reading editions; apparatus is regenerable from the raw OCR) — pass `--footnotes=endnotes` (GUI: "Keep footnotes as endnotes") to retain them. `--dry` previews boundaries; exports `detectChapters()` for a GUI preview. | Long multi-chapter works |
| `scripts/ingestion/footnote-deinterleave.mjs` | Pull page-bottom footnotes out of OCR prose (djvu.txt interleaves them at page breaks), rejoin words split across the break, drop inline markers. Returns clean prose + the notes (appended as per-chapter endnotes by the splitter). | Auto via split-into-chapters |
| `scripts/ingestion/config.js` | Config for fetch-texts.mjs — overwrite per prospect | Stage 2, digital |
| `scripts/ingestion/archive-ocr-config.mjs` | Config for clean-archive-ocr.mjs — append per prospect | Stage 2, archive_ocr |
| `scripts/lib/note-prompt.mjs` | Shared NOTE_PROMPT constant | Stage 4 fallback |
| `scripts/lib/source-chrome.mjs` | Rules + `stripChrome`/`detectChrome`/`assertNoChrome` for source-site furniture (New Advent nav/logo/breadcrumb/footer/citation, Gutenberg boilerplate). `dropLeadingHeading` takes the **title** — passing `true` would delete a real first chapter heading | Auto via fetch-texts and pipeline-import |
| `scripts/ingestion/fetch-gutenberg-plates.mjs` | Pull an illustrated Gutenberg edition's plates into `public/plates/<slug>/` and repoint the markdown; normalises the triplicated caption (dry-run default, `--write`, `--db`) | Stage 2, illustrated `gutenberg` |
| `scripts/lib/leading-h1.mjs` | Decides whether a body's opening `# H1` duplicates the title or is content: keep-list → structural veto → name test → reviewed drop-list. The judgement half; `source-chrome.mjs` stays mechanical | Auto via strip-source-chrome |
| `scripts/strip-source-chrome.mjs` | Heal source-site chrome in already-imported Supabase texts (dry-run default, `--write`; `--slug=`/`--id=`/`--drafts` to scope, `--drop-leading-h1` for a duplicated title heading, **`--files` to apply the same verdict to the staged output markdown so the two stores cannot drift**) | Maintenance only |
| `scripts/pipeline-import.mjs` | Import staged output into Supabase as `published: false` | Stage 5a |
| `scripts/rejoin-text-paragraphs.mjs` | Heal mid-sentence page-break splits in already-imported Supabase texts (dry-run default, `--write` to apply; `--slug=`/`--id=` to scope) | Maintenance only |
| `scripts/dedup-draft-texts.mjs` | Find draft texts that duplicate a published text (matches on title + author *name*, so it catches the draft-author-stub case) and optionally delete the redundant draft (dry-run default, `--write` deletes HIGH-confidence body matches, `--force` includes lower-confidence, `--slug=` to scope, `--fuzzy` lists near-title matches). Never touches published rows, authors, or collections. | Maintenance only |
| `scripts/check-prospect-urls.mjs` | Fetch every `Cleared edition URL` / `Additional edition URLs` / `Reference URL` in the Notion prospect list and report the ones that no longer answer. Read-only, and uses the **REST API with `NOTION_TOKEN`**, so it does not spend the MCP query budget. Distinguishes **dead (404/410) from blocked (403, e.g. sacred-texts behind Cloudflare)** — only dead exits non-zero, because failing on a 403 every run is how a check stops being read. **Reachability only: a 200 does not mean the URL holds the right work** — the read-the-title check before Stage 2 still stands. `--cleared-only`, `--status=`, `--json`, `--fail-on=any`. Assertion half in `scripts/lib/url-check.mjs`, unit-tested | Maintenance; before a sync |
| `scripts/shrink-author-portraits.mjs` | Replace oversized author portraits in the `authors` bucket with display-sized copies (`scripts/lib/portrait-resize.mjs`, the same rule the admin upload route applies), repointing `authors.image_url` and keeping the originals. Dry-run default reads sizes from the bucket listing and costs no egress; `--write`, `--slug=`, `--min-kb=` | Maintenance only |
| `scripts/generate-note-drafts.mjs` | Backfill note_draft in Supabase for existing texts | Maintenance only |
| `scripts/generate-summaries.mjs` | Backfill summaries in Supabase | Maintenance only |
| `scripts/repair-summaries.mjs` | Repair truncated summaries | Maintenance only |

---

## Notes on Sources

- **New Advent** (`newadvent`): static HTML — fetch-texts.mjs handles it directly. **Its site furniture is stripped twice, on purpose.** The cheerio selectors in `SOURCE_SELECTORS.newadvent` are the primary pass (they remove the masthead, A–Z bar, breadcrumb and `.pub` citation by container); `scripts/lib/source-chrome.mjs` is a second pass over the resulting *markdown*, and `assertNoChrome` aborts the page rather than writing it if a known tell survives. The second pass exists because a selector fails **silently**: when New Advent renamed nothing at all but the selectors simply hadn't been written yet, fourteen bodies went into Supabase carrying `A B C … Z`, `![New Advent](../images/logo.gif)`, a `Home > Fathers of the Church >` breadcrumb and `CONTACT US | ADVERTISE WITH NEW ADVENT` — and the import script imported them without a murmur. If you add or change a selector, add the matching markdown rule too; if you see a new tell, the rule goes in `source-chrome.mjs` (with a test), never as a one-off `.replace()` in the fetcher. Many works span multiple chapter pages; list all URLs in the `urls` array. **The June-2026 `/fathers/` breakage is RESOLVED as of 2026-08-29** — chapter pages (e.g. `/fathers/33041.htm`) serve their text normally again; verified via direct URL and `curl -sIL … | grep -i location` returning no redirect. (History: from ~June 2026 the `/fathers/` URLs silently redirected to the homepage regardless of fetch method — verified 2026-07-12 — and the workaround was the Archive.org OCR scan of the same volume; that workaround is no longer needed while the pages work, but re-check with a `curl` no-redirect probe before a run, since this has flipped before.) New Advent's per-work index page (e.g. `/fathers/3304.htm`) links the individual Book pages; for the Sourcer, pin the Book pages via the multi-part `Additional edition URLs` field.
- **CCEL** (`ccel`): the reading pages render dynamically (a plain HTTP fetch of the `.html` gets the SPA shell), **but CCEL also exposes a plain-text Unicode export that IS directly fetchable**: `https://ccel.org/ccel/{letter}/{author}/{work}/cache/{work}.txt` (`{letter}` = the author's first character; e.g. Anselm's Basic Works: `https://ccel.org/ccel/a/anselm/basic_works/cache/basic_works.txt`). One file holds the whole work, no OCR, no browser needed. `ccel.org` is on the Sourcer allowlist, and the fetch tool derives the cache `.txt` from **either** the natural reading URL `/ccel/{author}/{work}/{work}` (no letter — e.g. `ccel.org/ccel/anselm/basic_works/basic_works`, `ccel.org/ccel/benedict/rule/rule`) **or** the storage form `/ccel/{letter}/{author}/{work}/…`, so you can pin whichever CCEL URL you have to hand. (Older fallbacks, no longer preferred: the Archive.org djvu.txt scan of the NPNF volumes `archive_ocr`, or browser-based extraction `ccel_browser` from the reading URL `ccel.org/ccel/{author}/{work}/{work}.i_1.html`, confirmed 2026-07-12 with Traherne's *Centuries of Meditations*.)
- **Project Gutenberg** (`gutenberg`): plain text — fetch-texts.mjs handles it. Use the plain text URL (not HTML).
- **Wikisource** (`wikisource`): mediawiki HTML — fetch-texts.mjs handles it. Use the `/wiki/` URL.
- **Project Wittenberg** (`wittenberg`, added 2026-09-21): static HTML at `projectwittenberg.org`, unchanged since ~2013 (stable `last-modified`, HTTP/2 200) — home to Luther and other Lutheran writers, e.g. the Small Catechism (`.../luther/little.book/web/book-1.html` … `book-6.html` + `book-appx.html`, one queue entry via the multi-URL `urls` array) and the 95 Theses (`.../luther/web/ninetyfive.html`). The site has no semantic containers at all (no `<nav>`/`<header>`/`<article>`), so `SOURCE_SELECTORS.wittenberg` matches chrome by text content the same way New Advent's ad paragraphs are matched, and `source-chrome.mjs` carries the matching markdown-level backstop. One tell — the "**Published in:**" edition-citation label — genuinely cannot be isolated at the DOM level: the source nests it as an unclosed `<p>` inside an unclosed `<p>`, so cheerio's `.text()` merges the label into the citation that follows before any selector can separate them; `wittenberg-published-in-label` in `source-chrome.mjs` is the *primary* defence for that one case, not the backstop, and is deliberately unconditional for that reason. **Copyright signal here is unusually strong**: translator pages carry an explicit dedication ("this text was translated … for Project Wittenberg by \<name\>, and is in the public domain") rather than relying on the death-year proxy — record that dedication text verbatim in `stage_1_notes` when it applies. The site also links index pages for other Lutheran figures beyond Luther (Andreae, Baier, Bente, Chemnitz, Gerhardt, Melanchthon, Walther, Wyneken) at `wittenberg-<name>.html` off the home page — a source of real breadth for the `lutheran` tradition, not just the catechism/theses.
- **`thesmallcatechism.org`** (ELCE's contemporary Small Catechism translation) — **blocked, not a working source.** The mechanics are the easy part and are already solved: it's WordPress, and its REST API (`GET /wp-json/wp/v2/pages/<id>`) returns `content.rendered` as near-chrome-free article HTML, cleaner than any source above. What's blocking it is the license: **CC BY-SA 4.0**, not public domain — Stromata's schema and reader page have no field or UI for the attribution and share-alike obligations that license carries, and there's an open question whether a Claude-written `note_draft` derived from this text counts as a derivative needing its own CC notice. See the full writeup in the queue entry `small-catechism-elce-cc`'s `notes` field (added 2026-09-21) before touching this — do **not** add a `wordpress_rest` (or any) `SOURCE_SELECTORS` entry for it until that entry's open questions are resolved.
- **Archive.org** (`archive_online`): Use djvu.txt URL for OCR works; use direct HTML URLs for clean digitised editions. **Use the `/download/` path, not `/stream/`, for djvu.txt** — confirmed 2026-09-14: `archive.org/stream/{id}/{id}_djvu.txt` now returns a full HTML viewer page with the OCR text embedded in a single `<pre>...</pre>` block (breaks the plain-text assumption `clean-archive-ocr.mjs`/`archive-ocr-config.mjs` are built on, and would need an HTML-unwrap-plus-entity-decode step to use). `archive.org/download/{id}/{id}_djvu.txt` (a 302 redirect to the item's own `ia*.us.archive.org` file server, so keep `curl -L`) returns `Content-Type: text/plain` directly — same content, no wrapper. Verified against three different identifiers the same session. If `/download/` for some reason 404s while `/stream/`'s HTML viewer still loads, the identifier is fine and only the download route is having trouble — re-check rather than falling back to unwrapping `/stream/`'s HTML.

- **Archive.org `_djvu.xml` — reach for this before `_djvu.txt` whenever layout carries meaning.** The
  two hold the **same OCR**; the XML additionally keeps a `<LINE>` per printed line, a bounding box
  per word, and a per-word confidence, and the `.txt` throws all three away. That loss is not
  cosmetic. Staging the 1743 *Psychomachia* from the `.txt` gave couplets merged two to a line,
  run-overs orphaned as junk, page numbers spliced into the middle of verse, several pages in the
  **wrong order**, and no way to tell a catchword from a short line of poetry — and every one of
  those was recoverable from the XML with no hand-written rules about brackets or digits. Fetch it
  the same way as the text (`/download/`, not `/stream/`):
  `curl -L "https://archive.org/download/{id}/{id}_djvu.xml" -o scripts/ingestion/sources/{slug}-raw.xml`,
  then run `extract-djvu-xml.mjs`. Use the `.txt` for a wall of prose; treat it as misleading for
  verse, drama, columns, or anything with catchwords or marginalia.
- **Two traps when correcting an 18th-century scan, both learned the expensive way on the
  Psychomachia.** First, **the long s is misread two different ways** — sometimes as `ſ` (easy, one
  global rule) and sometimes as `f` (`Cafe`, `fubdue`, `whofe`), which no global rule can touch.
  Second, and this is the trap: **you cannot decide the `f` cases from the text itself.** Asking
  which `f`-words have an `s`-form attested elsewhere in the same text proposes `for`→`sor`,
  `fight`→`sight`, `fame`→`same` and `before`→`besore`, because the scan *also* misreads `s` as
  `f`, so both spellings of everything are attested. The heuristic looks principled and is
  confidently wrong. Name each correction individually in `wordFixes` (case-preserving — 18th-century
  printing capitalises nouns, and a `gi` regex silently flattens that), and only where the `f`-form
  is not English at all and the sense of the line confirms the `s`-form.

- **Before you enter that trap, ask whether you need to at all — the page IMAGES are right
  there.** The two traps above are real, and the whole `wordFixes` apparatus they call for is
  what you owe the text *if you are stuck with somebody else's OCR*. You usually are not.
  Archive.org serves every leaf through IIIF at full scan resolution, croppable and scalable in
  the URL:
  `https://iiif.archive.org/iiif/{identifier}%24{leaf}/{x},{y},{w},{h}/{width},/0/default.jpg`
  — and the `_djvu.xml` page dimensions are in the *same pixel space*, so the XML's own body-block
  coordinates can drive the crop. A model that can see the page handles the long s in both its
  disguises, the ligatures, and the italic, with no rules written at all. On the 1743 Psychomachia
  the difference was not marginal: the djvu OCR had dropped 72 lines outright (5.5% of the poem,
  leaving no mark in the text), and scored 30.5% on the couplet-rhyme check against ~100% for the
  same pages read from the images. **Reach for `ocr-pages-vision.mjs` before `wordFixes` on any
  pre-1800 scan.** Keep `wordFixes` for the residue.

- **The structure/letters split, and why both halves are needed.** `extract-djvu-xml.mjs` recovers
  the *arrangement* (which lines, in what order, where the scan lost some); the page images
  recover the *letters*. Run them together: the XML's line-pitch analysis predicts how many lines
  each leaf holds, and a transcription that disagrees is stopped for a human. That guard catches
  the one failure mode a vision pass has and OCR does not — **a faint line comes back plausible,
  metrical, and wrong**, which no reader can spot afterwards. Two cautions, both learned on the
  first run: never tell the transcriber the predicted count (it becomes a target to pad toward,
  and the check stops being independent), and never treat the prediction as truth — on leaf 26 the
  pitch test nailed three separate gaps at 4, 2 and 1 lines and *still* over-counted the page by
  two, reading a wide space between couplets as dropped type. A mismatch is a queue; adjudicate it
  against the scan and record the finding in `visionLineCountAccepted` with its reason.

For multi-volume NPNF works on Archive.org, the djvu.txt identifier pattern is typically:
`https://archive.org/download/{identifier}/{identifier}_djvu.txt`
