-- 038_paragraph_breaks.sql
--
-- WHY
--
-- Many texts keep their source's typesetting, where a whole chapter is one
-- paragraph (the Ante-Nicene Fathers prints much of Tertullian and Origen this
-- way). On a phone that is several screens of unbroken type. On 10 Nov 2026
-- Keith ruled that adding paragraph breaks is a legitimate editorial act,
-- provided no word changes and the breaks are recorded as the editor's: flag
-- any prose paragraph of 800+ words, have Claude propose breaks, approve each
-- text by hand. That day 151 published texts had such a paragraph.
--
-- WHAT
--
-- `paragraphs_draft` — Claude's proposal, reviewed at /admin/review/paragraphs.
-- Holds { "source": "editorial", "breaks": [{ "after": "<closing words of the
-- sentence a break follows>" }] }, plus "held": true or "applied_at" once Keith
-- has acted. A proposal is anchors into the body, never a rewritten body, so it
-- cannot alter wording. Approving inserts the breaks into `body` itself
-- (scripts/lib/paragraphs.mjs, `applyBreaks`, which refuses unless the words are
-- unchanged) and appends a line to `provenance_notes`. Admin-only: not granted
-- to anon, so the public select never sees it.
--
-- `paragraph_wall_stats(min_words)` — per-text paragraph figures computed in the
-- database, so choosing which texts to draft downloads no bodies (CLAUDE.md,
-- "Supabase limits"). It splits each body at blank lines, drops heading lines,
-- and counts words per paragraph: the 10 Nov measurement, and the same rule as
-- `paragraphBlocks` in scripts/lib/paragraphs.mjs (paragraphs.test.mjs checks
-- the patterns match). It returns the three numbers the tier needs; the tier
-- itself is decided in one place, `tierFor` in that file. It reads every body
-- of `min_words` or more inside Postgres (CPU, not egress). Callable by the
-- service role only. (`btrim` with every whitespace character, because plain
-- `trim` strips only spaces and JS `trim()` strips all whitespace.)
--
-- `texts_updated_at` is recreated to skip an update that changes nothing but
-- `paragraphs_draft`. `updated_at` feeds the sitemap's lastModified, so
-- drafting proposals for 25 published texts (and every Save or Hold on the
-- phone) would otherwise advertise them as changed and invite crawlers to
-- re-render pages whose text has not changed: Fluid CPU on the Hobby budget.
-- Approving breaks writes `body`, so it still moves `updated_at`, as it must.

alter table public.texts
  add column paragraphs_draft jsonb;

alter table public.texts
  add constraint texts_paragraphs_draft_shape check (
    paragraphs_draft is null
    or (paragraphs_draft->>'source' = 'editorial' and jsonb_typeof(paragraphs_draft->'breaks') = 'array')
  );

comment on column public.texts.paragraphs_draft is
  'Proposed editorial paragraph breaks: {source:"editorial", breaks:[{after}], held?, applied_at?}. Anchors, never a body. Reviewed in /admin/review/paragraphs.';

create or replace function public.paragraph_wall_stats(min_words integer default 800)
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
  with blocks as (
    select t.id,
      btrim(regexp_replace(b.blk, E'(^|\\n)#{1,6}[ \\t][^\\n]*', '', 'g'), E' \t\n\r') as txt
    from public.texts t,
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

revoke all on function public.paragraph_wall_stats(integer) from public, anon, authenticated;
grant execute on function public.paragraph_wall_stats(integer) to service_role;

drop trigger if exists texts_updated_at on public.texts;
create trigger texts_updated_at
  before update on public.texts
  for each row
  when ((to_jsonb(old) - 'paragraphs_draft' - 'updated_at') is distinct from (to_jsonb(new) - 'paragraphs_draft' - 'updated_at'))
  execute function public.update_updated_at();
