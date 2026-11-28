-- 045_passage_reads.sql
--
-- WHY
--
-- A passage read is a factual read of one text, made by Haiku from the body alone: its argument,
-- the questions it answers, its rhetorical moves, the people and places it names, the Scripture it
-- cites and quotes without citing, lines worth quoting, provenance and text-quality flags, and a
-- check of its current themes. The ten-text trial (Notion, Field Notes, 28 Nov 2026) showed reads
-- surface authorship questions, theme misses and OCR residue nobody had looked for. Keith asked on
-- 28 Nov to read the whole published library this way.
--
-- WHAT
--
-- One row per text in its own table, not columns on `texts`: a read is ~3 KB of JSON, and keeping
-- it off `texts` means no listing that selects from texts can ever pull it by accident. Nothing on
-- the public site reads this table yet; it is editorial data. RLS is on with no policies, so only
-- the service role can read or write it.
--
--   read       the checked read (scripts/lib/passage-reads.mjs, checkRead)
--   dropped    what the check removed and why: Scripture not printed in the text, quotations not
--              found word for word, names not in the body, values outside the vocabularies
--   body_md5   md5 of the body the read was made from, so a re-run reads only new or changed texts
--
-- passage_read_candidates() returns each published text's id, slug and md5(body) computed in the
-- database, so deciding what needs reading downloads no bodies.
--
-- Size: ~572 rows x ~3-4 KB, about 2 MB, against the shared 500 MB.

CREATE TABLE passage_reads (
  text_id       UUID PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
  read          JSONB NOT NULL,
  dropped       JSONB NOT NULL DEFAULT '[]'::jsonb,
  model         TEXT NOT NULL,
  body_md5      TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE passage_reads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE passage_reads IS
  'Factual read of each text from its body alone (Haiku). Written by scripts/generate-passage-reads.ts. Editorial data; not read by the public site.';

CREATE OR REPLACE FUNCTION passage_read_candidates()
RETURNS TABLE (id UUID, slug TEXT, body_md5 TEXT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT t.id, t.slug, md5(coalesce(t.body, ''))
  FROM texts t
  WHERE t.published
  ORDER BY t.slug
$$;

REVOKE ALL ON FUNCTION passage_read_candidates() FROM PUBLIC, anon, authenticated;
