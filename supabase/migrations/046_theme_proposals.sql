-- 046_theme_proposals.sql
--
-- WHY
--
-- Passage reads keep finding subjects the 35 themes can't express: Christian liberty in Luther,
-- education in Alfred and Comenius, martyrdom in Ignatius. Keith asked on 28 Nov 2026 for these to
-- go to a proposals list that he accepts or refuses, and never straight into `themes`.
--
-- WHAT
--
-- theme_proposals   one row per proposed theme. Seeded with the eight the trials found. A row is
--                   only a proposal: accepting one here adds nothing to `themes`, which stays a
--                   deliberate migration plus the vocab files (CLAUDE.md, controlled vocabularies).
-- theme_gap_counts  a view over the free topics that passage reads name: the whole-text
--                   `theme_check.gaps` and, once section reads exist, each section's `topics`. It
--                   counts texts per topic, so the list stays live with no second copy to drift.
--
-- passage_reads.section_reads   new column on the passage-reads table (045), so no existing column
--                   changes: one entry per section of a long text, {label, starts_with, themes, topics}.
--                   Themes come from the 35; topics are free and feed the view below.
--
-- RLS on, no policies: editorial data, service role only. Nothing public reads either.

ALTER TABLE passage_reads ADD COLUMN section_reads JSONB;

CREATE TABLE theme_proposals (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused')),
  source      TEXT NOT NULL DEFAULT 'passage_read' CHECK (source IN ('seed', 'passage_read', 'editor')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);
ALTER TABLE theme_proposals ENABLE ROW LEVEL SECURITY;

INSERT INTO theme_proposals (label, source, note) VALUES
  ('Christian liberty', 'seed', 'Luther, Invocavit sermons and Babylonian Captivity (trials, 28 Nov 2026)'),
  ('Charity',           'seed', 'Long-text trial, 28 Nov 2026'),
  ('Pride',             'seed', 'Long-text trial, 28 Nov 2026'),
  ('Fortune or fate',   'seed', 'Alfred''s Boethius (long-text trial)'),
  ('Happiness (the highest good)', 'seed', 'Alfred''s Boethius (long-text trial)'),
  ('Free will',         'seed', 'Long-text trial, 28 Nov 2026'),
  ('Education',         'seed', 'Alfred, Comenius (first trial)'),
  ('Martyrdom',         'seed', 'The Martyrdom of Ignatius (first trial)');

CREATE OR REPLACE VIEW theme_gap_counts
WITH (security_invoker = true) AS
WITH topics AS (
  SELECT pr.text_id, lower(trim(g)) AS topic
  FROM passage_reads pr, jsonb_array_elements_text(coalesce(pr.read -> 'theme_check' -> 'gaps', '[]'::jsonb)) g
  UNION
  SELECT pr.text_id, lower(trim(tp))
  FROM passage_reads pr,
       jsonb_array_elements(coalesce(pr.section_reads, '[]'::jsonb)) s,
       jsonb_array_elements_text(coalesce(s -> 'topics', '[]'::jsonb)) tp
)
SELECT t.topic, count(DISTINCT t.text_id) AS texts, array_agg(DISTINCT x.slug) AS slugs
FROM topics t JOIN texts x ON x.id = t.text_id
WHERE t.topic <> ''
GROUP BY t.topic;

REVOKE ALL ON theme_gap_counts FROM PUBLIC, anon, authenticated;
