-- 024_anon_select_only_grants.sql
--
-- Corrects a drift between 010_grants.sql's stated intent and the live ACLs.
--
-- 010_grants.sql documented that anon would get "NO ACCESS" to texts,
-- text_themes and collections. It never did: Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role`, so every table created in this project was born
-- with `anon=arwdDxtm` — SELECT *and* INSERT/UPDATE/DELETE/TRUNCATE. 010 only
-- ever added grants; it issued no REVOKE, so the defaults stood.
--
-- Checked on 2026-09-21: every public table had anon=arwdDxtm/postgres. The
-- sole reason the anon key could not read or write the corpus was that RLS was
-- enabled with no policies (deny-all). 023 adds SELECT policies, so that
-- backstop is now doing real work rather than hiding this.
--
-- After 023, writes are already denied for anon by RLS — there is no INSERT,
-- UPDATE or DELETE policy. This migration removes the table-level grant as
-- well, so anon is SELECT-only at both layers and a future policy added by
-- mistake cannot silently open up writes.
--
-- `authenticated` keeps the full CRUD grants 010 gave it on purpose (Phase 2
-- auth). RLS denies its writes too — no write policy exists for it either —
-- so add per-user write policies deliberately when Supabase Auth lands.

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

grant select on all tables in schema public to anon;

-- Sequences: anon cannot INSERT, so nextval() is unreachable and unnecessary.
revoke usage, update on all sequences in schema public from anon;
grant select on all sequences in schema public to anon;
