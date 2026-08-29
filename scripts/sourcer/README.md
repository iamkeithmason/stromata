# Sourcer — acquire & stage cleared prospects (v0)

The Sourcer is the next agent after the [Scout](../scout/README.md). Where the
Scout *proposes* entries onto the Notion Content Prospect List, the Sourcer takes
a prospect the editor has **cleared**, acquires the exact edition the editor
**pinned**, runs deterministic cleanup, **detects (but does not fix)** the risky
OCR problems, and stages a **reviewable draft bundle**. Then it stops.

> The Sourcer is the mechanical half of "AI proposes, editor approves." It never
> chooses a source, never clears copyright, never applies a probabilistic
> correction, and never touches the live site or database. Its only writes are
> files under `content/staging/` and (in CI) a **draft** PR.

## Run it

```bash
# dry-run is the default — resolve the cleared intake, run the entry gate,
# print the plan + full discriminated skip log; fetch NOTHING, write NOTHING
npm run sourcer

# process the gated batch: fetch → clean → detect → stage
npm run sourcer:apply -- --max 3

# unit-test the gate + enforcement hook (no API key / network needed)
npm run test:sourcer
```

Flags: `--dry-run` (default) · `--apply` · `--max N` (default **3** — sourcing is
heavy) · `--set-notion-status` (bump each staged prospect to `In progress`; off
by default).

Required env (see `.env.example`): `ANTHROPIC_API_KEY` (apply only), `NOTION_TOKEN`,
and a **read-only** Supabase URL/key (`SOURCER_SUPABASE_URL` / `SOURCER_SUPABASE_KEY`).
Model: `claude-sonnet-5` (`SOURCER_MODEL` to override) for the metadata /
collection-structure / detection reasoning; the deterministic cleanup is plain
script — no model.

## Prerequisite — two human-owned fields on the Content Prospect List

The entry gate is machine-checkable and human-set. The list needs two properties,
set by a human and only a human:

- **`Cleared edition URL`** (url) — the exact source the editor pinned (part 1).
- **`Rights cleared`** (checkbox) — set true once author copyright *and*
  translation provenance have both been verified.
- **`Additional edition URLs`** (text, optional) — extra ordered parts of the
  *same* pinned edition when a work is split across several allowlisted pages,
  one URL per line. See "Multi-part works" below.

`Translation notes` stays where the editor records the *basis* (translator,
edition year, publication year, why it is public domain). The Sourcer copies that
basis **verbatim** into the draft; it never interprets it. If either property is
missing from the live schema, `reconcile()` warns and the gate refuses every
prospect (`no-cleared-edition` / `rights-not-cleared`).

## The entry gate (the centre of the design)

Before any fetch, every candidate prospect must clear **all** of these. Any
failure is a discriminated refusal, logged, with no side effect:

| Check | Refusal reason |
|---|---|
| `Rights cleared` is true | `rights-not-cleared` |
| `Cleared edition URL` present and on the source allowlist | `no-cleared-edition` / `source-not-allowlisted` |
| `Translation notes` carries a non-empty provenance basis | `no-provenance-basis` |
| Author exists in Supabase and death year is pre-1900 | `author-copyright-fail` / `author-missing` |
| Not already in the corpus | `already-present` |
| Not already staged | `already-staged` |
| Under the `--max` cap | `over-cap` |

`author-missing` does **not** abort the text — it stages the draft but flags it so
the editor creates the author record before import. The Sourcer never invents an
author.

**Source allowlist:** `archive.org`, `anglicanhistory.org`, `sacred-texts.com`,
`en.wikisource.org` (the `wikisource.org` suffix), `newadvent.org`. Anything else →
`source-not-allowlisted`. CCEL renders dynamically, so CCEL texts are taken via
their Archive.org `djvu.txt` mirror, not a live scrape.

The candidate intake is every row the editor has *begun* clearing (`Rights
cleared` checked **or** a `Cleared edition URL` present). Rows the editor hasn't
touched are ignored entirely.

## The copyright boundary, by construction

The one principle behind the whole design: the copyright decision is removed from
the loop not by asking the agent to be careful, but by making it **structurally
unable to choose a source**.

- `fetch_pinned_source` takes a prospect id, resolves the URL **server-side** from
  the editor's `Cleared edition URL` (`contract.resolveAllowlistedFetchUrl`), and
  fetches only that. The agent cannot pass or substitute a URL — a `url` field in
  the tool input is ignored, and the hook denies the fetch outright if the pinned
  host is off the allowlist.
- Archive.org scans are pulled as `_djvu.txt`. The untouched response is written to
  `raw.txt` and **never edited again**; a re-run that finds an existing `raw.txt`
  is a no-op.

## Multi-part works (collections split across pages)

