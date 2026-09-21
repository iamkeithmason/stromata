-- Add a Poem genre.
--
-- The vocabulary had exactly one verse genre, Hymn, so every poem that is not
-- a hymn had to be filed as one. That came to a head with the 1743
-- Psychomachia — an allegorical epic in heroic couplets, seven single combats
-- between Virtues and Vices, and in no sense a hymn. Filing it under Hymn
-- would have put it alongside the Cathemerinon in every genre listing on the
-- site and told a reader something false about what they were opening.
--
-- Narrower than "anything in verse": Hymn keeps the liturgical and sung, and
-- Poem takes the rest. A text that could be either is a hymn.
--
-- Mirrored in lib/constants.ts, lib/pipeline/vocab.ts, scripts/sourcer/vocab.ts,
-- scripts/scout/config.ts, scripts/ingestion/fetch-texts.mjs and CLAUDE.md's
-- controlled vocabulary table. The Notion Content Prospect List's `Genre`
-- select needs the option added by hand in the Notion UI — the API specifies
-- select options by NAME with no ids, so an ALTER that rewrites the option set
-- reads as drop-and-recreate and blanks the column on every row.
INSERT INTO genres (slug, name, description) VALUES
  ('poem', 'Poem', 'Verse that is not liturgical or sung — narrative, allegorical, didactic or devotional poetry')
ON CONFLICT (slug) DO NOTHING;
