-- 040: covering indexes for the corpus's relationship foreign keys
--
-- Card: Index Connected Corpus foreign keys (Feature Backlog).
-- The Supabase performance advisor (20 Nov 2026) flagged nine public foreign keys
-- with no covering index. Each is a join the public site walks: an author's texts,
-- a theme's texts, an era's/tradition's/location's authors, a collection's byline
-- override, an author's places, and the editor's read-next pick. Without an index,
-- every such lookup, and every delete or key update on the parent row (which must
-- check the child table), scans the child table. The tables are small today
-- (~570 texts), so this is preventative: the Connected Corpus work multiplies
-- these traversals. Indexes on the `hopper` schema the advisor also lists belong
-- to another project's tables and are deliberately left alone.
--
-- Two columns are mostly null (collections.author_id is a rare manual override;
-- texts.read_next_text_id is set on a handful of texts), so those indexes are
-- partial and stay tiny.

create index if not exists texts_author_id_idx            on public.texts (author_id);
create index if not exists texts_genre_id_idx             on public.texts (genre_id);
create index if not exists texts_read_next_text_id_idx    on public.texts (read_next_text_id) where read_next_text_id is not null;
create index if not exists text_themes_theme_id_idx       on public.text_themes (theme_id);
create index if not exists authors_era_id_idx             on public.authors (era_id);
create index if not exists authors_tradition_id_idx       on public.authors (tradition_id);
create index if not exists authors_location_id_idx        on public.authors (location_id);
create index if not exists author_locations_author_id_idx on public.author_locations (author_id);
create index if not exists collections_author_id_idx      on public.collections (author_id) where author_id is not null;
