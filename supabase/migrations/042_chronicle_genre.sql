-- Add a Chronicle genre, and file Eusebius's Church History under it.
--
-- Card: Add 'Chronicle / History' genre term to controlled vocabulary.
-- The vocabulary had no term for historical writing, so Eusebius's ten books
-- of Church History were filed as Treatise, and the next histories in the
-- prospect list (Bede's Ecclesiastical History, the Anglo-Saxon Chronicle,
-- Gildas) had nowhere honest to go. Keith fixed the boundary on 20 Nov 2026:
-- annals or a narrative history of a people or a church is a Chronicle; the
-- Life of a single saint stays Hagiography.
--
-- Mirrored in lib/constants.ts, lib/pipeline/vocab.ts, scripts/sourcer/vocab.ts,
-- scripts/scout/config.ts, scripts/ingestion/fetch-texts.mjs, app/design/visual
-- and CLAUDE.md's controlled vocabulary. The Notion Content Prospect List's
-- `Genre` select needs the option added by hand in the Notion UI (see 029).
-- No cover ornament yet: lib/genres/ornaments.ts falls back to the hairline rule.
INSERT INTO genres (slug, name, description) VALUES
  ('chronicle', 'Chronicle', 'Annals or narrative history of a people or a church, with a theological frame')
ON CONFLICT (slug) DO NOTHING;

UPDATE texts
SET genre_id = (SELECT id FROM genres WHERE slug = 'chronicle')
WHERE slug IN (
  'church-history-book-i', 'church-history-book-ii', 'church-history-book-iii',
  'church-history-book-iv', 'church-history-book-v', 'church-history-book-vi',
  'church-history-book-vii', 'church-history-book-viii', 'church-history-book-ix',
  'church-history-book-x'
);
