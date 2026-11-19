---
description: Build the top Agent-ready backlog card end-to-end and open a draft PR for review
---

# /next-agent-card

Pick the highest-value **Agent-ready** card from the Feature Backlog, build it, and
hand back a **draft PR** for Keith to review and merge. Handle exactly **one** card
per invocation. Designed to be run on its own, or wrapped in `/loop` for cadence
(e.g. `/loop 30m /next-agent-card`).

This is the autonomous lane. It is bounded on purpose: it never merges, never
publishes, and stops for human review at the draft PR. If a card turns out to need
taste, auth, or third-party judgement, it is **not** Agent-ready — leave it, say why,
and move on.

## What "Agent-ready" means

A card is Agent-ready only if all three hold. These are the criteria encoded in the
Notion property's purpose:

1. **Verifiable without the admin login.** Provable by `tsc`, `next build`, `next lint`,
   unit tests, a Supabase query, or fetching a public route — NOT by loading `/admin`
   (Claude has no credentials for it; see CLAUDE.md).
2. **No taste / auth / third-party judgement.** No open-ended design work, nothing that
   needs user accounts you must design, nothing that edits an external site.
3. **Self-contained and low-ambiguity.** A clear definition of done from the card alone.

**The approval gate — read the `Agent` select property.** The Feature Backlog's `Agent`
property has two values: **`Pending approval`** = a candidate (identified by analytics or
an audit) that Keith has NOT yet approved — do **not** build these; and **`Agent-ready`**
= Keith has reviewed and approved it for the pipeline. This command builds **only**
`Agent = 'Agent-ready'` cards. New candidates are logged as `Pending approval` for Keith
to promote — never promote a card to `Agent-ready` yourself.

## Steps

