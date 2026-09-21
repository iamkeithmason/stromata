-- Collection authorship becomes derived, not stored.
--
-- A collection's byline is now computed from its texts (lib/collections/author.ts);
-- `collections.author_id` survives only as a manual override for the cases
-- derivation can't reach — a compiler or editor, or a collection-level
-- attribution that differs from its parts. Null means "inherit from my texts".
--
-- Why: every text already carries a NOT NULL author_id, so the column was a
-- second copy of a fact the texts hold — and a purely displayed one, which is
-- the kind that goes stale unnoticed. It had: `hydriotaphia-browne` sat null
-- while all five of its texts were Sir Thomas Browne's, so the live page showed
-- no byline, no breadcrumb, and no author in its title, meta description, OG
-- tags or BreadcrumbList JSON-LD.
--
-- This clears the column wherever it merely restates what the texts already
-- say, so that a non-null value means someone chose it. It is lossless by
-- construction: it only touches rows where the collection's texts are all by
-- that same author, which is exactly what the derivation gives back.
--
-- Applying it is optional for correctness — the code renders the same byline
-- either way, since an override that agrees with the texts is indistinguishable
-- from the derived value. It is a cleanup of the drift surface, so the code can
-- ship before or after it.

UPDATE collections c
SET author_id = NULL
WHERE c.author_id IS NOT NULL
  -- at least one text by that author...
  AND EXISTS (
    SELECT 1 FROM texts t WHERE t.collection_id = c.id AND t.author_id = c.author_id
  )
  -- ...and none by anyone else.
  AND NOT EXISTS (
    SELECT 1 FROM texts t WHERE t.collection_id = c.id AND t.author_id <> c.author_id
  );

COMMENT ON COLUMN collections.author_id IS
  'Manual override for the collection byline. Normally NULL: authorship is derived from the collection''s texts (see lib/collections/author.ts). Set it only where the collection''s own attribution differs from its texts'' — a compiler or editor.';
