-- Review queue (/admin/review) — the phone-first draft→publish surface.
--
-- The review loop needs somewhere to hold work-in-progress that is NOT yet the
-- published field, so an interrupted review is never a half-published text:
--   summary_draft       — the generated summary, awaiting approval. Copied into
--                         `summary` at publish, exactly as note_draft is copied
--                         into editorial_introduction. Keeping them separate is
--                         what makes the pre-generation script safe to re-run.
--   review_state        — where a draft sits in the queue. Set to NULL at
--                         publish: a published text is out of the queue, and a
--                         NULL sorts out of every `review_state = …` filter
--                         without needing a fourth 'published' state that would
--                         then have to be kept in sync with `published`.
--   review_note         — why a text was held, in Keith's words. Optional.
--
-- On collections:
--   provenance_verified_at — the gate. Approve is disabled in the UI until this
--                         is set, and the publish route re-checks it server-side
--                         (HARD CONSTRAINT: the UI is not the enforcement point).
--                         A timestamp rather than a boolean so a re-verification
--                         after a provenance edit is visible.
--   description_draft   — the generated collection description, awaiting
--                         approval. Mirrors summary_draft / note_draft.
--
-- No RLS policy changes: texts, collections and authors have RLS enabled with
-- zero policies, and 010_grants.sql grants anon nothing on texts/collections.
-- Every read of these columns goes through the service-role client server-side,
-- so the new columns inherit admin-only access by construction.

ALTER TABLE texts
  ADD COLUMN summary_draft TEXT,
  ADD COLUMN review_state  TEXT DEFAULT 'pending',
  ADD COLUMN review_note   TEXT;

-- Nullable + CHECK rather than NOT NULL: NULL is the "not in the queue"
-- (published) state, so the constraint has to admit it.
ALTER TABLE texts
  ADD CONSTRAINT texts_review_state_check
  CHECK (review_state IS NULL OR review_state IN ('pending', 'approved', 'held'));

-- Already-published rows were never in the queue; clear the default for them so
-- the queue's counts and the "first pending card" scroll aren't polluted by 222
-- texts that are already live.
UPDATE texts SET review_state = NULL WHERE published;

-- The queue screen counts drafts per collection and the collection screen pages
-- through them in collection_order; both filter on review_state.
CREATE INDEX texts_review_state_idx ON texts (review_state) WHERE review_state IS NOT NULL;

ALTER TABLE collections
  ADD COLUMN provenance_verified_at TIMESTAMPTZ,
  ADD COLUMN description_draft      TEXT;