0. **Reconcile the ledger first (close last week's loop).** Before starting new work,
   make the backlog reflect what actually shipped. List Feature Backlog cards at
   `Status = 'Planned'` that carry a linked PR in their body, and check each PR's state
   via `mcp__github__pull_request_read`:
   - **Merged, and on `release`** → set the card `Status` → `Built`. (This is the only place a
     routine sets `Built` — it does so *after* the change ships, never at PR time. It
     reconciles Keith's merge, it does not pre-empt his review.) `main` is where work lands
     and `release` is what is live (CLAUDE.md "Vercel usage"), so a PR merged into `main` is
     **not** `Built` yet: check that the PR's merge commit is reachable from `release`
     (`gh api repos/{owner}/{repo}/compare/release...{merge_sha}` reports `behind` or
     `identical` once it is). Confirm the merged PR added a CHANGELOG
     entry; if for some reason it didn't, add one now describing the shipped change.
   - **Merged into `main`, not yet on `release`** → leave it `Planned`; it ships in the next
     weekly promotion PR (`main` → `release`), which Keith merges.
   - **Closed unmerged** → leave `Status` as-is and add one line to the card body noting
     the PR was closed without merging.
   - **Still open** → leave it; it's in flight.
   Then continue to the new card below. This sweep is what keeps `Built` and the CHANGELOG
   current between runs without any merge-time webhook into Notion.

1. **Pull the queue.** Read the Feature Backlog's saved **Agent queue, approved** view
   with `notion-query-data-sources` in **view mode**, not SQL:

   ```json
   {"data": {"mode": "view", "view_url": "view://3d2d9194-805d-8188-9ddb-000c4cbc0eba", "page_size": 10}}
   ```

   The view carries the filter (`Agent = 'Agent-ready'`, not yet `Built`) and the sort
   (ICE, highest first), so the rows come back already ranked. View mode has no plan
   quota, so it does not spend the shared SQL budget that the Prospect List sync and
   `backlog-triage` draw on (CLAUDE.md's Notion note). Two things to know when reading it:

   - **`ICE Score` comes back as a `formulaResult://…` reference, not a number.** Trust
     the view's order; if you need the figure, compute `Impact × Confidence × Ease`.
   - **Rows arrive whole**, long `Notes` and `Outcome / Done when` included, so keep
     `page_size` small. The top few cards are all step 2 needs; follow `next_cursor`
     only if every one of them is already in flight.

   If view mode refuses, fall back to SQL against the data source
   (`collection://00686889-855b-424e-8af1-1fe31062648e`) with the same filter and
   `ORDER BY Impact*Confidence*Ease DESC`, and say in the run report that the view failed.

2. **Choose one card, and make sure nobody else is building it.** Take the highest-ICE
   card that is not already in flight. "In flight" is decided by evidence, not by the card's
   `Status` — `Planned` reads the same whether a build exists or not, and on 2 Nov 2026 two
   sessions built the same card because of it (#184 and #187;
   `docs/research/2026-11-02-claim-the-work-before-you-build.md`). For each candidate, all three:
   - **Search open PRs by the card's title**, not by branch prefix (hand-started sessions use
     `ccr-*` branches, not `claude/*`):
     `gh api -X GET search/issues -f q='repo:iamkeithmason/stromata is:pr is:open in:title,body "<two or three distinctive words from the card title>"'`
     and skim `mcp__github__list_pull_requests` (state open, sorted by updated) for the same
     words.
   - **Read the card body for a claim line** (`Building: …`, below) dated within the last
     three days, and the `Notes` property for a PR link.
   - **`git branch -r --sort=-committerdate | head -20`** for a branch pushed in the last
     few days whose latest commit message names the card.
   Any hit means skip the card and say which PR or claim you found. If nothing qualifies,
   report that and stop.

2a. **Claim the card before writing any code.** Append one line to the card *body* with
   `notion-update-page` → `insert_content`:
   `Building: <this session's URL> · <YYYY-MM-DD> · branch <branch name>`. Do this
   even though the PR, and the `Planned` status (step 11), come later: the claim is what a
   parallel session reads in step 2. If the run stops without a PR, replace the line with
   `Abandoned: <reason>` so the card is free again.

3. **Read it fully.** `notion-fetch` the card page and read `Summary`,
   `Implementation Suggestion`, `Stack Context`, and `Notes`. If, on reading, the card
   fails an Agent-ready test above, do NOT build it: post one line on the card body
   explaining why, set its `Agent` back to `Pending approval` for Keith to reconsider,
   and stop.

4. **Branch off latest main.**
   ```bash
   git fetch origin main && git checkout -B claude/<card-slug> origin/main
   ```

5. **Build it.** Match the surrounding code's idiom. Keep the change minimal — what the
   card's definition of done needs, nothing wider. Honor every **HARD CONSTRAINT** in
   CLAUDE.md (never `published: true`; never write `editorial_introduction`; controlled
   vocabularies only; ≤6 themes; never `authors.draft: false`).

6. **If it needs a schema change,** write the migration file under
   `supabase/migrations/` following the existing numbering. Apply it via the Supabase
   MCP only if that server is authed this session; otherwise leave it for Keith to apply
   and say so plainly in the PR — never assume a migration has run.

7. **Prove it.** `npm ci` if needed, then `npx tsc --noEmit` and
   `npx next lint --file <changed files>`, plus task-specific proof (fetch the new route,
   run the unit test, query Supabase). Re-read your own diff adversarially before pushing.
   For any analytics change, wire-verify the outgoing beacon (CLAUDE.md's verification
   rule) — the attribute being in the JSX is not "done".

8. **Review gate (required — never skip).** Before pushing, run **`/security-review`**
   and then **`/code-review`** on the working diff. Treat every finding as a bug report:
   fix anything real, take the *safer* fix for a security finding, re-verify (step 7),
   and keep going until both come back clean or with only findings you can justify
   leaving. This is the safety net that lets these PRs be merged with little oversight,
   so it is mandatory — do not skip it to save time.

9. **Write the CHANGELOG entry into the same branch (required — never skip).** Before
   pushing, add a dated entry to the top of `CHANGELOG.md` (below the header `---`)
   describing the change this PR makes and why, in the plain-prose house style of the
   existing entries. Commit it on the same branch as the code. This is deliberate: the
   entry rides *inside* the PR, so merging the code and updating the record is one atomic
   act — it is impossible to ship the change without the CHANGELOG catching up. Content
   imports are the one exception (their record is `scripts/ingestion/run-log/`, not
   CHANGELOG — see CLAUDE.md "Keeping the record current"), but a `/next-agent-card` PR is
   a code/product change, so it always gets a CHANGELOG entry.

10. **Open a draft PR — with base `main`.** `git push -u origin claude/<card-slug>`, then
   create a **draft** PR against `main` (set `base: "main"` explicitly). `main` is where work
   lands and `release` is what is live, so a merge into `main` deploys nothing — see CLAUDE.md
   "Vercel usage". Mirror any PR template, and `subscribe_pr_activity`.
   Make the PR body's first line `Card: <exact Feature title>`, copied from Notion (CLAUDE.md
   "Keeping the record current"); step 0's reconciliation matches on it.
   In the PR body, record that the review gate ran and what it surfaced (or "clean"). Never
   mark ready, never merge — Keith does that. Drive its CI to green per the babysit rules.
   Merged into `main` means reviewed and queued, not `Built` and not live: the card
   becomes `Built` once it is on `release`, via the weekly promotion PR (`main` → `release`),
   which Keith merges.

11. **Update the card.** Add a note to the card *body* (never overwrite the `Notes`
    property) linking the PR and stating what was verified (including the review-gate
    outcome), next to the step 2a claim line so the two read together. Set `Status` → `Planned`. Do **not** set `Built` here — that happens in
    step 0 of the next run, once Keith has merged (or is set by whoever merges, per
    CLAUDE.md). Leave `Agent` = `Agent-ready`.

12. **Stop for review.** One card per run. Under `/loop`, the next iteration picks the
    next card only after this one's PR exists.

## Never

- Merge, mark a draft PR ready, or set `published: true` / `authors.draft: false`.
- Widen a card's scope, or batch several cards into one PR.
- Start building a card you have not searched for (step 2) and claimed (step 2a).
- Skip, disable, or quarantine a test to get CI green.
- Build a card that needs taste, auth design, or editing a third-party site.
