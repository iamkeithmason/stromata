-- 025_narrow_author_locations_and_authenticated.sql
--
-- Two least-privilege follow-ups to 023/024, both decided after review.

-- ---------------------------------------------------------------
-- 1. author_locations: inherit the authors policy instead of `true`
-- ---------------------------------------------------------------
-- 023 gave this `using (true)`, grouping it with the reference tables. It is
-- really a junction onto `authors`, so `true` would expose the ids and place
-- data of draft author stubs that the authors policy itself hides. The table is
-- empty today and no public route reads it, so this narrowing cannot change
-- what the site shows — it just stops the hole opening later, when the pipeline
-- starts creating draft stubs with locations attached.
--
-- The predicate is deliberately the same expression as the authors policy
-- rather than a simpler `draft = false`: an author is visible when it is not a
-- draft OR it has a published text, and this row should be visible exactly when
-- its author is.

drop policy if exists "Author locations are publicly readable" on public.author_locations;
create policy "Author locations are publicly readable"
  on public.author_locations for select to anon, authenticated
  using (
    exists (
      select 1 from public.authors a
      where a.id = author_locations.author_id
        and (
          a.draft = false
          or exists (select 1 from public.texts t where t.author_id = a.id and t.published)
        )
    )
  );

-- ---------------------------------------------------------------
-- 2. authenticated becomes SELECT-only, like anon
-- ---------------------------------------------------------------
-- 010_grants.sql gave `authenticated` full CRUD on every table on purpose,
-- staging it for a Phase 2 that would add Supabase Auth and narrow it with
-- per-user policies. That Phase 2 has not happened: `auth.users` is empty, the
-- admin area authenticates with its own signed cookie (ADMIN_COOKIE_SECRET) and
-- talks to the database as service_role, so nothing in the codebase ever
-- connects as `authenticated`.
--
-- Those grants are inert today only because RLS denies the writes — there is no
-- INSERT/UPDATE/DELETE policy for the role (verified: zero non-SELECT policies
-- in the public schema). That makes them a trap: the first write policy added
-- for a signed-in user would silently inherit table-wide CRUD on every table
-- rather than the narrow grant its author intended.
--
-- Revoking now costs nothing and makes Phase 2 additive: grant the writes back
-- table by table, alongside the policies that scope them.

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from authenticated;

grant select on all tables in schema public to authenticated;

revoke usage, update on all sequences in schema public from authenticated;
grant select on all sequences in schema public to authenticated;
