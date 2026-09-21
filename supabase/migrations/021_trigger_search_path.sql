-- Pin search_path on our two trigger functions.
--
-- Supabase's security linter flags `function_search_path_mutable`: a
-- SECURITY-agnostic function with a role-mutable search_path can be steered at
-- anyone who can set search_path. Neither function resolves an unqualified
-- name — they touch only NEW/OLD fields and now() — so pinning it to empty is
-- behaviour-preserving (pg_catalog is always searched first regardless, which
-- is where now() lives).
--
-- Raised here rather than left alone because set_published_at_on_publish() is
-- the single thing that stamps published_at, and the review queue's publish
-- path now depends on it firing correctly.

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_published_at_on_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.published
     AND NEW.published_at IS NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;
