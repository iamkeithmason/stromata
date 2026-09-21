-- 023_public_read_policies.sql
--
-- Security advisor: `rls_enabled_no_policy` (INFO ×11).
--
-- Every public table has RLS enabled with zero policies, i.e. deny-all. That is
-- safe in itself, but it forced every page in the app — public pages included —
-- to read with the service_role key, which bypasses RLS entirely. The only
-- thing keeping 316 unpublished drafts off the public site was application code
-- remembering `.eq('published', true)`. One missed filter in a new page would
-- have leaked drafts.
--
-- This migration moves that guarantee from convention into the database:
-- public pages now read with the anon key and can only ever see published
-- content. Service role remains in use for admin routes, writes, scripts and
-- the Scout/Sourcer agents.
--
-- SELECT only. No INSERT / UPDATE / DELETE policy is created for anon or
-- authenticated, so writes stay denied by RLS for both roles regardless of
-- table grants. service_role has BYPASSRLS, so admin and scripts are unaffected.
--
-- The policies below were written to reproduce exactly what the site shows
-- today — see the PR description for the before/after row fingerprints.

-- ---------------------------------------------------------------
-- Content tables — gated on the `published` flag
-- ---------------------------------------------------------------

-- texts: the published flag is the public/private boundary.
drop policy if exists "Published texts are publicly readable" on public.texts;
create policy "Published texts are publicly readable"
  on public.texts for select to anon, authenticated
  using (published = true);

-- collections: same boundary.
drop policy if exists "Published collections are publicly readable" on public.collections;
create policy "Published collections are publicly readable"
  on public.collections for select to anon, authenticated
  using (published = true);

-- authors: mirrors app/authors/[slug]/page.tsx, which 404s a draft author only
-- when it has no published texts (`if (author.draft && rows.length === 0)`).
-- Non-draft authors are always listed, including those with no published text
-- yet (app/authors/page.tsx filters on draft, not on text count), so this must
-- not be narrowed to "has a published text".
drop policy if exists "Public authors are publicly readable" on public.authors;
create policy "Public authors are publicly readable"
  on public.authors for select to anon, authenticated
  using (
    draft = false
    or exists (select 1 from public.texts t where t.author_id = authors.id and t.published)
  );

-- ---------------------------------------------------------------
-- Junction tables — inherit their parent text's visibility
-- ---------------------------------------------------------------
-- Exposing these for a draft text would leak that the draft exists (and its
-- themes / scripture references) even without exposing the body.

drop policy if exists "Theme links for published texts are publicly readable" on public.text_themes;
create policy "Theme links for published texts are publicly readable"
  on public.text_themes for select to anon, authenticated
  using (exists (select 1 from public.texts t where t.id = text_themes.text_id and t.published));

drop policy if exists "Scripture refs for published texts are publicly readable" on public.text_scripture_references;
create policy "Scripture refs for published texts are publicly readable"
  on public.text_scripture_references for select to anon, authenticated
  using (exists (select 1 from public.texts t where t.id = text_scripture_references.text_id and t.published));

-- ---------------------------------------------------------------
-- Reference / lookup tables — every row is public by definition
-- ---------------------------------------------------------------
-- author_locations is included here rather than being scoped to visible
-- authors: it is historical place data, no public route reads it today, and it
-- is currently empty. If it ever carries rows for draft-author stubs, narrow it
-- to match the authors policy above.

drop policy if exists "Eras are publicly readable" on public.eras;
create policy "Eras are publicly readable"
  on public.eras for select to anon, authenticated using (true);

drop policy if exists "Genres are publicly readable" on public.genres;
create policy "Genres are publicly readable"
  on public.genres for select to anon, authenticated using (true);

drop policy if exists "Themes are publicly readable" on public.themes;
create policy "Themes are publicly readable"
  on public.themes for select to anon, authenticated using (true);

drop policy if exists "Traditions are publicly readable" on public.traditions;
create policy "Traditions are publicly readable"
  on public.traditions for select to anon, authenticated using (true);

drop policy if exists "Locations are publicly readable" on public.locations;
create policy "Locations are publicly readable"
  on public.locations for select to anon, authenticated using (true);

drop policy if exists "Author locations are publicly readable" on public.author_locations;
create policy "Author locations are publicly readable"
  on public.author_locations for select to anon, authenticated using (true);
