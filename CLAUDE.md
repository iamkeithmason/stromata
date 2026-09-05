# The Stromata — Claude Code Instructions

The Stromata is a curated digital library of public-domain Christian theological texts, built with Next.js 15 App Router and Supabase. This file governs the weekly content pipeline agent.

---

## Notion access — this workspace is on the free tier

Any time you use the Notion MCP tools against this workspace (not just for the content pipeline —
this applies to the Feature Backlog, Growth Tracker, and any other Notion database too), the
following tools are **plan-gated and will fail with a 400 "requires a Business plan" error**:

- `notion-query-database-view` (view mode)
- `notion-query-data-sources` in SQL mode against a single data source

**Use instead:** `notion-search` (optionally scoped with `data_source_url` to search within one
database) to find candidate pages, then `notion-fetch` each result by ID to read its full
properties and content. This is slower and returns page-level results rather than a queryable
table, but it's the only reliable path on this workspace's plan. Don't spend time retrying the
gated tools with different parameters — they fail on plan, not on query shape.

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

---

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
  all `staged` prospects. `archive_ocr` prospects get no one-click button (they need manual
  landmarks) — the row shows an "OCR · manual" tag. Script stdout/stderr streams live into a log
  pane. The runner is a fixed 3-script whitelist — the action is an enum and args come from the
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

To verify, intercept the beacon rather than trusting the dashboard:

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
| `from` | the surface the click originated on | kebab-case surface name (`seasonal-panel`, `featured-lead`, `homepage-grid`, `author-page`, `reading-history`, `search-chip`, `featured-band`, `locations-index`, `text-reader`, `location-page`) |
| `text` | which text was opened | **slug**, never the title |
| `collection` | which collection was opened | **slug** |
| `author` | which author | display name (matches `authors.name`) |
| `country` | which location | display name |
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
      "stage_1_notes": "",
      "stage_2_output": "",
      "stage_3_themes": [],
      "rejection_reason": ""
    }
  ]
}
```

**source_type options:** `newadvent` | `gutenberg` | `wikisource` | `archive_online` | `archive_ocr`

- `archive_online` — Archive.org hosted clean HTML/text (fetched directly)
- `archive_ocr` — Archive.org djvu.txt scan that needs OCR cleanup

---

## Pre-run — Sync from Notion

Before each pipeline run, pull new candidates from the Notion Content Prospect List so that manual JSON editing is not required.

**Notion database:** [Content Prospect List](https://app.notion.com/p/4c842767c9384c50847f55e08914eecf) (ID: `4c842767-c938-4c50-847f-55e08914eecf`)

### Steps

1. **Search for ready prospects.** Use the Notion MCP `search` tool to find pages in the Content Prospect List with `Status = "Text available"`, sorted by Score descending, then `fetch` each result page to read its properties (see "Notion access" note at the top of this file — the query/view tools are plan-gated on this workspace).

   Useful search queries to try in sequence:
   - `"Text available" site:notion.so stromata content`
   - Fetch the database page directly and follow linked prospect pages

2. **Fetch each candidate.** For each result, call `notion-fetch` with the page ID to read its full properties: Title, Author, Era, Tradition, Genre, Reference URL, Translation notes, Status, Score, Complexity, Effort.

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
   | Reference URL | `source_url` | Use as the starting source URL |
   | Translation notes | `translator` / `translator_death_year` | Parse name and death year from the note |
   | Editorial notes | `notes` | Carry over as a `notes` field for Stage 1 context |

   **Era label → slug:**
   `Apostolic` → `apostolic` · `Ante-Nicene` → `ante-nicene` · `Nicene & Post-Nicene` → `nicene-post-nicene` · `Early Medieval` → `early-medieval` · `High Medieval` → `high-medieval` · `Late Medieval` → `late-medieval` · `Reformation` → `reformation` · `Post-Reformation` → `post-reformation` · `Modern` → `modern`

   **Tradition name → slug:**
   `Early Church` → `early-church` · `Patristic` → `patristic` · `Byzantine` → `imperial` · `Oriental Orthodox` → `oriental-orthodox` · `Eastern Orthodox` → `eastern-orthodox` · `Roman Catholic` → `roman-catholic` · `Anglican` → `anglican` · `Reformed` → `reformed` · `Lutheran` → `lutheran` · `Ecumenical` → `ecumenical`

   **source_type inference from Reference URL:**
   - `newadvent.org` → `newadvent` (the June 2026 `/fathers/` breakage was **resolved by 2026-08-29** — chapter pages serve normally again, verified via direct URL + `curl` returning no redirect)
   - `gutenberg.org` → `gutenberg`
   - `wikisource.org` → `wikisource`
   - `archive.org/stream/...djvu.txt` → `archive_ocr`
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
   If absent, download it:
   ```bash
   curl -L "https://archive.org/stream/{archive_identifier}/{archive_identifier}_djvu.txt" \
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
- Skips any text whose slug already exists (idempotent, safe to re-run).
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
Homily · Sermon · Letter · Treatise · Essay · Meditation · Rule · Prayer · Catechesis · Commentary · Dialogue · Hymn · Confession · Hagiography · Apology · Exegesis

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
   entry's `title` and resolved `author_id`) the first time it sees more than one output file for
   that slug, and links every chapter's `texts` row to it via `collection_id` +
   `collection_order`. Verify with a query joining `collections` → `texts`, not just a `texts`
   check.
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
| `scripts/ingestion/clean-archive-ocr.mjs` | Clean Archive.org djvu.txt OCR | Stage 2, archive_ocr |
| `scripts/ingestion/split-into-chapters.mjs` | Split one long text (OCR/markdown) into a per-chapter collection: detects `CHAPTER N`/`BOOK N`/etc. boundaries, extracts titles from the body, de-interleaves footnotes, reflows each chapter, writes the `output/{slug}/` multi-file layout. **Footnotes are dropped by default** (reading editions; apparatus is regenerable from the raw OCR) — pass `--footnotes=endnotes` (GUI: "Keep footnotes as endnotes") to retain them. `--dry` previews boundaries; exports `detectChapters()` for a GUI preview. | Long multi-chapter works |
| `scripts/ingestion/footnote-deinterleave.mjs` | Pull page-bottom footnotes out of OCR prose (djvu.txt interleaves them at page breaks), rejoin words split across the break, drop inline markers. Returns clean prose + the notes (appended as per-chapter endnotes by the splitter). | Auto via split-into-chapters |
| `scripts/ingestion/config.js` | Config for fetch-texts.mjs — overwrite per prospect | Stage 2, digital |
| `scripts/ingestion/archive-ocr-config.mjs` | Config for clean-archive-ocr.mjs — append per prospect | Stage 2, archive_ocr |
| `scripts/lib/note-prompt.mjs` | Shared NOTE_PROMPT constant | Stage 4 fallback |
| `scripts/pipeline-import.mjs` | Import staged output into Supabase as `published: false` | Stage 5a |
| `scripts/rejoin-text-paragraphs.mjs` | Heal mid-sentence page-break splits in already-imported Supabase texts (dry-run default, `--write` to apply; `--slug=`/`--id=` to scope) | Maintenance only |
| `scripts/generate-note-drafts.mjs` | Backfill note_draft in Supabase for existing texts | Maintenance only |
| `scripts/generate-summaries.mjs` | Backfill summaries in Supabase | Maintenance only |
| `scripts/repair-summaries.mjs` | Repair truncated summaries | Maintenance only |

