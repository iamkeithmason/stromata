-- Add a source_url column to texts: the canonical online source a text was
-- fetched from (New Advent, CCEL, archive.org, Gutenberg, a Google Drive doc,
-- etc.). Admin-only — surfaced as a clickable "source document" link on the
-- text edit form so Keith can compare against the original while reviewing.
-- Nullable free text; not every text has a single canonical source URL.
ALTER TABLE texts ADD COLUMN source_url TEXT;
