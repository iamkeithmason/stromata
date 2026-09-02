---
name: stromata-analytics
description: "Turn The Stromata's Umami analytics into a corpus-aware digest that informs content and feature priority. Use when asked what readers are opening, which themes/authors/eras/genres draw traffic, where readers enter texts from, how the site is performing, to reconcile events against the Notion Events Register, or 'what does the analytics say we should build/acquire next'. Joins Umami events (keyed by slug) to Supabase (which knows what the slugs mean) and rolls opens up by dimension."
metadata:
  author: stromata
  version: "1.0.0"
---

# Stromata Analytics

Umami records events keyed by **slug** (`text-open` → `text=<slug>`); Supabase
knows what each slug **means** (title, author, themes, era, tradition, genre).
This skill joins the two and rolls reader demand up along every dimension Umami
cannot group by, then reads it for content and feature prioritisation.

It is the analysis layer on top of the read-only access script
(`scripts/umami-report.mjs`) and shares its Umami client (`scripts/lib/umami.mjs`).

## Prerequisites (one-time, local)

- **Umami:** `UMAMI_SHARE_URL` in `.env.local` (the full share link — the EU
  region and slug are parsed from it). Confirm with `npm run umami -- doctor`.
- **Supabase (read):** `ANALYTICS_SUPABASE_URL` + `ANALYTICS_SUPABASE_KEY`, or it
  falls back to `SCOUT_SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_URL` + a read key. A
  service-role or dedicated read role is required — RLS hides `authors`/`texts`
  from the anon key.
- These hosts are reachable locally; in remote (web) sessions add
  `gateway-eu.umami.is` to the environment's network allowlist first.

## Run it

```bash
node scripts/analytics/digest.mjs --range=30d        # Markdown digest
node scripts/analytics/digest.mjs --range=30d --json  # structured, for further analysis
```
`--range` = `24h|today|7d|30d|90d|all` (default `30d`); `--limit=N` caps list rows.

The digest prints: traffic summary; **demand by theme / author / era / tradition
/ genre**; top texts opened (labelled); collections; reading entry points
(`from`); data-quality flags (slugs opened but missing from the DB); and the
events-firing list for Events Register reconciliation.

## Then interpret — this is the point, not the numbers

1. **Verify the wire first (CLAUDE.md rule).** These numbers are only trustworthy
   if the beacon is actually firing. If a whole event is absent, suspect the code
   or an ad-blocker before concluding "no demand" — Umami undercounts, so read
   **shares and rank**, not absolutes.
2. **Content priority (pipeline / Scout).** High-demand themes/eras/authors are a
   pull signal: prefer prospects in those veins. Cross the `byTheme`/`byAuthor`
   demand against the Scout's corpus-gap analysis (`scripts/scout`) — high demand
   + thin coverage is the strongest "acquire next" signal.
3. **Feature priority (backlog).** Entry-point (`from`) shares show which surfaces
   carry reading — that's where UI work has leverage. Feed this into the
   **`backlog-triage`** skill (ICE scoring of the Growth Tracker) as the Impact
   evidence, and into `growth-model` (opens are a North-Star driver). Don't
   restate backlog-triage's ranking here; supply it the demand evidence.
4. **Events Register reconciliation.** Compare the events-firing list against
   **Growth Tracker → Events Register** in Notion (use `notion-search` scoped to
   the database, then `notion-fetch` — the query/view tools are plan-gated on this
   workspace; see the project CLAUDE.md). Flag: events firing that aren't
   registered (undocumented — add a row), and registered events absent from the
   data (dead or broken — e.g. the 2026-07 seasonal-panel `from` regression).

## Notes

- **Read-only.** The digest only issues GET requests to Umami and SELECTs against
  Supabase. Never add writes here.
- **Slugs, not titles.** Every identifier is a slug (matches the URL and joins to
  Supabase cleanly), per the analytics conventions in CLAUDE.md.
- **Legacy exceptions.** `theme-click` and `ko-fi-click` use `source` (not `from`);
  `text-open` values are slugs only since 2026-08-06. The digest reflects what
  Umami stores, so pre/post-cutover comparisons for those aren't directly
  comparable.
- For ad-hoc single-metric questions, `scripts/umami-report.mjs` (`npm run umami --
  <command>`) is lighter than the full digest.
