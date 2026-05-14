-- 010_grants.sql
-- Explicit GRANT statements required by Supabase from October 30 2026.
-- Without these, the Data API will no longer infer access from table ownership.
--
-- Role usage in this project:
--   service_role — used by every server-side call (createServerClient). Needs
--                  full read/write on all tables. Bypasses RLS by design.
--   anon         — the public key (NEXT_PUBLIC_SUPABASE_ANON_KEY). Not used by
--                  any live code path yet, but the key is published so we must
--                  define its access explicitly. Granted SELECT on reference/
--                  lookup tables only. NOT granted on texts or collections,
--                  which have a `published` flag but no RLS — an anon grant
--                  would expose drafts to anyone querying the API directly.
--   authenticated — no Supabase Auth users exist yet (Phase 2). Grants are
--                  added now so the schema is ready when auth is introduced.
--                  Mirrors service_role access; RLS policies added in Phase 2
--                  can narrow this per-user as needed.


-- ============================================================
-- LOOKUP / REFERENCE TABLES
-- All rows are public reference data. Safe for anon read.
-- ============================================================

-- traditions
-- Anon: read-only (public reference data)
-- authenticated / service_role: full access
GRANT SELECT                         ON public.traditions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traditions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traditions TO service_role;

-- eras
-- Anon: read-only (public reference data)
GRANT SELECT                         ON public.eras TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eras TO service_role;

-- genres
-- Anon: read-only (public reference data)
GRANT SELECT                         ON public.genres TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genres TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genres TO service_role;

-- themes
-- Anon: read-only (public reference data)
GRANT SELECT                         ON public.themes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO service_role;

-- locations
-- Anon: read-only (geographic reference data, all rows are public)
GRANT SELECT                         ON public.locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO service_role;


-- ============================================================
-- CONTENT TABLES
-- ============================================================

-- authors
-- Anon: read-only. All author records are public biographical data;
--       no sensitive fields, no published/draft distinction.
GRANT SELECT                         ON public.authors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authors TO service_role;

-- author_locations (junction: author ↔ location)
-- Anon: read-only. Rows are derived from public author/location data.
GRANT SELECT                         ON public.author_locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.author_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.author_locations TO service_role;

-- texts
-- Anon: NO ACCESS. The table contains unpublished drafts (published = false).
--       There is no RLS policy enforcing the published flag at the DB level,
--       so an anon SELECT grant would expose drafts to anyone querying the
--       Supabase Data API directly with the public anon key.
--       The application enforces .eq('published', true) in code, but that
--       filter only applies when going through the app. Add RLS in Phase 2
--       if anon read access to texts is ever needed.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.texts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.texts TO service_role;

-- text_themes (junction: text ↔ theme)
-- Anon: NO ACCESS. Mirrors texts — exposing theme associations for draft
--       texts would leak that a draft exists even without showing the body.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_themes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_themes TO service_role;

-- collections
-- Anon: NO ACCESS. Same reasoning as texts — has a published flag with no
--       RLS enforcement. Collection titles and slugs for drafts would be
--       visible to a direct API call with the anon key.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO service_role;


-- ============================================================
-- SEQUENCES
-- Required for INSERT on tables that use serial/identity columns.
-- service_role and authenticated need USAGE + SELECT on sequences
-- so that nextval() works during inserts.
-- ============================================================

-- texts_accession_seq (created in 004_accession_number.sql)
GRANT USAGE, SELECT ON SEQUENCE public.texts_accession_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.texts_accession_seq TO service_role;
