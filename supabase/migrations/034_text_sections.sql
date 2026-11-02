-- 034_text_sections.sql
--
-- WHY
--
-- A long text with headings gets a contents list on the reader page; a long
-- text without them gets nothing, so a phone reader cannot find the part they
-- came for (Chrysostom's *Address on Vainglory*: 90 paragraphs, the turn to
-- raising children at paragraph 16, no signpost). On 29 Oct 2026 Keith agreed
-- to review editor's sections for such texts, drafted by Claude. 33 published
-- texts meet the definition (scripts/lib/sections.mjs: 9,000+ words and fewer
-- than three headings).
--
-- WHAT
--
-- `sections_draft` — Claude's draft, edited in /admin/review/sections. Written
-- by scripts/generate-review-drafts.mjs, never shown publicly.
-- `sections` — the approved copy. Written only by the review page's Approve.
--
-- Both hold { "source": "editorial", "sections": [{ "label", "starts_with" }] }.
-- `starts_with` is the opening words of the paragraph the section starts at,
-- derived from the body (anchors survive renumbering, and fail loudly when the
-- body changes). `source: editorial` records that these are not part of the
-- original text, so whatever renders them can set them apart from the author's
-- own headings (Keith, 29 Oct 2026).
--
-- `sections` is granted to anon now, ahead of the reader code that will read
-- it: `texts` fails closed since 026 (an ungranted column in the public select
-- makes PostgREST refuse the whole query), so the grant must already be there
-- when that code ships. `sections_draft` is admin-only and stays ungranted.

alter table public.texts
  add column sections_draft jsonb,
  add column sections jsonb;

alter table public.texts
  add constraint texts_sections_draft_shape check (
    sections_draft is null
    or (sections_draft->>'source' = 'editorial' and jsonb_typeof(sections_draft->'sections') = 'array')
  ),
  add constraint texts_sections_shape check (
    sections is null
    or (sections->>'source' = 'editorial' and jsonb_typeof(sections->'sections') = 'array')
  );

comment on column public.texts.sections_draft is
  'Draft editorial sections for a long text without headings: {source:"editorial", sections:[{label, starts_with}]}. Reviewed in /admin/review/sections.';
comment on column public.texts.sections is
  'Approved editorial sections (not part of the original text). Same shape as sections_draft. Null = none approved.';

grant select (sections) on public.texts to anon, authenticated;
