-- search_texts_body: whole-word, ranked body search for /search.
--
-- WHY. Until now /search matched the body with ilike '%term%', a substring, so
-- "alms" also matched "realms" and "psalms" (117 of 200 hits on 2 Nov 2026) and
-- "simony" matched "parsimony", and the 10 shown were the first alphabetically,
-- not the best. This matches English words (stemmed), ranks with ts_rank_cd,
-- and builds the snippet around the matched word.
--
-- WHY A STORED COLUMN, NOT AN EXPRESSION INDEX. Measured 9 Nov 2026 on
-- production, inside transactions that were rolled back. Built as an expression
-- index alone, the match took 2 ms but ranking took 1.4 s and a full "alms"
-- search 2.8 s, because ts_rank_cd re-parses every matching body (52 KB on
-- average). With the vector stored, a full "alms" search took 0.39 s and "god"
-- (559 hits) 0.68 s, against 0.37 s for the old ilike. Cost: about 11 MB of
-- stored vectors plus a 3.5 MB index, taking the database from 34 MB to about
-- 49 MB of the Free plan's 500 MB (shared with Paideia).
--
-- APPLYING IT. Adding a stored generated column rewrites `texts` (19 MB) under
-- an exclusive lock: a few seconds in which reads of `texts` wait. Apply it at
-- a quiet time, before the release that carries the page change ships. The page
-- falls back to the old ilike search while this migration is not applied, so
-- the order is safe either way.
--
-- WHY SECURITY DEFINER, unlike text_excerpts (032). anon reads `texts` through
-- a column-level grant (026). A SECURITY INVOKER function would need anon to be
-- granted body_tsv, which would expose 11 MB of vectors through the public API
-- and, through lib/supabase/public-columns.ts, add them to every public page
-- that selects the full readable set. So the function runs as its owner, and
-- restricts itself to published texts explicitly (RLS does not apply to it).
-- The excerpt is one ts_headline fragment of about 35 words and the row count
-- is capped at 50, so it cannot be used to pull whole bodies out.
--
-- has_before / has_after say whether the excerpt was cut from the middle of the
-- body, so the page can mark the cut with an ellipsis. With empty selectors the
-- fragment is a verbatim substring of the body (checked for every "alms" hit);
-- if it ever is not, both are true.

alter table public.texts
  add column if not exists body_tsv tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;

create index if not exists texts_body_tsv_idx on public.texts using gin (body_tsv);

create or replace function public.search_texts_body(term text, max_results int default 20)
returns table (id uuid, rank real, excerpt text, has_before boolean, has_after boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(term, '')) as tsq
  ),
  hits as (
    select t.id, t.title, t.body, ts_rank_cd(t.body_tsv, q.tsq) as rank
    from texts t, q
    where t.published
      and t.body_tsv @@ q.tsq
    order by rank desc, t.title
    limit least(greatest(coalesce(max_results, 20), 1), 50)
  ),
  h as (
    select
      hits.id,
      hits.title,
      hits.rank,
      hits.body,
      ts_headline('english', hits.body, q.tsq,
        'MaxFragments=1, MaxWords=35, MinWords=15, StartSel="", StopSel=""') as hl
    from hits, q
  )
  select
    h.id,
    h.rank,
    h.hl,
    strpos(h.body, h.hl) <> 1,
    strpos(h.body, h.hl) = 0 or strpos(h.body, h.hl) + length(h.hl) <= length(h.body)
  from h
  order by h.rank desc, h.title
$$;

revoke all on function public.search_texts_body(text, int) from public;
grant execute on function public.search_texts_body(text, int) to anon, authenticated;
