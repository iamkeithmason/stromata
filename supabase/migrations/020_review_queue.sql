-- 020_review_queue.sql
--
-- BACKFILL — this DDL was applied directly to the database on 2026-09-21
-- (supabase_migrations version 20260921054857, name "review_queue") without a
-- corresponding repo migration file. Recorded here so repo history matches the
-- live schema; it is already applied, and the guards below make re-running it
-- a no-op.

ALTER TABLE texts
  ADD COLUMN IF NOT EXISTS summary_draft TEXT,
  ADD COLUMN IF NOT EXISTS review_state  TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note   TEXT;

DO $$
BEGIN
  ALTER TABLE texts
    ADD CONSTRAINT texts_review_state_check
    CHECK (review_state IS NULL OR review_state IN ('pending', 'approved', 'held'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE texts SET review_state = NULL WHERE published AND review_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS texts_review_state_idx
  ON texts (review_state) WHERE review_state IS NOT NULL;

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS provenance_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description_draft      TEXT;
