-- Featured slot: editorial pick + feast day support
-- Adds fields to texts (editorial pick) and authors (feast day).
-- No new grants needed — existing table-level grants in 010_grants.sql apply.

-- Texts: editorial pick fields
ALTER TABLE texts
  ADD COLUMN featured      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN featured_from DATE,
  ADD COLUMN featured_note TEXT;

-- Authors: feast day fields
ALTER TABLE authors
  ADD COLUMN feast_day      TEXT,   -- MM-DD format e.g. '01-27'
  ADD COLUMN feast_day_note TEXT;   -- e.g. 'Western calendar' or 'Roman and Eastern'
