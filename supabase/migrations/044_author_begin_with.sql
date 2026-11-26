-- 044_author_begin_with.sql
--
-- WHY
--
-- Author pages are the top source of text opens, and a reader arriving cold on Augustine's page
-- meets 13 works with nothing to say where to start. Short reads is a length filter, not a
-- recommendation. Keith asked on 26 Nov 2026 for an editor's pick per author ("Begin with"), drafted
-- by Claude and approved by him, so it scales to every author with two or more published works (42
-- on 26 Nov) without being written by hand (card "Strengthen author pages as the primary reading
-- entry point", Phase B).
--
-- WHAT
--
-- Two jsonb columns on authors, the same draft/live pair the sections work uses:
--   begin_with_draft  written by `npm run generate:review-drafts -- --begin-with`, never shown
--   begin_with        written only when Keith approves at /admin/review/begin-with; the author
--                     page reads this
-- Each holds { "kind": "text" | "collection", "slug": "<slug>", "note": "<one line, <= 140 chars>" }.
-- A slug rather than a foreign key: a pick names a work, which is either a text or a collection, and
-- the page resolves it against the author's published works on every render, so a pick that stops
-- resolving (unpublished, moved, renamed) simply is not shown. Validation lives in
-- scripts/lib/begin-with.mjs, shared by the script, the admin route and the page.
--
-- Additive and nullable: the author page selects `*`, so it renders the same before and after.

ALTER TABLE authors
  ADD COLUMN begin_with       JSONB,
  ADD COLUMN begin_with_draft JSONB;

COMMENT ON COLUMN authors.begin_with IS
  'Editor''s pick shown as "Begin with" on the author page: {kind: text|collection, slug, note}. Written only on Keith''s approval.';
COMMENT ON COLUMN authors.begin_with_draft IS
  'Claude''s drafted pick for begin_with, awaiting review at /admin/review/begin-with.';
