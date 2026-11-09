-- search_texts_body, made as fast as 036 measured it to be.
--
-- WHAT WENT WRONG. 036 was timed (0.39 s for "alms") as a plain query on a
-- temporary copy of `texts`. Applied, the function took 1.5 s for "alms" and
-- 2.7 s for "god" through the API. Two causes, found by timing each part on
-- 9 Nov 2026:
--
-- 1. Postgres inlines a CTE that is referenced once. The final SELECT names the
--    headline `hl` three times (the excerpt and the two flags), so inlining
--    copied the ts_headline call three times and every excerpt was built three
--    times over. `materialized` makes each CTE run once.
-- 2. The flags used strpos(body, excerpt), a character search through a 52 KB
--    body, twice per row: about 2 s for 20 rows. The page only needs to know
--    whether the excerpt starts or ends the body, so starts_with() and right()
--    answer that directly. Checked on all 50 "god" results: identical flags.
--
-- After: "god" (559 hits) 0.60 s, "on the providence of god" 0.53 s, "alms"
-- 0.32 s, "simony" 0.19 s, inside the database. Results are unchanged.

create or replace function public.search_texts_body(term text, max_results int default 20)
returns table (id uuid, rank real, excerpt text, has_before boolean, has_after boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as materialized (
    select websearch_to_tsquery('english', coalesce(term, '')) as tsq
  ),
  hits as materialized (
    select t.id, t.title, ts_rank_cd(t.body_tsv, q.tsq) as rank
    from texts t, q
    where t.published
      and t.body_tsv @@ q.tsq
    order by rank desc, t.title
    limit least(greatest(coalesce(max_results, 20), 1), 50)
  ),
  h as materialized (
    select
      hits.id,
      hits.title,
      hits.rank,
      t.body,
      ts_headline('english', t.body, q.tsq,
        'MaxFragments=1, MaxWords=35, MinWords=15, StartSel="", StopSel=""') as hl
    from hits
    join texts t on t.id = hits.id, q
  )
  select
    h.id,
    h.rank,
    h.hl,
    not starts_with(h.body, h.hl),
    right(h.body, length(h.hl)) <> h.hl
  from h
  order by h.rank desc, h.title
$$;

revoke all on function public.search_texts_body(text, int) from public;
grant execute on function public.search_texts_body(text, int) to anon, authenticated;
