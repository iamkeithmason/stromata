# Analytics digest reports

Dated demand digests produced by the **Analytics digest** GitHub Action
(`.github/workflows/analytics-digest.yml`), which runs `scripts/analytics/digest.mjs`
on a weekly schedule (Mondays 08:00 UTC) and commits its Markdown output here as
`YYYY-MM-DD.md`.

Each report is the Umami × Supabase demand view — reader opens rolled up by theme /
author / era / tradition / genre, top texts and collections, the `from` entry-point
split, and an Events-Register reconciliation list. It's the standing input for
content and feature prioritisation, so no one has to run the digest by hand.

The workflow can also be run on demand from the Actions tab (**Run workflow** →
choose a window: 24h / 7d / 30d / 90d / all; the schedule uses 7d).

## Nothing here is authoritative for absolute counts

Umami undercounts — ad/tracking blockers (including Keith's own Chrome) drop the
beacon. Read **shares and trends**, not absolutes. Reports are lower bounds.

## Required repository Secrets

The Action needs these configured under **Settings → Secrets and variables →
Actions** before its first run (the digest is read-only against both services):

| Secret | Purpose |
|---|---|
| `UMAMI_SHARE_URL` | Umami Cloud per-website Share URL (`…/analytics/<region>/share/<slug>`). Free-tier auth; the digest resolves website id + region from it. |
| `ANALYTICS_SUPABASE_URL` | Supabase project URL (read-only usage). |
| `ANALYTICS_SUPABASE_KEY` | Supabase read key. Must see `authors`/`texts`, which RLS hides from the anon key — use a **service-role key or a dedicated read role**. |

Fallbacks the digest also accepts if the `ANALYTICS_*` pair is unset (set exactly
one Supabase source as Secrets): `SCOUT_SUPABASE_URL` / `SCOUT_SUPABASE_KEY` (already
configured for the Scout), or `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
(or `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The workflow passes all of these through;
whichever pair is populated wins.

**Network:** the runner must reach the Umami Cloud region gateway (e.g.
`gateway-eu.umami.is`) and `cloud.umami.is`, plus the Supabase host. All are public
HTTPS egress — fine on GitHub-hosted runners, no allowlisting needed.

## Feeding prioritisation into Notion — TODO (not yet automated)

An optional hook to append each week's top themes/authors + `from` split to the
Notion **Growth Tracker** was intentionally left unbuilt. This workspace is on the
Notion free tier, where the query/view APIs are plan-gated (see the repo `CLAUDE.md`
"Notion access" note), so a robust write path needs a confirmed target page/database
id and careful handling. The committed dated report is the required deliverable; a
Notion append can be added later as a strictly optional, non-fatal step (skipped
when `NOTION_TOKEN` is absent) without changing this report contract.