---

## Notes on Sources

- **New Advent** (`newadvent`): static HTML — fetch-texts.mjs handles it directly. Many works span multiple chapter pages; list all URLs in the `urls` array. **The June-2026 `/fathers/` breakage is RESOLVED as of 2026-08-29** — chapter pages (e.g. `/fathers/33041.htm`) serve their text normally again; verified via direct URL and `curl -sIL … | grep -i location` returning no redirect. (History: from ~June 2026 the `/fathers/` URLs silently redirected to the homepage regardless of fetch method — verified 2026-07-12 — and the workaround was the Archive.org OCR scan of the same volume; that workaround is no longer needed while the pages work, but re-check with a `curl` no-redirect probe before a run, since this has flipped before.) New Advent's per-work index page (e.g. `/fathers/3304.htm`) links the individual Book pages; for the Sourcer, pin the Book pages via the multi-part `Additional edition URLs` field.
- **CCEL** (`ccel`): the reading pages render dynamically (a plain HTTP fetch of the `.html` gets the SPA shell), **but CCEL also exposes a plain-text Unicode export that IS directly fetchable**: `https://ccel.org/ccel/{letter}/{author}/{work}/cache/{work}.txt` (`{letter}` = the author's first character; e.g. Anselm's Basic Works: `https://ccel.org/ccel/a/anselm/basic_works/cache/basic_works.txt`). One file holds the whole work, no OCR, no browser needed. `ccel.org` is on the Sourcer allowlist, and the fetch tool derives the cache `.txt` from **either** the natural reading URL `/ccel/{author}/{work}/{work}` (no letter — e.g. `ccel.org/ccel/anselm/basic_works/basic_works`, `ccel.org/ccel/benedict/rule/rule`) **or** the storage form `/ccel/{letter}/{author}/{work}/…`, so you can pin whichever CCEL URL you have to hand. (Older fallbacks, no longer preferred: the Archive.org djvu.txt scan of the NPNF volumes `archive_ocr`, or browser-based extraction `ccel_browser` from the reading URL `ccel.org/ccel/{author}/{work}/{work}.i_1.html`, confirmed 2026-07-12 with Traherne's *Centuries of Meditations*.)
- **Project Gutenberg** (`gutenberg`): plain text — fetch-texts.mjs handles it. Use the plain text URL (not HTML).
- **Wikisource** (`wikisource`): mediawiki HTML — fetch-texts.mjs handles it. Use the `/wiki/` URL.
- **Archive.org** (`archive_online`): Use djvu.txt URL for OCR works; use direct HTML URLs for clean digitised editions.

For multi-volume NPNF works on Archive.org, the djvu.txt identifier pattern is typically:
`https://archive.org/stream/{identifier}/{identifier}_djvu.txt`
