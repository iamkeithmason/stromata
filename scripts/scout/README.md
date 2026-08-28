# Scout — corpus gap analysis agent (v0.1)

The Scout is a scheduled [Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript)
script that performs **corpus gap analysis** for The Stromata and proposes new
**Content Prospect List** entries in Notion for editorial review.

It is **read-only** against the corpus and Notion. Its only write is creating
provisional proposal rows, and only through a contract-enforcing `PreToolUse`
hook. It is a single agent — no subagents in v0.

> The Scout fills the desk; it does not publish. Every row lands as
> `Status = "Proposed — agent"`, explicitly provisional and unverified, awaiting
> Keith's confirmation. Nothing un-flagged ever reaches Notion, and the Scout
> never touches Supabase writes, the Feature Backlog, copyright clearance,
> sourcing, or OCR.

## Run it

```bash
# dry-run is the default — writes nothing, prints the batch + full skip log
npm run scout

# create the rows (up to the cap)
npm run scout:apply -- --max 10

# unit-test the enforcement gate (no API key / network needed)
npm run test:scout
```

Flags: `--dry-run` (default) · `--apply` · `--max N` (default 10).

Required env (see `.env.example`): `ANTHROPIC_API_KEY`, `NOTION_TOKEN`,
`SCOUT_SUPABASE_URL` + `SCOUT_SUPABASE_KEY`.

> **Supabase key:** use the **service_role** key. RLS blocks the anon key from
> reading `authors`/`texts`, so with anon the coverage map comes back empty
> (the script warns when it sees this) and gap analysis runs blind. The code
> only ever `SELECT`s, so service_role stays read-only in practice; a dedicated
> read-only role that reads past RLS works too. The URL is the project API URL
> (`https://<ref>.supabase.co`). If the coverage map reads empty the run
> **aborts** (non-zero exit) rather than proposing blind — set
> `SCOUT_ALLOW_EMPTY_CORPUS=1` only for a genuinely empty day-one corpus.

## How it works

1. **Coverage map** (`corpus.ts`) — SELECT-only reads of `authors` + `texts`
   build published-text counts per tradition × era, plus the covered-authors and
   covered-works dedupe sets.
2. **Reconcile-first** (`notion.ts`) — the live Content Prospect List schema is
   fetched before writing.
3. **The agent** (`scout.ts`, Sonnet 5) is handed the coverage snapshot, the
   priority guidance, the controlled vocabulary, and the existing prospects, then
   proposes candidates best-first via a single tool, `propose_prospect`.
4. **Deterministic processing** (`scoring.ts` + `taxonomy.ts`) — for every
   proposal the code computes the Score, derives the Era from the author's dates,
   and validates/repairs the tradition. The agent's numbers are never trusted for
   anything a formula or the dates already settle.
5. **The contract hook** (`hook.ts` + `contract.ts`) gates every proposal:
   required fields, controlled values, provisional Status, the copyright gate,
   dedupe, threshold, and the per-run cap — each a discriminated, logged
   decision. No silent drops. In dry-run it records what *would* be written and
   denies the write.

### Scoring — Value / Complexity / Effort

The Content Prospect List scores on three integers (each **1–3**) with a
read-only Notion **Score** formula. The agent emits **only** those three
integers — nothing derived, no ICE:

- **Value** (higher is better): editorial priority × search gravity. Weight
  Tier-1 named authors, under-filled high-priority cells, and medieval works up.
- **Complexity** (higher is **worse** — a cost): copyright + source availability.
  1 = clean public-domain translation, easily sourced; 3 = rights unclear or only
  poor OCR. Copyright reasoning goes in `translationNotes`; there is no separate
  copyright-flag field.
- **Effort** (higher is **worse** — a cost): length + processing work.

**`Score = Value / (Complexity + Effort)`** is the single source of truth for
ranking and the below-threshold cut, ported faithfully from the Notion formula as
`computeScore` (`scoring.ts`) and pinned to real row values in `scoring.test.ts`.
It is a read-only formula — the Scout **never writes Score**.

