-- 015_scripture_reference_counts.sql
-- Citation counts per scripture reference across PUBLISHED texts, powering the
-- "Most cited" list on /scripture. A view because PostgREST/supabase-js can't
-- express GROUP BY + count(DISTINCT) directly.
--
-- security_invoker so the view runs with the caller's own permissions rather
-- than the owner's (no RLS bypass); the published filter keeps draft texts out
-- of the counts regardless.

CREATE VIEW scripture_reference_counts
WITH (security_invoker = true) AS
SELECT
  r.osis,
  r.book,
  r.chapter,
  r.verse_start,
  r.verse_end,
  count(DISTINCT r.text_id) AS text_count
FROM text_scripture_references r
JOIN texts t ON t.id = r.text_id
WHERE t.published = true
GROUP BY r.osis, r.book, r.chapter, r.verse_start, r.verse_end;

-- Anon: no grant, mirroring the base table's posture.
GRANT SELECT ON public.scripture_reference_counts TO authenticated, service_role;