A work with named or numbered internal divisions (e.g. the four books of John of
Damascus's *Exact Exposition*) is recovered by pinning a source that contains the
whole work:

- **Preferred — one whole-work URL.** Pin the Archive.org `djvu.txt` of the whole
  volume (the public-domain mirror of the CCEL/NPNF text). One fetch captures
  every book. This is why large patristic works are easier via Archive than via
  New Advent's per-book pages or a live CCEL scrape.
- **When no single URL holds the whole work** — the parts live on separate
  allowlisted pages — list the extra parts in `Additional edition URLs` (one per
  line). All parts (primary + additional) are validated against the allowlist
  (**all-or-nothing** — one off-allowlist part refuses the whole prospect),
  fetched **in order** with a rate-limit between them, and concatenated into the
  one immutable `raw.txt` with a `<!-- SOURCER PART n/N · url -->` marker per
  part. `provenance.yml` records every fetched part.

This preserves the copyright boundary: *every* URL is still human-pinned and
allow-listed — the Sourcer concatenates, it never discovers or follows links to
find the rest of a work. The raw stays whole; the actual split into a
`collections` row + ordered chapters happens downstream (`split-into-chapters.mjs`
+ `pipeline-import.mjs`), guided by the collection-structure proposal in
`metadata.yml`.

> CCEL and New Advent are **not** lost: CCEL renders dynamically so it is taken
> via its Archive.org `djvu.txt` mirror, and New Advent's `/fathers/` URLs are
> broken upstream (June 2026) so those works also route through Archive. Both are
> the project's pre-existing standard, not a new Sourcer restriction.

## Detect, do not correct (the separation principle)

Deterministic, unattended-grade transforms are **applied** (ligature failures,
doubled apostrophes, soft-hyphen scrub, footnote-marker removal via
`footnote-strip.mjs`, Google-Docs block repair + verse flagging via
`normalise-markdown.mjs`). These are the only changes written into `body.md`.

Everything probabilistic is **detected and reported, never changed**, in a tiered,
editor-editable `ocr-report.md`:

1. character-substitution scannos (corpus-frequency, via `detect-scannos.mjs`) —
   formatted to feed the existing `detect-scannos --apply-reviewed` round-trip so
   the editor accepts/rejects/edits per item;
2. orphaned footnote markers surviving the strip;
3. garbled polytonic Greek;
4. theologically-loaded near-homographs (e.g. ἀγένητος vs ἀγέννητος) — *alternatives*
   offered with the stakes noted, proposed, never applied.

## The staged bundle

Each prospect stages `content/staging/<slug>/`:

| File | What |
|---|---|
| `raw.txt` | the untouched fetch — immutable |
| `body.md` | deterministic clean only |
| `provenance.yml` | the clearance record, copied **verbatim** + a literal "not synthesised" stamp |
| `metadata.yml` | everything `proposed:` — genre, ≤6 theme slugs, OCR quality, collection-structure proposal (editor confirms) |
| `ocr-report.md` | detected-not-corrected findings, apply-reviewed compatible |
| `SOURCER.md` | human-readable bundle summary + next steps |

`metadata.yml` deliberately omits Tradition/Era — those are author-level and edited
on the prospect. The collection proposal follows the editorial rule (navigable
internal divisions → collection + ordered chapters; one sustained argument → one
text; a very long treatise → propose the most self-contained excerpts) and is a
proposal only — the raw stays whole.

## Sealed tool surface + enforcement hooks

The agent inherits nothing: `settingSources: []`, built-in tools disallowed, and
`allowedTools` limited to the five sourcer tools. The `PreToolUse` hook
(`hook.ts` — the contract lives here, not the prompt) is the single boundary:

- `fetch_pinned_source` — allowed only when the resolved host ∈ allowlist and a
  valid clearance record exists; the URL is never taken from the input.
- `run_pipeline_script` — a fixed action enum (`clean` | `detect`); any
  correction-apply, `pipeline-import`, or publish/DB-write action is denied.
- `stage_draft` / any write — blocked outside `content/staging/`.
- Global — anything other than the five tools (bash, filesystem, web, a Supabase
  write) is denied by the sealed surface.

`gateToolCall` (hook.ts) and `runGate` (gate.ts) are pure and unit-tested with no
SDK, network, or API key — see `*.test.ts`.

## Schedule

`.github/workflows/sourcer.yml` runs monthly (07:00 UTC on the 1st) with
`--apply --max 3`, plus `workflow_dispatch` (defaults to dry-run) and a
`pull_request` dry-run on Sourcer PRs. An `--apply` run opens a **draft** PR with
the staged bundle; the batch + skip log is posted to the Actions run summary.
Secrets: `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `SOURCER_SUPABASE_URL`,
`SOURCER_SUPABASE_KEY`.

## What the Sourcer never does (out of scope)

Any copyright or translation-rights *judgement* (the gate only checks a human made
it), source selection, correction-apply, `pipeline-import`, publishing, author
creation, subagents, or fetching anything off the allowlist or more than the one
pinned edition per prospect.
