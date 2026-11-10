-- 039_paragraph_wall_stats_paged.sql
--
-- WHY
--
-- 038's `paragraph_wall_stats` reads every body over 800 words in one call. It
-- took 15–16 s, and PostgREST (the role `authenticator`) cancels any statement
-- after 8 s, so the first real dry run on 10 Nov 2026 failed with "canceling
-- statement due to statement timeout". It passed when checked through the
-- Supabase connector, which runs as `postgres`, with no timeout.
--
-- WHAT
--
-- The same function, taking one page of texts at a time (texts ordered by id).
-- scripts/generate-review-drafts.mjs walks the pages. The same work, measured
-- outside the function in pages of 60 texts, took 0.2–0.7 s a page. The
-- counting is unchanged, so the tier figures are unchanged (151 / 25 / 2 on
-- 10 Nov). Raising the 8 s limit for the service role instead was rejected:
-- it would lift the guard on every admin query, not just this one.

drop function if exists public.paragraph_wall_stats(integer);

create function public.paragraph_wall_stats(
  min_words integer default 800,
  page_offset integer default 0,
  page_size integer default 60
)
returns table (
  id uuid,
  slug text,
  title text,
  published boolean,
  draft_state text,
  max_words integer,
  total_words integer,
  long_words integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with page as (
    select t.id
    from public.texts t
    order by t.id
    offset page_offset
    limit page_size
  ),
  blocks as (
    select t.id,
      btrim(regexp_replace(b.blk, E'(^|\\n)#{1,6}[ \\t][^\\n]*', '', 'g'), E' \t\n\r') as txt
    from public.texts t
      join page using (id),
      lateral regexp_split_to_table(t.body, E'\\n[ \\t]*\\n') as b(blk)
    where t.body is not null and coalesce(t.word_count, min_words) >= min_words
  ),
  counted as (
    select id, array_length(regexp_split_to_array(txt, '\s+'), 1) as words
    from blocks
    where txt <> ''
  ),
  per_text as (
    select id,
      max(words)::integer as max_words,
      sum(words)::integer as total_words,
      coalesce(sum(words) filter (where words >= 300), 0)::integer as long_words
    from counted
    group by id
    having max(words) >= min_words
  )
  select t.id, t.slug, t.title, t.published,
    case
      when t.paragraphs_draft is null then 'none'
      when t.paragraphs_draft ? 'applied_at' then 'applied'
      when (t.paragraphs_draft->>'held')::boolean then 'held'
      else 'pending'
    end,
    p.max_words, p.total_words, p.long_words
  from per_text p
  join public.texts t on t.id = p.id
  order by t.title
$$;

revoke all on function public.paragraph_wall_stats(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.paragraph_wall_stats(integer, integer, integer) to service_role;
