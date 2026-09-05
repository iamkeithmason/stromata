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

## Steps

1. **Pull the queue.** Query the Feature Backlog data source
   (`collection://00686889-855b-424e-8af1-1fe31062648e`), Agent-ready cards first:

   ```sql
   SELECT url, Feature, Impact, Confidence, Ease, (Impact*Confidence*Ease) AS ICE,
          "Recommended Phase", Status, "Stack Context"
   FROM "collection://00686889-855b-424e-8af1-1fe31062648e"
   WHERE "Agent-ready" = '__YES__' AND Status IN ('Idea','Under Consideration','Planned')
   ORDER BY ICE DESC
   ```

   If SQL is plan-gated (400 "requires a Business plan"), fall back to `notion-search`
   scoped to the data source, then `notion-fetch` each — same pattern as the
   `backlog-triage` skill and CLAUDE.md's Notion note.

2. **Choose one card.** Take the highest-ICE card that does **not** already have an open
   PR or a `claude/*` branch for it (check `mcp__github__list_pull_requests` and
   `git branch -r`). Skip anything already in flight. If nothing qualifies, report that
   and stop.

3. **Read it fully.** `notion-fetch` the card page and read `Summary`,
   `Implementation Suggestion`, `Stack Context`, and `Notes`. If, on reading, the card
   fails an Agent-ready test above, do NOT build it: post one line on the card body
   explaining why, leave `Agent-ready` for Keith to reconsider, and stop.

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

8. **Open a draft PR.** `git push -u origin claude/<card-slug>`, then create a **draft**
   PR (mirror any PR template), and `subscribe_pr_activity`. Never mark ready, never
   merge — Keith does that. Drive its CI to green per the babysit rules.

9. **Update the card.** Add a note to the card *body* (never overwrite the `Notes`
   property) linking the PR and stating what was verified. Set `Status` → `Planned`.
   Do **not** set `Built` — that is Keith's call after merge. Leave `Agent-ready` ticked.

10. **Stop for review.** One card per run. Under `/loop`, the next iteration picks the
    next card only after this one's PR exists.

## Never

- Merge, mark a draft PR ready, or set `published: true` / `authors.draft: false`.
- Widen a card's scope, or batch several cards into one PR.
- Skip, disable, or quarantine a test to get CI green.
- Build a card that needs taste, auth design, or editing a third-party site.
