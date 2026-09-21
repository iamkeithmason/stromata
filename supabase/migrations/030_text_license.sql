-- 030_text_license.sql
--
-- WHY
--
-- Every text imported so far is public domain, so there has been nothing to
-- attribute beyond `source_attribution` / `provenance_notes` /
-- `translation_notes`. The Content Prospect List now has a live candidate
-- (`small-catechism-elce-cc`) offered under CC BY-SA 4.0 — a license, not a
-- copyright status, and one that carries its own display+link obligation
-- Creative Commons requires that public domain never did. This column gives
-- the pipeline and the reader page somewhere to record and show that.
--
-- WHAT
--
-- `license` is a nullable slug (e.g. 'cc-by-sa-4.0'), resolved to a display
-- name + canonical deed URL by lib/licenses.ts. Null is the default and
-- means public domain — no license line renders. This migration adds no
-- data and imports nothing; it only makes the column available for a future
-- import to populate, once that import is itself authorized.

alter table public.texts
  add column license text;

comment on column public.texts.license is
  'Slug into lib/licenses.ts (e.g. cc-by-sa-4.0). Null means public domain — the default for every text so far. Non-null requires source_attribution and source_url to also be set (enforced by pipeline-import.mjs, not the database).';

-- Migration 026 replaced the table-level SELECT grant on `texts` with a
-- column list, so this table FAILS CLOSED: a newly added column is invisible
-- to anon until granted, and PostgREST rejects the whole request (not just
-- the column) if a query names one that is not. See lib/supabase/public-columns.ts.
grant select (license) on public.texts to anon, authenticated;
