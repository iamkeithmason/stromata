-- 026_revoke_workflow_columns_from_public.sql
--
-- RLS is row-level, not column-level. 023's `texts` policy (`published = true`)
-- decides which ROWS the anon key can read; it says nothing about which
-- COLUMNS. So every column on a published row became publicly readable —
-- including the back-office fields the review queue added in 020, which no
-- public page renders:
--
--   texts.note_draft     — the pipeline's generated editorial note, awaiting
--                          Keith's approval. `editorial_introduction` is the
--                          public field; note_draft is the draft behind it.
--   texts.summary_draft  — the generated summary, awaiting approval.
--   texts.review_state   — where a draft sits in the review queue.
--   texts.review_note    — why a text was held, in Keith's own words.
--   collections.description_draft      — as summary_draft, per collection.
--   collections.provenance_verified_at — the internal publish gate's timestamp.
--
-- Measured before this migration, on published rows the anon key could already
-- read: note_draft on 273, summary_draft on 36, review_state on 51.
-- review_note was empty — but it is Keith's private editorial reasoning by
-- design, and fills as the review queue gets used. The exposure was latent
-- rather than theoretical: it arrives with the feature.
--
-- 020's own comment said these columns "inherit admin-only access by
-- construction". True when written — the tables were deny-all — and 023 is what
-- made it false. The comment is corrected in the same change that invalidates it.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A REVOKE-THEN-GRANT AND NOT A COLUMN REVOKE
-- ---------------------------------------------------------------------------
-- The obvious form does nothing at all:
--
--     revoke select (review_note) on public.texts from anon;  -- NO EFFECT
--
-- A column-level REVOKE only removes column-level grants. 024 issued
-- `grant select on all tables in schema public to anon`, a TABLE-level grant,
-- and a table-level SELECT confers every column regardless of column grants.
-- Verified: after running the column REVOKE above,
-- `has_column_privilege('anon','public.texts','review_note','SELECT')` was
-- still true.
--
-- The working form is to drop the table-level grant and re-grant the allowed
-- columns explicitly, which is what this migration does.
--
-- ---------------------------------------------------------------------------
-- CONSEQUENCE — THIS TABLE NOW FAILS CLOSED
-- ---------------------------------------------------------------------------
-- With a column-list grant, a column added to `texts` or `collections` later is
-- NOT readable by anon until it is granted here. That is the desired default —
-- the next workflow column cannot leak the way these did — but it means a new
-- PUBLIC column needs an explicit grant alongside its ALTER TABLE.
--
-- It also means `grant select on all tables in schema public to anon` (the form
-- 024 used) must never be run again as-is: it would silently restore
-- table-level SELECT and re-expose every column here.
--
-- ---------------------------------------------------------------------------
-- CONSEQUENCE — `select('*')` IS NOW A 403
-- ---------------------------------------------------------------------------
-- PostgREST rejects the WHOLE request when a selected column is unreadable,
-- rather than omitting that column. The two public call sites that used
-- `select('*')` against these tables are converted to explicit column lists in
-- the same commit:
--   app/authors/[slug]/page.tsx      — head-only count on texts → select('id')
--   app/collections/[slug]/page.tsx  — → an explicit collections column list
-- `select('*')` on `authors` is left alone: that table has no withheld columns.
-- Any future public query against texts/collections must name its columns.

-- texts: drop the table-wide grant, re-grant every column except the four
-- workflow fields.
revoke select on public.texts from anon, authenticated;
grant select (
  id, title, slug, author_id, genre_id, body,
  source_attribution, provenance_notes, translation_notes, ocr_quality,
  published, created_at, updated_at,
  collection_id, collection_order, accession_number,
  editorial_introduction, featured, featured_from, featured_note,
  summary, source_url, published_at
) on public.texts to anon, authenticated;

-- collections: same, minus description_draft and provenance_verified_at.
revoke select on public.collections from anon, authenticated;
grant select (
  id, slug, title, author_id, description,
  published, created_at, updated_at, published_at
) on public.collections to anon, authenticated;
