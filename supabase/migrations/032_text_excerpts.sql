-- text_excerpts: the few hundred characters of a text's body around a search
-- term, so /search can show a snippet centred on the hit without downloading
-- the whole body. Before this, the body-match query selected `body` for up to
-- 10 hits — several MB of egress per search on the free plan's 5 GB allowance
-- (CHANGELOG 2026-10-06).
--
-- SECURITY INVOKER: it runs as the caller, so anon still sees only published
-- rows through RLS and only the columns granted to it (body is one).
-- The window is capped server-side so the function cannot be used to pull
-- whole bodies back out through the API.

create or replace function public.text_excerpts(text_ids uuid[], term text, radius int default 300)
returns table (id uuid, excerpt text, has_before boolean, has_after boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with w as (
    select
      t.id,
      t.body,
      greatest(1, strpos(lower(t.body), lower(term)) - greatest(0, least(radius, 1000))) as start_at,
      length(term) + 2 * greatest(0, least(radius, 1000)) as span
    from texts t
    where t.id = any(text_ids[1:20]) and t.published
  )
  select
    w.id,
    substr(w.body, w.start_at, w.span),
    w.start_at > 1,
    w.start_at + w.span <= length(w.body)
  from w
$$;

grant execute on function public.text_excerpts(uuid[], text, int) to anon, authenticated;