### Era is derived; Tradition is guarded (`taxonomy.ts`)

- **Era** is fully determined by the author's death year (fallback floruit/birth),
  so the agent never proposes it. Missing dates → Era left blank + `needs-editorial`.
- **Tradition** the agent may propose, but code validates it against the death
  year. It **auto-reassigns** only among the three date-settled traditions (Early
  Church ≤325, Patristic 325–600, Byzantine 600–1054) — e.g. a Greek-East author
  mislabelled "Patristic" is corrected to Byzantine. Everything else (post-1054
  East/West, a Reformation confession, a boundary figure, or missing dates) is
  **flagged** `needs-editorial` with the field cleared, rather than guessed. The
  correction/flag is recorded in Editorial notes (`↻` / `⚑`) and the row still
  lands as `Proposed — agent`.

### Copyright gate

Propose only authors who died **before 1900** (or whose death year is genuinely
unknown); a death year ≥ 1900 is a `rights-excluded` skip. Translation copyright
is never auto-cleared — that stays a human gate, expressed as a high Complexity
score plus a `translationNotes` caveat, flagged against the known traps.

### Discriminated skip reasons

Every non-written candidate is logged with exactly one reason: `already-published`,
`already-proposed`, `rights-excluded`, `below-threshold`, `duplicate-in-batch`, or
`over-cap`. A malformed proposal (contract violation) is denied and **retried** by
the agent — counted separately, not as a dropped candidate.

### Idempotency

Dedupe runs against the corpus **and** the existing prospect list, so a second
`--apply` run proposes nothing new unless coverage or thresholds changed.

## The Notion write contract

Logical field → live property (reconciled 2026-08-28):

| Contract field | Notion home |
|---|---|
| Title ("Author — Work") | `Title` |
| Author | `Author` |
| Value / Complexity / Effort (1–3) | `Value` / `Complexity` / `Effort` |
| computed score | `Score` (read-only formula — **never written**) |
| Tradition | `Tradition` (valid option, or blank + `needs-editorial` flag) |
| Era (derived) | `Era` (valid option, or blank + `needs-editorial` flag) |
| Genre | `Genre` (when confident; else blank) |
| Status (provisional) | `Status = "Proposed — agent"` (auto-created option) |
| Candidate source | `Reference URL` |
| Copyright reasoning + provenance caveat | `Translation notes` |
| Rationale · Discovery · Generated-by · Dedupe key · `↻`/`⚑` markers | `Editorial notes` + page-body callout |

The hook blocks the write unless Title and Author are present, V/C/E are each
integers 1–3, Status is exactly `Proposed — agent`, Reference URL is valid,
Translation notes carries the caveat, **Score is absent from the payload**, and
Tradition/Era are each a valid option or blank-with-a-`needs-editorial`-flag.

## Sealed tool surface

The agent inherits nothing: `settingSources: []`, built-in tools disallowed, and
`allowedTools` limited to `mcp__scout__propose_prospect`. A catch-all hook denies
any other tool. No bash, no filesystem, no web, no Supabase/Notion write beyond
the one gated create.

## Schedule

`.github/workflows/scout.yml` runs fortnightly (06:00 UTC, 1st & 15th) with
`--apply --max 10`, plus `workflow_dispatch` (defaults to dry-run). The batch +
skip log is posted to the workflow run summary. Secrets:
`ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `SCOUT_SUPABASE_URL`, `SCOUT_SUPABASE_KEY`.

## Config hooks left for later

- `SEED_PRIORITIES` in `config.ts` — a Davenant-syllabus priority list. Empty in
  v0 by design; populate to weight matching candidates up. Nothing is scraped.
- Sourcing / fetching / OCR / copyright clearance are the Sourcer/Refiner's job,
  a later build. The Scout only triages.
