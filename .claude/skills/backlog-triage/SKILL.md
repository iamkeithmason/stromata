---
name: backlog-triage
description: "Rank and triage The Stromata Feature Backlog (Notion Growth Tracker) by ICE score. Use when asked where a feature sits, what the highest-value / next work is, which site features rank highly, a feature's neighbours in the ranking, or for any 'triage the backlog' / 'what should I build next' question. Pulls the live ranked table and can focus on one feature."
metadata:
  author: stromata
  version: "1.0.0"
---

# Backlog Triage

Answers "where does X sit?" / "what's the highest-value work?" against the
**Feature Backlog** database in the Notion Growth Tracker, ranked by ICE.

## Canonical IDs

- Feature Backlog database: `a7be2be5-14fa-4282-95a4-42a790b0b585`
- Feature Backlog data source: `collection://00686889-855b-424e-8af1-1fe31062648e`
- Events Register data source: `collection://18ebd634-a789-46d1-87ac-eabefd9bbf36`

Schema fields that matter: `Feature` (title), `Impact`, `Confidence`, `Ease`
(each 1–10), `ICE Score` (formula = Impact × Confidence × Ease, max 1000),
`Growth Driver` (Discovery | Content Quality | Content Breadth | None),
`Recommended Phase` (Phase 1–3 | Defer), `Status` (Idea | Under Consideration |
Planned | Built | Rejected). The `ICE Score` formula column is
`notAvailableInQuerySql` — compute `Impact*Confidence*Ease` in SQL instead.

## Procedure

1. **Pull the ranked table.** Use `notion-query-data-sources` (SQL mode):

   ```sql
   SELECT Feature, Impact, Confidence, Ease,
          (Impact*Confidence*Ease) AS ICE,
          "Growth Driver", "Recommended Phase", Status
   FROM "collection://00686889-855b-424e-8af1-1fe31062648e"
   WHERE Status IN ('Idea','Under Consideration','Planned')
   ORDER BY ICE DESC
   LIMIT 25
   ```

   The default backlog view excludes `Built` and `Rejected`; keep that filter
   unless the user asks for the full set. Add `AND "Growth Driver" = 'Discovery'`
   (etc.) or `AND "Recommended Phase" = 'Phase 1'` to scope.

2. **If SQL is plan-gated** (400 "requires a Business plan"), fall back to
   `notion-search` scoped with `data_source_url` to the Feature Backlog, then
   `notion-fetch` each candidate to read Impact/Confidence/Ease and compute ICE
   by hand. (Per CLAUDE.md the SQL gate has flipped before — try SQL first, it
   often works now.)

3. **Present** a compact ranked table: Feature · Impact · Confidence · Ease ·
   ICE · Driver · Phase · Status. Always note ICE is triage, not gospel — the
   card's own description says so, and a 40-point gap is within estimate noise.

4. **Focus mode** (a feature is named): report its Impact/Confidence/Ease/ICE,
   its rank in the active list, and its immediate neighbours above and below, so
   the user sees what it's competing with. Flag useful cuts, e.g. "highest-ICE
   Phase-1 item still only at Idea" or "joint-highest Impact in the list".

5. **Distinguish "the site itself"** from meta/ops entries when asked about
   site-facing work: entries like a capacity-relief investigation or an
   admin-only field are not shipped reader features — separate them out.

## Notes

- Read-only by default. Only edit a card (Status, notes, a new entry) when the
  user explicitly asks — and record progress in the page body, never by
  overwriting the `Notes` property.
- When a feature ships, also check the **Events Register** for the analytics
  events it introduces (same Growth Tracker), and remember the house rule: an
  analytics change isn't done until the outgoing beacon is wire-verified.
