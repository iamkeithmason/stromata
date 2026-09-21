-- 028_text_word_count.sql
--
-- WHY
--
-- Every listing page on the site selected `body` and used it for exactly one
-- thing: `readingTime(t.body)`, to print "approx. N min read". The body is the
-- single largest column in the database — 29 MB across 547 published texts,
-- averaging 55 kB each — so a page that lists the library downloaded the entire
-- corpus to derive one small integer per row.
--
-- `/texts` did this with no `revalidate`, so it re-rendered on every request:
-- one crawler sweep of the library index transferred 29 MB. The same shape
-- appeared on the theme, scripture, author, era, tradition, collection,
-- location and search pages. Supabase's free-plan egress allowance (5 GB) was
-- exceeded in the 2026-08/09 cycle at 11.07 GB, and the next cycle was on the
-- same path (2.67 GB in four days). Nothing about that traffic was reading the
-- texts — it was computing reading times.
--
-- WHAT
--
-- Store the word count alongside the body so listings can select a 4-byte
-- integer instead of a 55 kB document.
--
-- This is a GENERATED ... STORED column rather than a plain column kept in step
-- by a backfill script or a trigger, because a derived value maintained by
-- hand is a value that eventually disagrees with what it was derived from. A
-- text edited in the admin form, imported by the pipeline, healed by
-- `rejoin-text-paragraphs.mjs` or `strip-source-chrome.mjs`, or changed by a
-- direct SQL update all recompute it for free, and no code path can forget to.
--
-- THE EXPRESSION MIRRORS lib/reading-time.ts EXACTLY
--
-- That function is `body.trim().split(/\s+/).length`. `regexp_replace(body,
-- '^\s+|\s+$', '', 'g')` is the `.trim()` — note that Postgres's `btrim(body)`
-- would NOT do, as it strips spaces only and would leave a leading newline to
-- be split into a spurious empty first element. Verified against the live
-- corpus and on the edge cases where the two languages could plausibly
-- disagree ('', '   ', a body opening with a blank line, tabs, trailing
-- newline): Postgres and JavaScript return an identical count for all of them,
-- including the shared quirk that an empty body counts as 1 word.
--
-- `lib/reading-time.test.ts` pins that equivalence so a future edit to either
-- side has to break a test before it can break the displayed figure.

alter table public.texts
  add column word_count integer
  generated always as (
    array_length(
      regexp_split_to_array(regexp_replace(body, '^\s+|\s+$', '', 'g'), '\s+'),
      1
    )
  ) stored;

comment on column public.texts.word_count is
  'Derived from body; mirrors lib/reading-time.ts. Lets listing pages compute a reading time without downloading the body. Generated — never write to it.';

-- Migration 026 replaced the table-level SELECT grant on `texts` with a column
-- list, so this table FAILS CLOSED: a newly added column is invisible to anon
-- until granted, and PostgREST rejects the whole request (not just the column)
-- if a query names one that is not. Without this grant every listing page would
-- 404 rather than degrade. See lib/supabase/public-columns.ts.
grant select (word_count) on public.texts to anon, authenticated;
