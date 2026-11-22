-- 043_word_count_excludes_notes.sql
--
-- WHY
--
-- Translators' notes are going back into the NPNF/ANF bodies as markdown footnotes (card "Import
-- translators' notes into published NPNF/ANF texts", PR #258): a `[^n]` reference in the text and a
-- `[^n]: …` definition line at the end. Migration 028's word count runs over the whole body, so the
-- notes would be counted as reading. On the Priesthood's six books carry 178 notes, some over 200
-- words: the reading time would grow by a fifth for text nobody reads in sequence.
--
-- WHAT
--
-- The same count as 028, after removing footnote definition lines and footnote references. A body
-- with no footnotes counts exactly as before (on 21 Nov 2026, 594 of 596 texts were unchanged; the two
-- that changed already carried footnotes).
--
--   1. regexp_replace(body, '^\[\^[^]]+\]:.*$', '', 'gn')  drops every line that starts "[^label]:"
--      ('n' makes ^ and $ match at line breaks and keeps . within a line)
--   2. regexp_replace(…, '\[\^[^]]+\]', '', 'g')           drops every "[^label]" reference
--   3. then 028's trim and whitespace split, unchanged
--
-- THE EXPRESSION STILL MIRRORS lib/reading-time.ts EXACTLY; reading-time.test.ts pins the pair with
-- cases run against the live Postgres on 21 Nov 2026.
--
-- Postgres 17 can change a generated column's expression in place, so the column, its comment and
-- the anon/authenticated SELECT grant from 028 all stay. Every row is recomputed when this runs.

alter table public.texts
  alter column word_count set expression as (
    array_length(
      regexp_split_to_array(
        regexp_replace(
          regexp_replace(regexp_replace(body, '^\[\^[^]]+\]:.*$', '', 'gn'), '\[\^[^]]+\]', '', 'g'),
          '^\s+|\s+$', '', 'g'
        ),
        '\s+'
      ),
      1
    )
  );

comment on column public.texts.word_count is
  'Derived from body without its footnotes; mirrors lib/reading-time.ts. Lets listing pages compute a reading time without downloading the body. Generated — never write to it.';
