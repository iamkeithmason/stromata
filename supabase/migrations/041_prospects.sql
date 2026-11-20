-- 041: the content pipeline's prospect queue, moved out of git into the database
--
-- Card: Pipeline off localhost: weekly cloud run, queue in Supabase, next-action labels.
-- Until now the queue lived in scripts/ingestion/prospect-queue.json, so moving a
-- prospect forward meant editing a file on Keith's laptop, and /admin/pipeline on
-- production showed whatever that file held at the last deploy. With the queue in
-- a table, the deployed admin page reads and edits it live, and a cloud session can
-- run the pipeline and leave the queue current without a merge.
--
-- One row per prospect, columns mirroring the queue schema in CLAUDE.md. Any field
-- the schema does not name lands in `extra` and comes back out unchanged, so an old
-- or hand-added key is never dropped on a round trip (scripts/lib/prospect-store.mjs).
-- `status` is the chain from CLAUDE.md; source_type, tradition, era and genre are
-- validated by the admin API against lib/pipeline/vocab.ts rather than here, so a
-- legacy row with an older value still loads.
--
-- RLS is on with no policies: only the service role (admin routes, pipeline
-- scripts) can read or write it. No public page reads prospects.
--
-- Meters: ~260 rows, ~380 KB in total (the long fields are the stage notes). The
-- one-off backfill (scripts/prospect-queue-sync.mjs --to-db --write) sends that
-- once; /admin/pipeline reads it per page view, which is Keith alone.

create table if not exists public.prospects (
  id                          text primary key check (id ~ '^[a-z0-9-]+$'),
  status                      text not null default 'pending'
                              check (status in ('pending', 'stage-1-done', 'stage-2-done',
                                                'stage-3-done', 'staged', 'imported', 'rejected')),
  added                       date,
  author                      text,
  death_year                  integer,
  tradition                   text,
  era                         text,
  title                       text,
  genre                       text,
  source_type                 text,
  source_url                  text,
  collection_slug             text,
  translation_copyright_clear boolean,
  translator                  text,
  translator_death_year       integer,
  license                     text,
  docx_path                   text,
  stage_1_notes               text,
  stage_2_output              text,
  stage_3_themes              text[] not null default '{}',
  rejection_reason            text,
  notes                       text,
  extra                       jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_collection_slug_idx on public.prospects (collection_slug);

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at
  before update on public.prospects
  for each row execute function update_updated_at();

alter table public.prospects enable row level security;
