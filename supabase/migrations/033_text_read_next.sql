-- 033_text_read_next.sql
--
-- WHY
--
-- The end-of-text "Continue exploring" module (lib/read-next.ts) picks its
-- next reads by rule: same author, a shared theme, the same genre. The backlog
-- card always asked for a manual editorial override as well, and the redesign
-- Keith chose on 27 Oct 2026 leads with ONE next read and a sentence saying
-- why. A rule can say "On Community"; only an editor can say "The same worship
-- Pliny heard about, described from the inside". These two columns hold that.
--
-- WHAT
--
-- `read_next_text_id` — the text the editor sends readers to next. When it is
-- set (and that text is published), it leads the module; the rule picks fill
-- the remaining places. `on delete set null` so deleting the target never
-- blocks or breaks the source text.
-- `read_next_note` — one sentence, shown under the lead pick. Null falls back
-- to the rule caption.
--
-- Both are public, read by the reader page, so both are granted to anon. As
-- 030 notes, `texts` FAILS CLOSED since 026: an ungranted column named in the
-- public select makes PostgREST refuse the whole query, so the grant must ship
-- with the columns and before the page code that reads them.

alter table public.texts
  add column read_next_text_id uuid references public.texts(id) on delete set null,
  add column read_next_note text;

alter table public.texts
  add constraint texts_read_next_not_self check (read_next_text_id is null or read_next_text_id <> id),
  add constraint texts_read_next_note_length check (read_next_note is null or char_length(read_next_note) <= 280);

comment on column public.texts.read_next_text_id is
  'Editorial "read next" pick for the end-of-text module; leads it when published. Null = rule picks only.';
comment on column public.texts.read_next_note is
  'One sentence on why read_next_text_id comes next (max 280 chars). Null = the rule caption is shown.';

grant select (read_next_text_id, read_next_note) on public.texts to anon, authenticated;
