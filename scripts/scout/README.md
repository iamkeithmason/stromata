# Scout — corpus gap analysis agent (v0)

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
   fetched before writing. The DB scores on **Value / Complexity / Effort**
   (each 1–3) + a read-only **Score** formula, not Impact/Confidence/Ease, so the
   Scout computes ICE internally and *projects* it onto those native axes
   (`scoring.ts`). Agent rows then sort under the same Score formula as
   hand-entered rows.
3. **The agent** (`scout.ts`, Sonnet 5) is handed the coverage snapshot, the
   priority model, the controlled vocabulary, and the existing prospects, then
   proposes candidates best-first via a single tool, `propose_prospect`.
4. **The contract hook** (`hook.ts` + `contract.ts`) gates every proposal:
   required fields, controlled values, provisional Status, copyright triage,
   dedupe, threshold, and the per-run cap — each a discriminated, logged
   decision. No silent drops. In dry-run it records what *would* be written and
   denies the write.

### Scoring — ICE, author-anchored

The agent supplies `impact` / `confidence` / `ease` (1–5), `tier1`, and a
copyright flag. The **priority model** — tradition weight and the medieval bonus
(`config.ts`) — is applied in code, never left to the agent:

- **Impact → Value.** Highest for a recognisable Tier-1 search-driver filling an
  under-filled high-priority cell. Concept-only / tradition-only draws score low.
- **Confidence + copyright flag → Complexity.** A named pre-1900 work with a
  known digital home is low-complexity; a trap-adjacent modern edition is high.
- **Ease → Effort.** Length and processing burden; tangled translation lineage
  or heavy polytonic Greek lowers ease.

Only candidates with `ICE ≥ threshold` (config) and within the cap are written.

### Discriminated skip reasons

Every non-written candidate is logged with exactly one reason: `already-published`,
`already-proposed`, `copyright-excluded`, `below-threshold`, `duplicate-in-batch`,
`over-cap`, or `contract-violation`.

### Idempotency

Dedupe runs against the corpus **and** the existing prospect list, so a second
`--apply` run proposes nothing new unless coverage or thresholds changed.

## The Notion write contract

Logical field → live property (reconciled 2026-08-28):

| Contract field | Notion home |
|---|---|
| Title ("Author — Work") | `Title` |
| Author | `Author` |
| Tradition / Era / Genre | `Tradition` / `Era` / `Genre` (controlled selects) |
| Status (provisional) | `Status = "Proposed — agent"` (auto-created option) |
| Impact / Confidence / Ease | `Value` / `Complexity` / `Effort` (+ raw ICE in notes) |
| computed score | `Score` (formula, auto) |
| Rationale · Discovery note · Generated-by · Dedupe key · Provenance caveat | `Editorial notes` + page-body callout |
| Copyright flag + reason | `Translation notes` |
| Candidate source(s) | `Reference URL` (primary) + `Editorial notes` |

Fields with no dedicated property are folded into the notes / page body rather
than failing the run.

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
