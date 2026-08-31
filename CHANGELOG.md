# Changelog

Working-state log, newest entry on top. Written at the end of a session, in plain prose — not a
formal spec or the git log. Purpose: let a fresh session (or future you) get oriented fast without
re-deriving what's already settled. Forward-looking feature ideas belong in the Notion Feature
Backlog, not here; this is what actually happened and why.

---

## 2026-08-30 — Index filtering & sorting on /texts and /authors

Shipped the long-overdue [Index filtering — /texts and /authors](https://app.notion.com/p/350d9194805d819db153f7a56f8f44f3)
backlog item ([PR #26](https://github.com/iamkeithmason/stromata/pull/26)). Both index pages
listed everything alphabetically with no way to narrow — fine at the 23 texts the feature was scored
against, a materially worse artefact at the current 114 texts / 26 authors. Now `/texts` filters by
**tradition, era, genre** (sort by title / author / length) and `/authors` filters by **tradition,
era** (sort by name / most texts / chronological, keeping the per-author text count).

**Data shape mattered here.** The backlog note assumed tradition/era/genre were all foreign keys on
`texts`; in fact only `genre` is direct — `tradition` and `era` live on `authors`. So the `/texts`
query embeds the author's tradition/era one hop (`author:authors(…, tradition:traditions(…),
era:eras(…))`) to filter on them, while `/authors` reads both directly. Facets are derived from the
*published* library, so a filter dimension only shows values that actually have content and a
single-value dimension is hidden entirely — no dead filters.

**Shape of the implementation.** Pages stay server components (fetch + facet derivation; reading
time is computed server-side so text bodies never ship to the client). A small client component
(`TextsBrowser` / `AuthorsBrowser`, plus a shared `FilterPill` and `lib/facets.ts`) does instant
client-side filtering — comfortably under the ~200-text threshold the ticket flagged — and syncs
state to the URL query (`?tradition=&era=&genre=&sort=`) via `history.replaceState`, so a filtered
view is shareable/bookmarkable without a server round-trip. Pills mirror the existing `ThemeChip`
(uppercase serif, gold border + ink text when active); existing row markup (including the
`/authors` stretched-link) is preserved.

**Analytics.** A follow-up commit added Umami tracking on the filter/sort controls, per the CLAUDE.md
conventions: `index-filter { from, dimension, value }` (fired when a facet is applied, not cleared;
`value` is the slug) and `index-sort { from, sort }`, with `from` = `library-index` on `/texts`,
`authors-index` on `/authors`. **Not yet wire-verified** — the beacon can't be observed from the
build/agent environment, so per the analytics rule these aren't "done" until Keith intercepts the
request on production, and the two new event names + `dimension`/`value`/`sort` property values still
want a row in Growth Tracker → Events Register. The result-link clicks themselves remain untracked
(unchanged from before) — a possible later `text-open`/`author-open` fast-follow.

Notion backlog item moved to **Built**.

## 2026-08-30 — Dead-link sweep: phantom collections, draft-author 404s, admin alert

Started from a reported 404 — the homepage linked John Keble's *National Apostasy* to
`/collections/national-apostasy-keble`, which didn't exist — and it opened into a whole class of
dead links. Two independent root causes, plus a data cleanup and a guard so it doesn't recur.

**Phantom single-text collections.** `pipeline-import.mjs`'s `findOutputFiles()` excluded the
review-summary meta file with `!f.endsWith('-review-summary.md')` — which matches
`clean-archive-ocr.mjs`'s `{slug}-review-summary.md` but **not** `fetch-texts.mjs`'s
`_review-summary.md` (underscore prefix). So every *digital single-text* import counted two files,
tripped the `files.length > 1` branch, and created a bogus `collections` row (unpublished) with the
one text linked to it. The published text then rendered as a collection card linking to a slug the
collection page 404s. Fixed by matching the shared `review-summary.md` suffix (same one-liner in
`detect-scannos.mjs`). Defensive half: the homepage, text-reader, and theme pages joined/linked
collections without a `published` filter — now they ignore unpublished collections and fall back to
a standalone text entry. DB cleanup removed the three phantom rows (National Apostasy, Small
Catechism, the staged Pilgrim's Progress) and unlinked their texts.

**Draft-author 404s.** Author pages 404 for `draft: true` authors (intentional — unreviewed stubs),
but the text-reader byline links to `/authors/<slug>` unconditionally. 17 authors had published
texts while still draft stubs (Luther with 6 texts, Jerome, Keble, Tyndale, Hooker, Baxter, …), so
every one of those bylines was a dead link. Fixed in code without touching the draft flag (HARD
CONSTRAINT 6 keeps promotion manual): a draft author *with published texts* now renders a minimal
page (name, dates, tradition, their texts) with the unreviewed bio suppressed everywhere (body,
JSON-LD, meta description) until Keith promotes them; a draft author with no published texts still
404s.

**Admin integrity alert.** `/admin` now shows a "Needs attention" panel listing exactly these two
hazards on live data — a published text with a draft author, or a published text pointing at a draft
collection — each with a deep link to promote the author / edit the collection. Computed from the
dashboard's existing text query (added `draft` / `published` to the author and collection joins).

**Duplicate removed.** Found two copies of Chrysostom's *On the Priesthood*: a live New-Advent set
(`on-the-priesthood`, 2026-05-21) and a redundant OCR re-import (`on-the-priesthood-chrysostom`,
2026-06-30, done during the June New-Advent `/fathers/` outage). Deleted the 6 draft texts + draft
collection; marked the queue prospect `rejected` with the reason so it can't re-import.

**New tool.** `scripts/audit-dead-links.mjs` — read-only, runs the same three checks (live text →
draft collection, live text → draft author, thin/≤1-text collections) against Supabase and exits
non-zero on any live dead link. Safe to run after any batch or in CI.

**The Stromata staged books — cleaned & staged.** Only Book I of Clement's *Stromata* was in the
DB, though Books I–VIII sat staged under `output/stromata/`. Re-read all eight: the translation
(New Advent / Roberts-Donaldson ANF, PD) is clean and complete, but each file carried New Advent
nav/footer boilerplate, no `note_draft`, and empty `themes`. Cleaned Books **II, IV, V, VI, VII**
(stripped the nav header + `CONTACT US | ADVERTISE WITH NEW ADVENT` footer, dropped the duplicate
`# The Stromata (Book N)` title line, normalised `## Chapter` → `# Chapter` to match the live Book
I, wrote full frontmatter with themes + a museum-label `note_draft`) into `output/the-stromata/`,
and added a `the-stromata-clement` queue entry (`status: staged`). **Book III** is included too, but
in **Latin**: the ANF editors left it untranslated out of Victorian reticence, and no public-domain
English version exists (the only complete one, Oulton & Chadwick 1954, is in copyright). It carries a
`note_draft` explaining this, and a systematic transcription scanno was corrected (`cure` → `cum`,
56 instances) — a Latin-literate review is still advisable before publishing. **Held** in
`output/the-stromata/_held/`: only Book VIII (the fragmentary appendix; the collection is titled
"I–VII", so including it is a scope call). Book I's stale staged copy is kept there too.

This surfaced a real limitation in `pipeline-import.mjs`: its `alreadyInDatabase()` pre-flight
skipped a whole prospect if a collection with that slug already existed, so it could never **add**
chapters to an existing collection. Removed that coarse check — per-text slug skipping in
`importTextFile` (plus the "all files already existed → imported" finalizer) already guarantees
idempotency, and now a prospect can complete a multi-book work whose first book landed earlier. The
actual DB insert still has to run where Supabase creds live (`node scripts/pipeline-import.mjs`);
this session has none, and hand-transcribing ~150k words of patristic text through SQL would risk
corrupting it, so the run is left for a credentialed environment. That run will import the six
staged Stromata books — II, III (Latin), IV, V, VI, VII — (Book I skipped by slug) into the existing
`the-stromata` collection, plus the already-staged *Pilgrim's Progress*.

---

## 2026-08-30 — Admin agent-run countdown; Notion Source Guide

Two small operator-facing additions, no pipeline behaviour change.

**Admin "next agent run" countdown.** The admin dashboard now shows a quiet one-line countdown under
the nav cards — `Next agent run — Scout in 3d 6h 12m · Sourcer in 12d 7h 12m` — so the schedule is
visible without opening the Actions tab. It's a client component (`app/admin/AgentSchedule.tsx`) that
mirrors the two workflow crons in UTC (Scout `0 6 1,15 * *`, Sourcer `0 7 1 * *`) and ticks every 30s;
it renders a non-breaking placeholder on the server and fills in after mount to avoid a hydration
mismatch. Display-only — reads nothing, triggers nothing. **If either cron changes, update the
`SCHEDULES` constant to match** (there's a comment on it pointing at the two YAML files).

**Notion "Source Guide".** Wrote a human-readable source reference under *The Stromata: Growth
Tracker* (sibling to the Content Prospect List): the Sourcer allowlist, `source_type` values and the
`Reference URL → source_type` inference, how pinning works (`Cleared edition URL` / `Additional
edition URLs` / plain-text rewrites / multi-part all-or-nothing), per-source quirks (New Advent
flip-history, CCEL cache-txt), known provenance traps, the copyright rule, the run cadence + the
end-to-end editor loop, and a codebase map. `CLAUDE.md` and `scripts/sourcer/config.ts` stay the
code-side source of truth; the page is a map, not a fork.

---

## 2026-08-29–30 — The Sourcer: acquire & stage rights-cleared prospects (the pipeline's mechanical half)

The **Sourcer** (`scripts/sourcer/`) is the agent after the Scout. Where the Scout *proposes* rows,
the Sourcer takes a prospect the editor has **rights-cleared and pinned**, acquires that exact
edition, runs deterministic cleanup, **detects (never fixes)** risky OCR, and stages a reviewable
draft bundle under `content/staging/`. Then it stops. It never chooses a source, never clears
copyright, never applies a probabilistic change, and never touches the live site or DB. Merged in
PR #22.

**The copyright boundary is structural, not a prompt plea.** `fetch_pinned_source` takes a prospect
id and resolves the fetch URL **server-side** from the editor's `Cleared edition URL` — a `url` in the
tool input is ignored, and the `PreToolUse` hook denies the fetch if the resolved host is off the
allowlist. The agent inherits nothing (`settingSources: []`, built-ins disallowed, `allowedTools`
limited to the five Sourcer tools). So the agent *cannot* substitute or discover a source; it
concatenates human-pinned, allow-listed parts and nothing else.

**The entry gate** (pure, unit-tested, no SDK/network) refuses with a discriminated reason before any
fetch: `rights-not-cleared`, `no-cleared-edition` / `source-not-allowlisted`, `no-provenance-basis`,
`author-copyright-fail`, `author-missing` (flags, doesn't abort), `already-present`, `already-staged`,
`over-cap`. Two new human-only Notion fields drive it: **`Cleared edition URL`** (url) and **`Rights
cleared`** (checkbox); `Translation notes` remains the provenance basis, copied verbatim into the
draft.

**Source allowlist + plain-text rewrites.** Hosts (suffix match): `archive.org`, `anglicanhistory.org`,
`sacred-texts.com`, `wikisource.org`, `newadvent.org`, `ccel.org`. The fetch tool rewrites to plain
text where it exists — Archive.org → `_djvu.txt`, and a CCEL work URL (either the reading form
`/ccel/<author>/<work>/…` or the storage form `/ccel/<letter>/<author>/<work>/…`) → its
`/cache/<work>.txt` Unicode export. (CCEL reading pages render dynamically; that cache `.txt` is
directly fetchable — no browser, no Archive detour.)

**Multi-part pinning.** A work split across allow-listed pages (e.g. the four books of John of
Damascus's *Exact Exposition* on New Advent) is pinned as `Cleared edition URL` + `Additional edition
URLs` (one per line, in order). All parts are validated **all-or-nothing** (one off-allowlist part
refuses the whole prospect — this caught a `ttps://…` typo mid-run and correctly refused), fetched in
order with a rate-limit, and concatenated into one immutable `raw.txt` with a `<!-- SOURCER PART n/N ·
url -->` marker per part. Prefer one whole-work URL (an Archive `djvu.txt`) where it exists.

**Detect, don't correct.** Deterministic, unattended-grade transforms are *applied* into `body.md`
(ligature repair, doubled apostrophes, soft-hyphen scrub, footnote-marker strip, Google-Docs block
repair + verse flagging, **New Advent page-chrome strip**). Everything probabilistic is *detected and
reported* in an editor-editable `ocr-report.md` (scannos formatted to feed the existing
`detect-scannos --apply-reviewed` round-trip; orphaned markers; garbled Greek; theologically-loaded
near-homographs like ἀγένητος vs ἀγέννητος — offered, never applied). The staged bundle is
`raw.txt` (immutable) · `body.md` · `provenance.yml` (verbatim) · `metadata.yml` (proposed) ·
`ocr-report.md` · `SOURCER.md`.

**Bridge to import.** `stage-to-output.mjs` splits `content/staging/<slug>/body.md` at its `# … (Book
N)` headings into the layout `pipeline-import.mjs` consumes (`scripts/ingestion/output/<slug>/*.md` +
a `staged` queue row), because the legacy `split-into-chapters.mjs` can't parse the Sourcer's inline
headings. End-to-end validated on John of Damascus: a 4-book draft collection landed in Supabase
(4 texts, all draft, one collection), `published: false`.

**Ops flags & CI.** `--dry-run` (default) · `--apply` · `--max 3` · `--refresh <slug>` (clear a staged
bundle to re-source after a corrected pin, since `raw.txt` is immutable and a staged prospect is
otherwise refused) · `--set-notion-status`. `.github/workflows/sourcer.yml` runs monthly (07:00 UTC,
1st) `--apply --max 3`, opens a **draft** PR with the bundle, plus `workflow_dispatch` (dry-run
default) and a PR dry-run on Sourcer files.

**Provenance assistant** (`scripts/research/`, `npm run research`). An *advisory* SAFE/HOLD copyright
research CLI for the editor — paste a source URL, it fetches (with an SSRF guard) and has Claude
return a verdict + reasoning to speed the human clearance call. It never imports, never writes Notion,
never clears anything — the `Rights cleared` decision stays a human call. Coerces to HOLD on any
ambiguity. This exists because the judgement is the slow part: it caught a nearly-cleared
copyrighted 1958 Chase translation of John of Damascus (the archaic "hath" was a KJV *epigraph*
masking a modern body — verify the body with a verbatim phrase match, not the quoted scripture).

**Also this arc:** New Advent's `/fathers/` breakage was confirmed **resolved** (2026-08-29, re-probed
with a no-redirect `curl`) and `CLAUDE.md`'s source notes updated accordingly; the Scout prompt gained
a "prefer a fetchable, allow-listed URL" hint so its triage URLs favour what the Sourcer can actually
fetch (PR #24); and the Scout's env credentials are now read lazily to fix local runs (PR #23).

---

## 2026-08-28 — Scout agent v0.1: real V/C/E scoring, derived Era, tradition guard

The first live Scout run surfaced two classes of error, and reading the live Content Prospect List
schema confirmed the v0 prompt's scoring model was simply wrong. This patch corrects both against
the real database — no migration needed (the Byzantine / Oriental Orthodox tradition options were
already live, so the 2026-08-28 misclassifications were genuine agent errors, not a vocab gap).

**Scoring was fabricated; now it's the real formula.** v0 invented an ICE (Impact/Confidence/Ease)
model and emitted a made-up aggregate number (`181.3`, `156.3`, …) that had no relationship to
anything in Notion. The database actually scores on **Value / Complexity / Effort** — each an
integer 1–3, where Complexity and Effort are *cost* axes (higher = worse) — plus a read-only Score
formula. The Score formula is literally `Value ÷ (Complexity + Effort)` (read from the Notion
property editor). So: the agent now emits *only* the three integers; every fabricated aggregate and
the "ICE" column are deleted; `computeScore` ports the real formula and is pinned to seven real
`(V,C,E)→Score` rows in `scoring.test.ts` as a drift guard; ranking and the below-threshold cut use
that Score; and the Scout **never writes** the read-only Score property.

**Era is computed, never proposed.** Era is fully determined by the author's death year, so
`taxonomy.ts` derives it (fallback floruit/birth) and the agent no longer sets it. Missing dates →
Era blank + a `needs-editorial` flag. (The Apostolic bound is 110, not a hard 100, so the Apostolic
Fathers who died just after 100 — Ignatius d. c.108 — land in Apostolic per the regression target.)

**Tradition is guarded deterministically.** The load-bearing fix. The agent may propose a tradition,
but code validates it against the death year before any write. It **auto-reassigns** only among the
three date-settled traditions (Early Church ≤325 / Patristic 325–600 / Byzantine 600–1054) — so a
Greek-East author mislabelled "Patristic" becomes Byzantine — and otherwise **flags**
`needs-editorial` with the field cleared rather than guessing (post-1054 East/West, a Reformation
confession, a boundary figure like Wycliffe, or missing dates). Oriental Orthodox / Ecumenical are
never flagged on date alone. Corrections/flags are recorded in Editorial notes (`↻` / `⚑`) and the
row still lands `Proposed — agent`. `taxonomy.test.ts` pins the exact 2026-08-28 regression target
(John of Damascus/Climacus/Symeon → Byzantine auto; Anselm/Julian/Palamas → cleared + flag).

**Write contract remapped to the real schema.** No invented fields: copyright is encoded by the
Complexity score + a `Translation notes` caveat (there is no separate copyright-flag field); the
provenance caveat lives in Translation notes; rationale/discovery/generated-by/dedupe-key/taxonomy
markers live in Editorial notes; Score is never in the payload. The hook now blocks unless V/C/E are
each integers 1–3, Reference URL is valid, the caveat is present, Status is exactly `Proposed —
agent`, and Tradition/Era are each a valid option or blank-with-a-`needs-editorial`-flag. The
copyright hard gate stays: death ≥ 1900 → `rights-excluded`. Skip reasons: `copyright-excluded`
renamed to `rights-excluded`; `contract-violation` is now a retryable *malformed* attempt, not a
skip. 26 unit tests (formula fixtures + taxonomy regression + gate) all pass; tsc + lint clean.
`GENERATED_BY` bumped to `scout-agent v0.1`. Docs in `scripts/scout/README.md`.

---

## 2026-08-28 — Scout agent v0: corpus gap analysis → Notion proposals

A new scheduled Agent SDK script, the **Scout** (`scripts/scout/`), does corpus gap analysis and
proposes new Content Prospect List entries into Notion for editorial review. It is a separate concern
from the ingestion pipeline (which fetches/cleans/stages texts): the Scout only fills the *desk*. It
is read-only against the corpus and Notion; its one and only write is creating provisional proposal
rows, and only through a contract-enforcing `PreToolUse` hook. Single agent, no subagents in v0.

**What it does.** Reads `authors` + `texts` from Supabase (SELECT only) to build a published-text
coverage map per tradition × era plus the covered-author/covered-work dedupe sets; reads the live
Content Prospect List for dedupe; then a single Sonnet-5 agent proposes gap-filling authors/works
best-first via one tool, `propose_prospect`. Everything else is deterministic TypeScript.

**Reconcile-first, and the scoring surprise.** The live Notion DB does not score on
Impact/Confidence/Ease — it uses **Value / Complexity / Effort** (each 1–3) plus a read-only **Score**
formula, and Status has no "Proposed" option. So the Scout computes ICE internally (for the threshold
and ranking) and *projects* it onto those native 1–3 axes, so agent rows sort under the same Score
formula as Keith's hand-entered rows. The **priority model** — tradition weight (High/Medium/Low) and
the High/Late-Medieval bonus — is applied in code (`config.ts`/`scoring.ts`), never left to the
agent. Impact→Value, Confidence+copyright-flag→Complexity, Ease→Effort. Status is stamped
`"Proposed — agent"` (Notion auto-creates the select option on first write); it is deliberately
distinct from every human status so agent proposals stay filterable, and the hook refuses anything
that reads as decided.

**The contract lives in the hook, not the prompt.** `hook.ts` + `contract.ts` gate every proposal:
required fields, controlled tradition/era/genre values, provisional Status, copyright triage
exclusion, dedupe (corpus → existing prospects → in-batch), ICE threshold, and the per-run cap —
each a discriminated, logged decision (`already-published` / `already-proposed` / `copyright-excluded`
/ `below-threshold` / `duplicate-in-batch` / `over-cap` / `contract-violation`). No silent drops, same
discriminated-reason discipline as the `pipeline-import.mjs` fix. The agent's tool surface is sealed
(`settingSources: []`, built-ins disallowed, `allowedTools` = the one create tool, catch-all deny
hook) — no bash, no filesystem, no web, no Supabase/Notion write beyond the single gated create.

**Dry-run by default, idempotent.** `--dry-run` (default) writes nothing and prints the proposed
batch as a markdown table plus the full skip log; `--apply` creates the rows; `--max N` caps them
(default 10). Dedupe against corpus + prospect list means re-runs converge — a second `--apply`
proposes nothing new unless coverage or thresholds changed. The Scout stays firmly on the pipeline's
safe side: no copyright clearance (triage only), no sourcing/fetching/OCR, no Supabase or Feature
Backlog writes, and nothing published.

**Cron wrapper.** `.github/workflows/scout.yml` runs fortnightly (06:00 UTC, 1st & 15th) with
`--apply --max 10`, plus `workflow_dispatch` (defaults to dry-run); the batch + skip log post to the
run summary. Secrets: `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `SCOUT_SUPABASE_URL`, `SCOUT_SUPABASE_KEY`
(read-only). The enforcement gate has a framework test (`npm run test:scout`, 12 cases) that runs with
no API key or network — every skip reason, accept, projection, and re-run convergence. Deps added:
`@anthropic-ai/claude-agent-sdk`, `zod`, `tsx` (dev). Full notes in `scripts/scout/README.md`. The
Davenant-syllabus seed list (`SEED_PRIORITIES`) is a config hook left empty for v0 — nothing scraped.

---

## 2026-08-20 — Pipeline operator GUI, chapter splitter, footnote handling (PR #19)

A multi-session arc (Aug 17–20) landed as one branch/PR: the content pipeline grew a browser GUI,
a long-text chapter splitter, and OCR footnote de-interleaving. All of it is dev-facing tooling and
staging logic — nothing here publishes texts or promotes authors; the hard constraints are intact.

**The pipeline GUI (`/admin/pipeline`).** An operator UI over the whole pipeline, so the mechanical
parts no longer mean hand-editing `prospect-queue.json` and typing `node scripts/...`. It exposes:
the prospect queue (add/edit/reject via a form whose tradition/era/genre/source_type/theme inputs
are dropdowns bound to the controlled vocabularies, re-validated server-side); the visible
**Fetch/Extract → Review → Mark staged → Run import → Drafts → publish** ladder; dev-only one-click
runners that stream script output live (Fetch = generate config + `fetch-texts.mjs`, Extract =
`extract-docx.mjs`, a toolbar Run import over all `staged`); staged-output review that edits
title/genre/themes in the frontmatter; and **Research from URL** — paste a source URL, a route
fetches the page and has Claude extract metadata + a SAFE/HOLD copyright verdict, then pre-fills the
New Prospect form (advisory only; HARD CONSTRAINT 3 stays a human call). All runners 403 in
production. Files: `app/admin/pipeline/*`, `app/api/admin/pipeline/{queue,run,output,research,split}`,
`lib/pipeline/{vocab,queue,runner,outputs}.ts`.

**A gap the GUI surfaced, and fetch-quality fixes.** Using it revealed that Fetch is only Stage 2 —
it produced output but left the prospect where it was, so fetched texts were stranded, and import
lands in Drafts (not the live list). Fixed the ladder to auto-advance. Also fixed real fetch-quality
bugs found on the Small Catechism (Wikisource) and National Apostasy (Keble): MediaWiki TemplateStyles
CSS was dumping into the body, titles came from the scraped page (`Small_Catechism`, `keble1`) instead
of the prospect, themes were hardcoded empty, and source/translation notes were left as `# TODO`.
Fixed forward in `fetch-texts.mjs`/`runner.ts` and retroactively in Supabase for the two imported drafts.

**Chapter splitter (`split-into-chapters.mjs`).** Splits one long OCR/markdown work into a per-chapter
collection (the pattern already used for Hydriotaphia etc.). Heuristics-first and deterministic:
detect `CHAPTER N`/`BOOK N`/etc. markers, keep the dominant kind, **enforce ascending numbering** (so
an inline "as in Chapter XVIII" cross-reference OCR left on its own line doesn't create a false
boundary), pull titles from the all-caps line(s) after each marker, clip front/back matter (starts at
the first marker, stops at INDEX/APPENDIX), reflow each chapter. A "Split into chapters" GUI action
previews the detected boundaries before writing.

**Footnote de-interleaving (`footnote-deinterleave.mjs`).** The hard part: djvu.txt drops each page's
footnotes into the text stream at the page break, splitting sentences and even words ("held to-" +
[footnotes] + "gether"). It anchors on page-break chrome (a standalone page number *or* a running head,
which OCR often merges: "CHRIST THE ONLY HEAD OF THE CHURCH 33"), scans up to note 1 to find the
footnote stack (also catching a chapter's final-page notes), rejoins the split word, and drops inline
markers.

**De Ecclesia (Jan Hus, Schaff 1915) — the proving case.** First found it hadn't really imported: the
prospect (from Research-from-URL) had grabbed the archive.org `/details/` landing page, not the book.
Re-sourced from the djvu.txt OCR, split into **23 chapters** (all titles correct, one stray
cross-reference dropped), imported as a `published:false` collection with a Jan Hus draft-author stub,
and themes assigned per chapter from the controlled vocabulary.

**Footnote policy reversal — drop by default.** After living with the endnotes for a few days, the
retention overhead (and the reading-experience cost of an apparatus section per chapter) wasn't worth
it for reading editions. Stripped the notes from all 23 De Ecclesia chapters (recoverable anytime from
`sources/de-ecclesia-the-church-hus-raw.txt` via the splitter's endnotes mode) and **flipped the
splitter default to drop footnotes**, with an opt-in `--footnotes=endnotes` / GUI "Keep footnotes as
endnotes" toggle for the occasional text that wants them. Clean core text is now the zero-effort path;
retention is a deliberate choice.

---

## 2026-07-13 (later still) — Second round of collections: Luther and Browne

Continued up the size-sorted collection list: *An Open Letter to the Christian Nobility of the
German Nation* (Luther, 3 chapters), *Christian Morals* (Thomas Browne, 3 parts), and
*Hydriotaphia, Urn Burial* (Thomas Browne, 5 chapters) — 11 files total, all verified in parallel.

**An Open Letter to the Christian Nobility — finally a clean Luther result.** Given this session's
run of Luther prospects turning out to match the copyrighted Luther's Works American Edition, each
of the 3 chapters got the full verbatim-comparison treatment against Project Wittenberg's hosting
of C. M. Jacobs' 1915 Philadelphia Edition translation. All 3 matched cleanly — this is a genuinely
different, safe translation, not a near-miss. One structural quirk caught before staging: the
"Chapter One" file's extraction actually ran Chapter I straight through Chapter II's content and
ended with a bare, empty "Chapter III" heading — stripped that trailing stub; no actual duplicate
content existed between the three chapter files once checked directly.

**Christian Morals confirmed its own folder name.** All three parts of Browne's *Christian Morals*
are missing the standard numbered section headers (Part I is missing sections 20-36 of 36; Part II
all 13; Part III all 27) — exactly what "Needs Headers" in the folder name promised. Content itself
is clean, unmodified 17th-century Browne with no translation risk (he wrote in English). Imported
as-is with the defect flagged in each chapter's `translation_notes`, rather than attempting to
reconstruct the numbering myself — that's a slower, more error-prone task better suited to a
dedicated manual pass later.

**Hydriotaphia** — straightforward, all 5 chapters clean 1658 Browne prose, no issues.

All 3 collections confirmed in Supabase via a `collections` → `texts` count query (3/3/5 chapters
respectively), `published: false` throughout. Draft author stubs: Thomas Browne (new); Luther's
existing stub reused.

Running total: 5 multi-file collections imported today (Consolation of Philosophy, Canons of
Ælfric, Open Letter to the Christian Nobility, Christian Morals, Hydriotaphia), covering 16
chapters across 5 distinct works. Next up by size: Apostolic Constitutions (6 files), then On the
Miraculous Images (8 files).

---

## 2026-07-13 (later still) — First multi-file collections

Moved from single-file candidates to the ~18 multi-file collection subfolders in `_READY TO
PUBLISH`, per "start with the smallest and work your way up." Sorted all subfolders by recursive
file count first; the two smallest (2 files each) went first as a way to validate the mechanics
before tackling anything bigger:

- **The Consolation of Philosophy** (King Alfred's Old English version of Boethius) — 2 chapters:
  the prose Consolation and the versified "Lays." Both are Walter John Sedgefield's 1900 Oxford
  translation, confirmed via verbatim phrase match against Wikisource. Worth flagging: Sedgefield
  died in 1945, after CLAUDE.md's usual "translator died before 1928" shorthand — but the
  translation was *published* in 1900, and under actual US copyright law that's what matters for
  pre-1978 works (publication before 1929 = unconditionally PD, regardless of the translator's
  later death date). Documented this distinction explicitly in CLAUDE.md so it doesn't read as an
  error next time a similarly-dated translator turns up.
- **The Canons and Pastoral Epistle of Ælfric** — 2 chapters, both Benjamin Thorpe's 1840
  translation (Ancient Laws and Institutes of England), confirmed via an archive.org URL embedded
  directly in the extracted text. The Drive folder was labeled "(Puttoc)," which turned out to be
  a factual error, not just a stylistic choice — Puttoc (Wulfstan II) became Archbishop of York
  only after Ælfric's own death; the real correspondent, confirmed from the letter's own content,
  was Wulfstan I. Corrected in the imported text and title.

Both collections imported via the directory-based multi-chapter path in `pipeline-import.mjs`
(`scripts/ingestion/output/{collection_slug}/`, one `.md` per chapter with `collection_order`) —
confirmed via a `collections` → `texts` join query, not just a flat `texts` check, since a
collection's existence is a separate fact from its chapters existing. Author stub created for
"Boethius (adapted into Old English by Alfred the Great)"; Ælfric already existed.

Documented the full collection procedure in CLAUDE.md under "Next Drive batch" so this doesn't
need re-deriving next time: output-directory convention, one-queue-entry-per-collection, smallest-
first ordering, folder-name-as-claim-not-fact, and the publication-date-vs-translator-death-year
distinction.

---

## 2026-07-13 (later still) — Eighth batch: the last of the untouched single-file candidates

Ran a full inventory cross-check first: 77 single-file .docx candidates sit at the root of the
Drive `_READY TO PUBLISH` folder (separate from 18 multi-file collection subfolders, 31
already-live texts in a `_ Live on Stromata 2026` subfolder, and ~21 already-flagged-copyright
texts in a `Copyright_` subfolder). Of those 77, only 11 had never been looked at. Ran all 11
through the parallel-research-agent pattern in one go.

**Staged and imported (7):**
- *A Learned Discourse of Justification* — actually Richard Hooker's 1586 Temple Church sermon
  (filename gave no author). Checked against a known 2022 copyrighted Davenant Institute
  modernization of the same sermon and confirmed distinct wording.
- *An Address to Demetrianus* (Cyprian) — standard Wallis/ANF translation.
- *Directions for the Right Singing of Scripture Psalms* — Francis Roberts (1675), from his
  *Clavis Bibliorum*.
- *A Homily of Mar Jacob of Serugh on the Reception of the Holy Mysteries* — Dom Hugh Connolly's
  1908 translation, confirmed PD via a verbatim opening-line match.
- *The Reduction of Episcopacy* — James Ussher; the Drive filename ("Reducation of the
  Episcopacy") was a double error, both misspelling "Reduction" and omitting the author.
- *The Christian Alphabet: A Dialogue Between Giulia Gonzaga and Juan de Valdés* — a second,
  distinct excerpt from Valdés's Alfabeto Christiano (the first excerpt was imported in an earlier
  batch today); confirmed no content overlap before staging both.
- *A Call to the Unconverted to Turn and Live: Sermon I* — actually Richard Baxter (1658), not
  the earlier "John Wesley (unconfirmed)" guess.

**Held (2):**
- *The Seventh Sermon: Office of the Magistrate* — identified as Bullinger's Decades II.7; title
  and numbering are an exact match to William Gross's onthewing.org modernization (the same risk
  source caught earlier today on Tyndale's *Obedience*). A genuinely PD alternative exists (Parker
  Society, 1849) but this file isn't confirmed to be it.
- *Alfred's Preface to the Pastoral Care* — Alfred the Great himself is safely PD, but the specific
  English translation in this file has no credited translator and doesn't verbatim-match any of
  three known PD candidates checked (Sweet 1871, Warner 1917, Marlowe). The hosting page carries a
  non-commercial license. A safe substitute is known and named (Sweet's 1871 EETS translation) if
  Keith wants this text later.

**Duplicates caught before staging (2, no action needed):** *Of Patience* (Tertullian) and *Of
the Good Marriage* (Augustine) turned out to already be live on the site under different filenames
- caught via a Supabase slug check before any output file was built. Their Notion pages already
carried "confirmed duplicate" notes from an earlier pass, so no new edits were needed there.

All 7 imported texts confirmed in Supabase as `published: false`. Draft author stubs created for
Hooker, Roberts, Jacob of Serugh, Ussher, and Baxter; Cyprian and Valdés already existed.

**This closes out the single-file `_READY TO PUBLISH` root folder as a category** — every
candidate that was going to be looked at as an individual file now has been (imported, held, or
confirmed a pre-existing duplicate). What's left in that folder specifically: 3 confirmed-copyright
files awaiting Keith moving them to `Copyright?`, roughly a dozen genuinely unresolved holds (some
now with a named, safe alternative edition to pursue), 8 pre-session not-PD rejects, one item
pending Ollie's permission, and the 4-file Religio Medici (Browne) set, which behaves like a
mini-collection and is better handled with the multi-file-collection procedure next. Beyond that
folder, 18 multi-file collections in their own subfolders remain completely untouched - the
natural next phase of this project.

---

## 2026-07-13 (later still) — Seventh batch (Needs investigation), parallel-agent method

First attempt at delegating research to parallel subagents rather than doing it serially myself,
per Keith asking whether batches could run concurrently. The pipeline's actual writes
(`prospect-queue.json`, the Supabase import, `CHANGELOG.md`) are shared state that concurrent
writers would race on, so the split was: spawn one research-only subagent per candidate to extract
its docx, identify the true author from internal evidence, and verify translation/copyright
provenance — then handle all the actual writes (queue, import, Notion, changelog) myself,
serially, after collecting their reports. This also doubled as the deferred "Needs investigation"
batch (author unconfirmed from filename alone) that CLAUDE.md recommends treating separately.

8 candidates, 8 parallel agents, all returned within roughly a minute and a half:

**Confirmed safe (6):**
- *Epistle 105, To Serenus* — actually Gregory the Great (d. 604), not the earlier "Jerome
  (unconfirmed)" guess. Barmby/NPNF translation.
- *Letter 146, To Evangelus* and *Letter 52, To Nepotian* — both Jerome (d. 420), both standard
  Fremantle/Lewis/Martley NPNF translations.
- *Letter 54, To Januarius* — actually Augustine of Hippo (d. 430), correcting the earlier
  "Cyprian of Carthage (unconfirmed)" guess; internal content (Monica, the Ambrose fasting
  anecdote at Milan) is unambiguous. Cunningham/NPNF translation.
- *On Laying the Foundation of the New Chapel* — identified from a bare, author-less filename as
  John Wesley's Sermon 132 (preached 1777), confirmed by autobiographical content matching
  Wesley's own account of early Methodism.
- *The Second Rhythm* — identified from an ambiguous filename as a hymn of Ephrem the Syrian,
  J. B. Morris's 1847 Oxford translation.

**Held (2):**
- *On Mortality* — content confirmed as Cyprian's *De Mortalitate*, but the extracted text is a
  verbatim match to Roy J. Deferrari's 1958 Fathers of the Church translation (Catholic University
  of America Press), still actively in print and copyrighted — not the PD Wallis/ANF Vol. 5
  edition. Would need re-sourcing from ANF to stage.
- *The Cross Versus the Tree of Liberty* — identified as Abraham Kuyper's 1889 Anti-Revolutionary
  Party address "Not the Tree of Liberty, but the Cross." Kuyper died 1920, failing HARD
  CONSTRAINT 3 outright regardless of translation status — a hard reject, not a soft hold.

All 6 safe texts staged, imported via `pipeline-import.mjs`, and confirmed in Supabase as
`published: false`. Draft author stubs created for Jerome and Ephrem the Syrian; Augustine, Wesley,
and Gregory the Great already existed and were reused. All 8 Notion pages updated with corrected
authors and findings.

**On the parallel-agent method itself:** worked well for this shape of task specifically — each
item was an independent, bounded research question (identify + verify one file) with no
cross-item dependency, so there was nothing to race on during the research phase. Wouldn't extend
this to the "stage and import" half of a batch, since that touches shared files sequentially by
nature (the import script reads/writes the whole queue file in one pass). Worth reusing this
pattern for future "Needs investigation" sweeps, where identification is exactly this
kind of independent per-item lookup.

Held-back count: 9 unresolved + 4 confirmed-in-copyright + 1 new hard-reject (Kuyper) = 10
unresolved, 4 confirmed copyright, 1 hard reject.

---

## 2026-07-13 (later still) — Sixth Drive batch

Continued after the resolution pass, per "shall we proceed with another batch?" Picked 4 `Text
available` items: Valdés's *In What Manner the Christian Should Study in His Own Book*, Luther's
*Whether Soldiers Too Can Be Saved*, the anonymous *Odes of Solomon*, and *The Tetrapolitan
Confession*.

**Staged and imported (2):**
- *In What Manner the Christian Should Study in His Own Book* (Valdés) — Wiffen's 1861 translation
  (PD); the extracted text itself contained the source page's URL, which made confirming the
  edition trivial.
- *The Tetrapolitan Confession* (Bucer, Capito, Hedio) — Schaff's *Creeds of Christendom* Vol. III
  (1877, PD), confirmed via verbatim match of the Exordium.

**Held back (2):**
- *Whether Soldiers Too Can Be Saved* (Luther) — compared directly against a hosted PDF of the
  confirmed-PD Charles M. Jacobs Philadelphia Edition translation and the wording diverges
  throughout; likely the copyrighted LW American Edition revision of Jacobs' original.
- *Odes of Solomon* — turned out to be a verbatim match to James Charlesworth's modern critical
  translation (Oxford, 1973), which is actively copyrighted. An older PD translation (James Rendel
  Harris, 1909) does exist but isn't what this file contains.

**Bonus resolution — found a second copy of Temporal Authority in the same Drive folder.** While
updating Notion, noticed a second, separate prospect entry titled *Secular Authority: To What
Extent It Should Be Obeyed* — same 1523 Luther work as the held *Temporal Authority*, but a
different file, sitting in the same Drive folder the whole time. Extracted and verified it against
the confirmed-PD Philadelphia Edition (Works of Martin Luther Vol. III, 1915) via verbatim
dedication-letter match — genuinely safe. Staged and imported it instead of the held file. Worth
remembering: when a Luther (or similarly-multiply-translated) prospect is held for edition risk,
it's worth checking whether Keith's Drive folder happens to also contain a differently-titled older
translation of the same underlying work before concluding the work is unreachable — Reformation
classics were often typed up from more than one source into that archive.

All 3 imported texts confirmed in Supabase as `published: false`. Draft author stubs created for
Valdés and for "Martin Bucer, Wolfgang Capito, and Caspar Hedio" (joint-author record for the
Tetrapolitan Confession); Luther's existing draft stub (from earlier today) was reused for Secular
Authority.

Held-back count: 8 unresolved + 4 confirmed-in-copyright (from the resolution pass) minus 1
resolved-via-alternate (Temporal Authority no longer counts as its own unresolved hold, since
Secular Authority covers the same work) plus 2 new holds today = 9 unresolved, 4 confirmed
copyright.

---

## 2026-07-13 (later still) — Held-item resolution pass

Instead of another forward batch, went back through all 13 items held across the day's five
batches (plus one from 2026-07-12) and tried to resolve each one — find a confirmed PD source,
confirm it's genuinely in copyright, or leave it unresolved. Method: pull a distinctive phrase
from the extracted Drive text and search for a verbatim match against a known edition, rather than
judging by prose register alone (register turned out to be an unreliable signal in both
directions this pass).

**Resolved safe (4) — staged and imported:**
- *The Babylonian Captivity of the Church* (Luther) — matches Steinhaeuser's Philadelphia Edition
  translation (1916), confirmed PD via Project Wittenberg. The earlier "sounds like the modern LW
  edition" instinct was wrong here — Steinhaeuser's original 1915-16 PD translation already reads
  fluently; fluency alone isn't evidence of a modern edition.
- *On Cleaving to God* (Albert the Great / likely Johannes von Kastl) — matches Rev. John Henry
  Richards' translation, which he explicitly placed in the public domain in the late 1990s. Same
  translator who produced the PD Theologica Germanica scan used earlier today — a name worth
  remembering for future Rhineland-mysticism prospects.
- *On the Sword* (Hubmaier) — matches Henry C. Vedder's 1905 translation (PD, pre-1923).
- *The Examination of William Thorpe* — base text is Foxe's PD *Acts and Monuments* reprint of the
  1530 Antwerp edition. The actual problem was narrower than "unclear rights": one modern
  editorial parenthetical (a Golden Legend/Longinus gloss) had been spliced mid-sentence into the
  source .docx, probably by whoever originally prepared the file. Stripped that one clause and the
  rest of the text is clean PD. Worth remembering as a category: a hold isn't always "find a
  different source," sometimes it's "delete one sentence."

All 4 imported via `pipeline-import.mjs`, confirmed in Supabase as `published: false`, draft author
stubs created for Luther, Albert the Great, Hubmaier, and the anonymous Thorpe record (none were
previously in the database).

**Confirmed actively in copyright (3) — recommend Keith move the source .docx files to the
Copyright? Drive folder:**
- ***Obedience of a Christian Man*** (Tyndale) — verbatim match to William Gross's 2011
  modernization, published at onthewing.org (© William Gross, Dec 2011). This is a real,
  identifiable, actively-published copyrighted edition, not a guess.
- ***Commentary on the Nicene Creed*** (Theodore of Mopsuestia) — confirmed via its own colophon:
  A. Mingana's translation, Woodbrooke Studies Vol. 5 (Cambridge: W. Heffer & Sons, 1932).
  Mingana died 1937. No older alternative translation exists — these Syriac catechetical homilies
  were essentially unknown in the West before Mingana's discoveries.
- ***Whether One May Flee From a Deadly Plague*** (Luther) — confirmed via the Davenant
  Institute's own sourcing note: this text is drawn from Luther's Works American Edition, Vol. 43
  (Fortress Press/Concordia, trans. Carl J. Schindler) — an actively-sold critical edition.

**onthewing.org / William Gross is now a known risk source.** Discovering the Gross match for
*Obedience* matters beyond that one title: onthewing.org hosts a large library of "modernized"
Reformation and patristic texts (Foxe, Luther's *Nobility of the German Nation*, the Second
Helvetic Confession, and others), each individually copyrighted by its modernizer. Any future Drive
prospect that reads as smooth modernized-but-archaic-flavored English is now worth checking against
onthewing.org by name, not just treating as a generic "modern paraphrase, unclear source" risk.

**Still unresolved (5) — held, with updated notes on why:**
- *Temporal Authority* (Luther) — directly compared against the confirmed-PD Philadelphia Edition
  ("Secular Authority: To What Extent It Should Be Obeyed," Vol. 3, 1915) and the wording doesn't
  match; our text's title itself ("Temporal Authority") matches the modern Luther's Works American
  Edition's title choice, not the Philadelphia Edition's "Secular Authority." Strong circumstantial
  case for in-copyright, not yet verbatim-confirmed.
- *On War Against the Turk* (Luther) — same suspected pattern, but couldn't locate a clean PD
  Philadelphia Edition copy of this specific work to confirm directly.
- *The Battle for the Soul of Man / Psychomachia* (Prudentius) — no PD English translation appears
  to exist at all; only a very free 1743 verse paraphrase, stylistically nothing like the extracted
  text. Effectively a permanent hold barring a new PD translation surfacing.
- *Homily on the Passover* (Melito of Sardis) — structurally can't have a pre-1928 PD translation:
  the complete Greek text wasn't known in the West until 20th-century manuscript discoveries.
  Also effectively permanent.
- *Commentary on 1 Thessalonians 4:6* (Jewel, usury sermon) — directly compared against the
  confirmed-PD Parker Society edition (Works of John Jewel, ed. Ayre, 1847-50) and confirmed NOT a
  verbatim match — systematically modernized wording throughout. Given the Gross precedent found
  today, likely another unidentified modernizer's copyrighted edition, but not pinned down.

Net effect: held-back count drops from 13 to 8 (5 genuinely unresolved + 3 now confirmed-copyright
awaiting Keith moving the files). All 12 corresponding Notion pages updated with the specific
finding for each.

---

## 2026-07-13 (later still) — Fifth Drive batch

Fifth batch of the day, "keep going please." Picked 7 `Text available` items (skipping `Needs
investigation` and multi-file folders as usual). This batch had an unusually high hold rate —
5 of 7 held back — worth flagging as a pattern rather than a fluke.

**Staged and imported (2):**
- *The Practice of Prelates* (Tyndale) — original English composition, no translation risk.
  Archaic spelling and OCR-scan artifacts ("looKing", "maKing") confirm a genuine Parker Society
  1848 scan rather than a modern paraphrase.
- *A Confession of the Catholic Faith* (Pope Damasus I) — NPNF Second Series Vol. 3 appendix to
  Theodoret, confirmed via trailing attribution line in the extracted text.

**Held back (5) — three distinct new risk patterns worth remembering for future batches:**

1. *Temporal Authority* and *On War Against the Turk* (both Luther) — register (smooth modern
   prose, casual asides like "the sophists in the universities have also been perplexed") closely
   matches the copyrighted **Luther's Works, American Edition** (Fortress Press/Concordia,
   1955–1986) — the same edition already caught once on 2026-07-12. This is now a confirmed
   recurring trap specific to Luther prospects sourced from this Drive folder: assume LW American
   Edition and verify against it before staging any further Luther text, rather than treating
   modern-sounding Luther prose as innocent until proven otherwise.
2. *Commentary on the Nicene Creed* (Theodore of Mopsuestia) — **new failure mode**: the extracted
   text carried an explicit colophon (translated by A. Mingana, Woodbrooke Studies Vol. 5,
   published 1932; Mingana died 1937) that flunks HARD CONSTRAINT 3's translator-death-year
   threshold outright, even though the author himself (d. 428) is safely ancient. A colophon
   confirming a translation is not automatically a green light — read the date and translator's
   death year, not just the presence of a citation.
3. *On the Sword* (Hubmaier) and *Homily on the Passover* (Melito of Sardis) — no source colophon
   in either extracted text, and the only well-known modern English translations of both works
   (Pipkin & Yoder's Anabaptism volume, 1989; Hall's Oxford Melito edition, 1979/2012) are under
   copyright. Held on absence of a confirmable PD source rather than a positive red flag.

All 2 cleared texts imported via `pipeline-import.mjs`, confirmed in Supabase as `published: false`
with draft author stubs (Tyndale, Pope Damasus I — neither previously in the database). Notion:
both set to `In progress`; all 5 held texts set to `Rights unclear`, `Complexity: 3`, with
edition-specific reasoning in Editorial notes.

Held-back count is now 13 across five sessions. Given the growing pile and the two new recurring
failure patterns identified today (Luther/LW-American-Edition, translated-but-post-1928 colophons),
the dedicated translation/edition-resolution research pass flagged as an open thread since
2026-07-12 is becoming more worth prioritizing rather than deferring further.

---

## 2026-07-13 (later still) — Fourth Drive batch

Fourth batch of the day following "yes please" — first run to fully exercise the newly-documented
"Next Drive batch" shorthand end to end.

Extracted 6 candidates: John Jewel's *Commentary on 1 Thessalonians 4:6* (a sermon on usury),
Irenaeus's *Fragments from the Lost Writings*, Cyprian's *Epistle 67*, Origen's *Commentary on the
Gospel of Matthew, Book XI*, the anonymous *Theologica Germanica*, and Zwingli's *A Short and Clear
Exposition of the Christian Faith*.

Four of the five patristic/Reformation texts carried an explicit "About this page" / colophon
source line in the extracted text itself — a first for this session's batches — which made
translation-provenance verification fast and unambiguous:
- *Fragments from the Lost Writings of Irenaeus* — ANF Vol. I (Schaff et al.)
- *Epistle 67* (Cyprian) — ANF Vol. 5 (Robert Ernest Wallis)
- *Commentary on the Gospel of Matthew, Book XI* (Origen) — ANF Vol. 9 (John Patrick)
- *Theologica Germanica* — explicitly self-declared "This electronic text is in the public domain,"
  with a colophon identifying the 1893 Golden Treasury Series edition (Susanna Winkworth's
  translation, d. 1878) as the scan source

*A Short and Clear Exposition of the Christian Faith* (Zwingli) had no colophon but the formal
register and biblical-citation style were consistent with a standard early-20th-century scholarly
English edition of Zwingli's Latin works; staged on author death year (1531) alone, which clears
copyright regardless of the specific translation's date.

**Held back** — *Commentary on 1 Thessalonians 4:6* (Jewel): Jewel wrote in English, so the
original sermon's copyright was never in question, but this particular text is rendered in
noticeably modernized prose (e.g. "naive and inexperienced") unlike the Parker Society register
seen elsewhere in his corpus this session, and carries no source-edition colophon. Can't rule out
a recent copyrighted modernization. Same caution as the Katherine Parr and William Thorpe holds.
Flagged `Rights unclear` in Notion, not added to the local queue.

All 5 cleared texts built, staged, and imported via `pipeline-import.mjs` — confirmed in Supabase
as `published: false`. Origen, the anonymous Theologica Germanica author, and Zwingli were created
as draft author stubs; Irenaeus of Lyons (already a draft stub) and Cyprian of Carthage (already
non-draft) were reused. Genre note: Irenaeus's fragments don't fit any single controlled-vocabulary
genre cleanly (they're excerpts, not a unified work) — used `Essay` as the closest available fit.

Held-back count is now 8 across four sessions.

Notion: all 5 imported texts set to `In progress` with import notes; Jewel's sermon set to
`Rights unclear`, `Complexity: 3`.

---

## 2026-07-13 (later same day) — Third Drive batch

Kept going per "keep going please" — third batch of the day, same discipline as the first two.

**Held back** — *The Examination of William Thorpe*: found a modern scholarly footnote embedded
directly in the body (a parenthetical explaining the Longinus legend, citing *The Golden Legend*)
— clear evidence of recent editorial annotation on top of the 1407 original, not a period or
antiquarian transcription. Same caution as the Katherine Parr case; flagged `Rights unclear`.

**Processed end-to-end** (extracted, cleaned, themed, note-drafted, staged, imported as
`published: false`, verified in the database):
- *Family Duty* (John Bunyan) — practical household-religion instruction, a different register
  entirely from his famous allegorical writing.
- *A Fruitful Dialogue Between Custom and Verity* (Edmund Grindal) — a future Archbishop of
  Canterbury staging the eucharistic controversy as a two-character dialogue. Parker Society 1843
  edition, confirmed safe.
- *A Short Treatise on Political Power* (John Ponet) — an early and influential English argument
  for the right to resist a tyrannical ruler, written in exile after the failed Wyatt rebellion.
- *On Frequent Communicating* (John Erskine) — real find: the source file's first line was a
  literal Archive.org OCR URL, confirming a genuine public-domain scan rather than requiring any
  guesswork about edition provenance. Stripped the stray URL from the reading body before staging.
- *Catechetical Oration* (Gregory of Nyssa) — a rare complete window into how the fourth-century
  church trained its own catechists. Standard NPNF II:5 translation, confirmed safe.

**Open threads for next time:**
- 5 more draft author stubs created (Bunyan, Grindal, Ponet, Erskine, Gregory of Nyssa) — bios +
  promotion via the author edit form, eventually.
- Held-back count is now 7 across three sessions (Tyndale ×2 titles, Luther ×2 titles, Prudentius,
  Katherine Parr, William Thorpe) — worth a dedicated research pass to resolve these rather than
  letting them accumulate indefinitely.
- Continuing top-down by Score; noticing translated (non-English-original) texts are the
  consistent source of every hold so far — worth treating any further non-English-original work
  with default suspicion until its specific edition is confirmed.

---

## 2026-07-13 — Second Drive batch + locked in "next Drive batch" shorthand

Continued working top-down by Score through the Drive-sourced Content Prospect List candidates.
Picked 6, held 3 back on translation-provenance grounds (same discipline as 2026-07-12, not
loosened just because the process is now familiar):

**Held back** — *Obedience of a Christian Man* (Tyndale): ambiguous whether this modern-spelling
edition is an old safe modernization or a recent copyrighted one (e.g. Penguin Classics-style).
*The Babylonian Captivity of the Church* (Luther): same fluent-modern-prose signature as the
plague letter caught yesterday — could be the safe 1915 Philadelphia Edition or the copyrighted
modern *Luther's Works*. *The Battle for the Soul of Man / Psychomachia* (Prudentius): reads as a
modern literary translation; Prudentius isn't in the standard ANF/NPNF sets so there's no obvious
safe fallback to check against. All three flagged `Rights unclear` with specific reasoning.

**Processed end-to-end** (extracted, cleaned, themed, note-drafted, staged, imported as
`published: false`, verified in the database):
- *On the Duties of the Clergy* (Ambrose of Milan) — modeled on Cicero's *De Officiis*, the first
  systematic Christian handbook on clerical conduct. Confirmed-safe NPNF II:10 translation.
- *Sermon on the Trinity* (Jonathan Swift) — yes, that Swift, preaching as Dean of St Patrick's.
- *Sermon 37: The Nature of Enthusiasm* and *Sermon 66: The Signs of the Times* (John Wesley).
- *The Nature of the Kingdom, or Church, of Christ* (Benjamin Hoadly) — the 1717 sermon that
  triggered the Bangorian Controversy and got Convocation suspended for over a century.

**Locked in the "next Drive batch" shorthand Keith asked for** — documented the full repeatable
procedure in CLAUDE.md (score-ordered selection, the translation-provenance check that's the actual
point of this whole exercise, clean/tag/stage/import/verify/log steps) so future sessions don't
need this re-explained — "next Drive batch" or "keep going on Drive" is now enough context.

**Open threads for next time:**
- 6 more draft author stubs created today (Swift, Hoadly; Ambrose and both Wesley sermons matched
  existing records) — need bios + promotion via the author edit form eventually.
- The 3 held-back texts from today plus 3 from 2026-07-12 (6 total) need their translation/edition
  provenance resolved — a distinct research task, not blocking further batches.
- Continuing top-down by Score next time; folder-collections (multi-file works) still deferred to
  their own batch given the extra per-item effort.

---

## 2026-07-12 (night) — New Whitchurch Press outreach + pipeline-import.mjs bugfix

**Catalogued 12 texts from New Whitchurch Press** (newwhitchurch.press) — a kindred not-for-profit
project run by Ollie Lansdowne, modernizing English Reformation texts (Cranmer, Ridley, Jewel,
Ussher, Jane Grey, Katherine Parr, and others) with a mission statement that reads like it could
have been written for Stromata. Confirmed this is the exact source of the Katherine Parr text
flagged yesterday (identical opening, exact URL match from the stray artifact in the docx). All 12
logged to the Content Prospect List at `Rights unclear` — the underlying works are all safely
public domain (authors dead 1548–1656), but the modernization layer is Ollie's, and the site's
"share and print" language is informal rather than a formal license for wholesale republishing
under a different name. Drafted an outreach email; Keith found a contact form on the site and sent
it directly. Two items need follow-up before anything else: *Concerning Plague* (multi-author
anthology, individual death-years unconfirmed) and *The Way of Peace Amongst All Protestants*
(credited to Ridley — d. 1555 — on an 1688 work, attribution needs checking before Stage 1 can
even run).

**Fixed the `pipeline-import.mjs` bug** logged earlier today. `importTextFile()` now returns a
`reason` (`already_exists` / `missing_fields` / `genre_not_found` / `insert_failed`) instead of a
bare `skipped: true`, and `main()` only marks a prospect `imported` if something actually landed in
the database or every skip was the benign already-exists case — a real failure now correctly leaves
status at `staged` for automatic retry, with the error recorded in `stage_1_notes`, instead of
silently claiming success. Verified against a live reproduction of the original trigger (the same
invalid `ocr_quality` value that caused today's earlier false-success) — confirmed the fix holds,
then removed the test prospect, test output file, and the draft author stub it created.

---

## 2026-07-12 (evening) — Proved out browser-based CCEL extraction

Keith asked whether prospects sourced from New Advent or CCEL could be handled by navigating there
directly in the browser, extracting the text, and running it through the same pipeline as the Drive
files. Tested both live rather than assuming:

- **New Advent** — no, browser doesn't help. Navigated straight to a `/fathers/` URL and it
  silently redirected to the homepage, identical to what the automated fetch already reported.
  Confirmed this is server-side broken, not a fetch-method limitation — a real browser hits the
  exact same wall. The existing CLAUDE.md guidance (fall back to Archive.org OCR) is the actual fix.
- **CCEL** — yes, genuinely. Landed on a real, correctly-rendered page, not a broken redirect.
  CCEL just can't be `curl`'d because the actual reading text sits behind a "Read Online"
  click-through rather than being present in the static HTML — exactly the JS-rendering problem
  CLAUDE.md already flagged, and exactly what a real browser is built to get past.

**Proved it end-to-end**, not just in principle: picked *Centuries of Meditations* (Thomas
Traherne) from the Content Prospect List (CCEL reference URL already on file), navigated in,
clicked through to the actual reading page, extracted the full ~105k-character text of "The First
Century" (part 1 of 5), cleaned it, themed it, wrote a note_draft, and staged + imported it to
Supabase as `published: false` — same pipeline, same rigor as the Drive-file batches today, just a
different extraction step. Verified directly in the database afterward, as always.

Documented this as a standing capability in CLAUDE.md's "Notes on Sources" section (`ccel_browser`)
so a future session doesn't have to re-discover or re-prove it — alongside a now-more-precise New
Advent note confirming the `/fathers/` breakage is server-side and browser navigation won't fix it.

**Open threads for next time:**
- Only Part 1 of 5 of *Centuries of Meditations* is done — Centuries 2–5 are a real follow-up task,
  not attempted today given the size (each "Century" is ~100 meditations).
- A few bare CCEL pagination-artifact digits remain in the extracted body text (flagged in
  provenance_notes) — deliberately left rather than risk mis-stripping an actual meditation-number
  marker, since both look identical out of context. Worth a light copyedit pass before publishing.
- This capability is proven for CCEL specifically — worth checking whether other Content Prospect
  List items sourced from other JS-rendered sites would benefit from the same approach.

---

## 2026-07-12 (later still) — Scored the catalogue, processed the top 7

Scored all 92 real candidates from the Drive catalogue (Value/Complexity/Effort, 1–3 each) and
added a Reference URL (the shared Drive folder link) to every entry so they're findable without a
direct file link, which isn't available from a locally-synced folder. Most scored Complexity 1 —
confirms Keith's instinct that this batch is a low-effort win relative to the standard OCR pipeline
— but ~15 items pulled Complexity up: unconfirmed authorship, formatting artifacts, or (new
category, see below) translation-provenance risk.

Asked to process the 7 highest-value/lowest-effort candidates. Reading them in full surfaced
something the scoring pass couldn't catch: **3 of the 7 are not what they first appeared.**

**On Cleaving to God** (Albert the Great) and **The Lamentation of a Sinner** (Katherine Parr) read
in fluent modern prose, not period-translation register — the first has no confirmable public-
domain source translation, the second is modernized-spelling with a stray embedded URL
(`newwhitchurch.press/parr/lamentation`) pointing at what looks like a specific modern small-press
edition. **Whether One May Flee From a Deadly Plague** (Luther) is the sharpest catch: the prose
matches the modern *Luther's Works* American Edition (Fortress Press/Concordia, Vol. 43, translator
Carl J. Schindler) almost exactly — an actively-sold, actively-copyrighted 20th-century critical
edition, not a 19th-century public domain one. All three held back, Notion status set to `Rights
unclear`, reasoning recorded so nobody re-discovers and re-researches them from scratch.

**The other 4 checked out and were processed end-to-end** — extraction, theming, note-drafting,
Stage 5a import to Supabase as `published: false`:
- *A Sermon of Good Works Annexed unto Faith* (Thomas Cranmer) — Book of Homilies, Parker Society
  1846 edition. Fixed one OCR-artifact corruption in passing ("No|nod faith" → "lively faith").
- *Homily 24 on First Corinthians* (John Chrysostom) — standard NPNF I:12, author already existed
  in the DB, no draft stub needed.
- *Salvation by Faith* (John Wesley) — his Oxford sermon from weeks after Aldersgate, usually
  credited with launching the Evangelical Revival in England.
- *The Gunpowder Plot Sermon* (Lancelot Andrewes) — preached exactly one year after the 1605 plot.

**The general lesson, not just about these three:** a source being a clean typed file with a
confirmed pre-1900 author doesn't mean the translation is safe — original-language works (English
sermons by Cranmer/Wesley/Andrewes) carry no translation risk at all, but anything translated needs
its *specific edition* checked, not just its *original author's* death year. Worth keeping in mind
for the remaining ~85 catalogued candidates.

**Open threads for next time:**
- Resolve the 3 held-back texts: find a confirmed-PD translation/edition for Albert the Great and
  Luther's plague letter, and check the newwhitchurch.press licensing (or find a period-spelling
  edition) for Katherine Parr.
- 11 draft author stubs now exist across today's two batches (Tertullian resolved to the existing
  record; Chrysostom resolved to the existing record on the second batch too) — need bios and
  promotion via the author edit form when reviewing drafts.
- ~85 remaining catalogued candidates still unscored-into-production — today processed the top 7
  by score as a first real batch, not the whole list.

---

## 2026-07-12 (later same day) — Google Drive backlog: catalogue, then a real batch

Keith downloaded the full `_READY TO PUBLISH` Google Drive folder locally before heading away for
two weeks. Rather than build unattended automation against an unreliable READY/DONE naming
convention (see the earlier entry today), agreed a staged approach: catalogue everything, then
actually process the highest-confidence single-file candidates through the real pipeline so there's
something concrete waiting in `/admin/drafts` on return, not just a spreadsheet.

**Catalogued all 99 items** into the Notion Content Prospect List — 3 confirmed duplicates already
live (folder naming turned out to be meaningless: a file marked "READY" was actually a duplicate,
several marked "DONE" don't exist in the current DB at all — the DONE/READY split predates the
current Supabase-backed site by 5-6 years per Keith), 7 flat-out copyright violations logged and
excluded (C.S. Lewis ×3, Bonhoeffer, Illich, Peter Toon, likely T.S. Eliot — all clearly 20th-century,
none public domain), 1 borderline case flagged for verification, ~88 genuine new candidates.

**Actually processed 6 of them end-to-end** — extraction (validated: Python stdlib `zipfile` +
`xml.etree` against `word/document.xml`, no new dependencies), theme/genre tagging, note-drafting,
and a real Stage 5a import to Supabase as `published: false`:
- *Prescription Against Heretics* (Tertullian)
- *The Demonstration of the Apostolic Preaching* (Irenaeus of Lyons)
- *Octavius* (Marcus Minucius Felix)
- *Address to the Greeks* (Tatian)
- *Commonitory* (Vincent of Lérins)
- *Dialogue with Trypho* (Justin Martyr) — the largest at ~69k words, and resolves a prospect that
  had been sitting `pending` in the queue with no source file

Dropped two other strong candidates from today's batch on inspection rather than force them
through: *Against Adimantus the Manichaean* reads as a rough machine translation from French
(the same sentence repeats itself, garbled, three times in the first paragraph) — needs real
cleanup, not just staging. *Homily on the Passover* (Melito of Sardis) is a genuine trap the
READY/DONE-era archive doesn't flag: unlike the other five, this homily wasn't rediscovered until
the 20th century, so there's no guaranteed-safe 19th-century public-domain translation the way
there is for Tertullian/Irenaeus/Minucius Felix/Tatian/Vincent/Justin. Held back pending translator
verification rather than assumed clear.

**Found a real bug in `pipeline-import.mjs`, live-caught, live-fixed for this run:** a DB check
constraint (`ocr_quality` only accepts `high`/`medium`/`low`, not free text) rejected all 6 inserts
on the first attempt — but the script's error handling doesn't distinguish "insert failed" from
"already imported, skip," so it silently marked the queue entries `imported` with zero actual rows
written. Caught only by a manual DB spot-check immediately after running. Fixed the immediate
trigger (output files now use `ocr_quality: "high"` — accurate anyway, these are clean typed
sources, not OCR scans) and reset the queue status to retry, which then succeeded cleanly. The
underlying silent-failure bug in the script itself is still live and logged to the backlog —
[pipeline-import.mjs silently marks failed imports as "imported"](https://app.notion.com/p/39bd9194805d8133b60bcb7a79a94668).

Also logged: [Google Drive folder ingestion automation](https://app.notion.com/p/39bd9194805d8192b8a0dbab80aa5ab1)
backlog entry updated in place with everything learned today rather than left at "open question."

**Open threads for next time:**
- Six draft author stubs now exist (Tertullian resolved to the existing record; Irenaeus of Lyons,
  Marcus Minucius Felix, Tatian, Vincent of Lérins, and Justin Martyr were created as new
  `draft: true` stubs) — need bios and promotion out of draft via the author edit form.
- Two older, separate "Dialogue with Trypho" and "Address to the Greeks" entries already existed
  in the Content Prospect List from 2026-05-12, logged before this session found real source files
  for both. Likely duplicates of today's entries — reconcile when back.
- ~82 remaining catalogued candidates still at `Text available`/`Needs investigation` — today only
  processed the 6 highest-confidence single-file ones as a proof of the approach.
- The `pipeline-import.mjs` silent-failure bug (above) should get a real fix, not just today's
  workaround, before the next full pipeline run.

---

## 2026-07-12

Full UX review of the live site (thestromata.com), navigating to texts via every path — search,
theme, author, collection — and across short/long texts, plus a mobile pass at 375px. Produced a
14-item findings list ranked by impact, then worked through the high-confidence fixes live against
a local dev server (screenshots + `get_page_text` checks, not just code review).

**Shipped:**
- Summary truncation now cuts at the last whole word instead of mid-word (`app/page.tsx`,
  `truncateAtWord`).
- Mobile breadcrumb on text pages no longer collides — author/location and collection title
  were butting together with zero space on narrow viewports (`app/texts/[slug]/page.tsx`).
- Collection numbered lists start at 1 again when the first item is unpublished, instead of
  showing the raw (gapped) `collection_order` (`app/collections/[slug]/page.tsx`).
- Theme pages sort Roman-numeralled titles numerically within a shared prefix (Catechetical
  Lecture I, II, III…IX, X…) instead of alphabetically (`app/themes/[slug]/page.tsx`,
  `sortByTitleWithRomanNumerals`).
- Kindred Authors query now excludes `draft: true` authors as a safeguard (`app/authors/[slug]/page.tsx`)
  — didn't fix the actual "Unknown (Early Church)" case (see below), but closes a real gap.
- Mobile hamburger nav added — there was previously no way to navigate on a 375px viewport short
  of scrolling to the footer (`app/components/MobileNav.tsx`, wired into `SiteHeader.tsx`).
- Tradition/era breadcrumb items on text pages are real links now (`/traditions/[slug]`,
  `/eras/[slug]`), matching the author page — they were styled as links but weren't, a genuine
  oversight rather than a design choice.
- Theme pages roll multi-chapter collections up into a single row ("19 of 24 books") with the
  matching chapters listed and individually clickable underneath, instead of flooding the theme
  list with every chapter as its own row (`app/themes/[slug]/page.tsx`). Deliberately **not**
  applied to `/search` — Keith's call: search is higher-intent, so it should keep surfacing every
  individual text rather than collapsing collections.
- Author index (`/authors`) now shows a text count under the tradition badge for each author.

**Retracted (false positives):** two findings from the initial review — "Enter doesn't submit
search" and "double space in search page title" — turned out to be artifacts of the sandboxed
preview browser's synthetic keyboard dispatch, not real bugs. Caught by re-testing with real
Chrome (`claude-in-chrome`) before touching any code. Lesson: don't trust a single browser
automation surface for anything keyboard-event-shaped; cross-check before fixing.

**Discussed, not built — logged to the Feature Backlog instead:**
- "Unknown (Early Church)" and similar placeholder authors leak into Kindred Authors. Not a
  draft-stub problem (they're `draft: false`, real slugs) — it's a data-modeling gap: `authors`
  conflates "a named person" with "an authorship placeholder for anonymous work." Needs an
  explicit flag, not a name-pattern filter. → [Feature Backlog: Author placeholder / stub records
  shouldn't surface as real people](https://app.notion.com/p/39bd9194805d81e5923afaf896caa1ef)
- Roman-numeral sort's prefix-matching approach doesn't handle compound titles like "Catechetical
  Lecture XIX : Mystagogic Catechesis I" (different prefix than the plain series) — falls back to
  alphabetical for those 3 of 114 texts. → [Feature Backlog: Roman-numeral title sort — compound/
  nested title edge case](https://app.notion.com/p/39bd9194805d811ea3b9fde3dc350310)
- Appended an overdue-flag to the existing [Index filtering — /texts and /authors](https://app.notion.com/p/350d9194805d819db153f7a56f8f44f3)
  backlog item — it was logged months ago with "implement before hitting 50 texts"; the library
  is now at 114.

**Open threads for next time:**
- No filtering/sorting on `/texts` or `/authors` — tracked in the backlog item above, not started.
- No text counts on author cards was fixed on `/authors`; the homepage's curated `FeaturedAuthors`
  band was deliberately left alone (decorative arch display, not the flagged list).
- Date-format convention on author cards confirmed as-is: `birth–death`, falling back to `d. death`,
  falling back to nothing shown at all when neither year is known. Deliberately no "unknown"
  placeholder text — a low-stakes list, an absence doesn't need flagging.
- Inconsistent death-year/date formats across text cards more broadly — flagged, not yet
  scheduled; Keith wants a distinct pass on this later.

**Later same day — Discovery backlog triage + 3-agent review.**

Keith asked which `Growth Driver: Discovery` items in the Feature Backlog were high-confidence,
overwhelmingly-backend hand-off candidates. Shortlisted two — Church Calendar & Liturgical Season
Feature, and Subject layer (`/subjects/[slug]` + TF-IDF tagging) — then spawned three agents (UX
lens, technical architecture lens, devil's advocate) to pressure-test the shortlist before
building anything.

**The shortlist didn't survive.** All three agents converged independently on the same problem:
both items bury a real founder-time dependency (season editorial prose; ~30-50 hand-written
subject descriptions the spec itself calls "non-optional for the SEO thesis") behind what looks
like a backend build — so "hand this off" would relocate the bottleneck to after the build, not
remove it. The devil's-advocate agent also caught that Church Calendar's own MVP Validation step
(hardcoded widget, 4-week Umami check, before any DB build) had never actually been run — the
homepage panel *looking* finished (hardcoded "Trinitytide" content, real prose) was mistaken for
the validation having passed, when it's just the shell existing.

**Shipped instead — the cheap validation itself:**
- Fixed `app/components/ChurchYearRow.tsx`'s season label from "Ordinary time" to "Trinitytide" —
  the former is Roman Catholic post-Vatican II terminology, inconsistent with the project's stated
  BCP 1662 register (and with `SeasonalPanel.tsx`'s own already-written prose, which never used
  "Ordinary time").
- Gave `SeasonalPanel.tsx`'s `CURRENT_SEASON.pick` a real value — *A Short Rule of Life* (John
  Wycliffe), chosen by querying Supabase for standalone (non-collection) texts themed around
  vocation/obedience/work/virtue, matching the season note's own "daily practice of virtue" framing.
- No DB tables, no `/seasons/[slug]` route — deliberately just the hardcoded single-season test
  the original spec called for. Now live through to Advent (Trinitytide is the longest season of
  the year), tracked via the existing `text-open` / `from=seasonal-panel` Umami event — no new
  event needed.

**Logged to Notion, not built:**
- Founder note appended to [Capacity relief check](https://app.notion.com/p/38fd9194805d812f89f5d49bd67f4553)
  and [Content pipeline automation](https://app.notion.com/p/38fd9194805d8150a53cd27aa309d75b):
  Keith flagged that OCR cleanup specifically (not sourcing/tagging/note-drafting) is still the
  dominant time cost, and that a backlog of already-formatted texts sitting in his Google Drive
  would be faster to process than fresh OCR sources right now.
- New backlog entry: [Google Drive folder ingestion automation for pre-formatted
  texts](https://app.notion.com/p/39bd9194805d8192b8a0dbab80aa5ab1) — targets that specific
  friction directly, reusing `pipeline-import.mjs` and `lib/note-prompt.mjs` unchanged, skipping
  the OCR-cleanup stage entirely since the source is already clean.

**Also:** added a "Notion access" note to the top of `CLAUDE.md` — `notion-query-database-view`
and SQL-mode `notion-query-data-sources` are plan-gated (Business plan) on this workspace and will
just 400. `notion-search` + `notion-fetch` per page is the reliable path; stop retrying the gated
tools with different parameters, they fail on plan, not query shape. Also learned the hard way
that subagents spawned via the `Agent` tool don't inherit the main session's Notion MCP
authorization — the first devil's-advocate agent attempt failed outright on this. Fix was pasting
the needed page content directly into the retry prompt rather than relying on the subagent to
fetch it itself.

**Open threads for next time:**
- Watch Umami over the next ~4 weeks for `text-open` events with `from=seasonal-panel` — that's
  the actual validation data. Decide on the full Church Calendar build based on that, not before.
- Google Drive ingestion idea needs Keith to answer: what format are the Drive files in
  (determines whether it reuses `fetch-texts.mjs`'s cleaning step or needs a new lightweight
  parser) — flagged as an open question on the new backlog entry.
- Debate Readers (Impact 8, the highest Discovery-driver score on the board) was excluded from
  the original shortlist for being editorial-heavy — the devil's-advocate agent's read is that
  exclusion is directionally reasonable but was reached via a filter that wasn't applied
  consistently against Subject layer, which turned out to have comparable editorial debt. Worth
  a second look.

---

*Earlier history: see `git log` and the Notion "The Stromata: Growth Tracker" workspace — this
file starts fresh from today.*
