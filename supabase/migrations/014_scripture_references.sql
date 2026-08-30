-- 014_scripture_references.sql
-- Normalised index of the scripture references cited in each text's body.
-- Powers the reverse lookup ("which texts cite this verse") and, later, the
-- in-reader verse tooltips. Populated by scripts/backfill-scripture-refs.ts,
-- which parses each body with lib/scripture and writes one row per distinct
-- reference (deduplicated by OSIS within a text).
--
-- Mirrors text_themes: a composite primary key with no surrogate id, and the
-- same grant posture — because a reference row implies a text exists, anon gets
-- NO access (it would leak the existence of draft texts, exactly as for
-- text_themes and texts).

CREATE TABLE text_scripture_references (
  text_id      UUID NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  osis         TEXT NOT NULL,          -- canonical OSIS, e.g. 'John.3.16' or a range 'Rom.8.28-Rom.8.30'
  book         TEXT NOT NULL,          -- OSIS book id, e.g. 'John', '1Cor', 'Sir'
  chapter      INT  NOT NULL,          -- chapter of the reference's start
  verse_start  INT,                    -- NULL for a whole-chapter citation
  verse_end    INT,                    -- NULL unless a same-chapter verse range
  raw          TEXT NOT NULL,          -- the reference as it appears in the source text
  PRIMARY KEY (text_id, osis)
);

-- Reverse-lookup access path: filter by book + chapter, then range-check the verse.
CREATE INDEX idx_scripture_refs_lookup
  ON text_scripture_references (book, chapter, verse_start);

-- Grants (see 010_grants.sql). Anon: NO ACCESS — mirrors text_themes/texts, so a
-- direct anon API call cannot enumerate references belonging to draft texts.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_scripture_references TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_scripture_references TO service_role;
