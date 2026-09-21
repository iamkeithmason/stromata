-- 021_trigger_search_path.sql
--
-- BACKFILL — this DDL was applied directly to the database on 2026-09-21
-- (supabase_migrations version 20260921054941, name "trigger_search_path")
-- without a corresponding repo migration file. Recorded here so repo history
-- matches the live schema; it is already applied and is idempotent.
--
-- Pins an empty search_path on the two trigger functions so a mutable
-- search_path can't be used to shadow the objects they resolve
-- (Supabase advisor: function_search_path_mutable).

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
