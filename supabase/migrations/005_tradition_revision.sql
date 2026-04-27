-- Tradition taxonomy revision
-- Adds Byzantine and Oriental Orthodox; relabels three existing authors.
-- See PRODUCT.md taxonomy section for full rationale.

-- 1. Insert the two new traditions
INSERT INTO traditions (slug, name) VALUES
  ('byzantine',         'Byzantine'),
  ('oriental-orthodox', 'Oriental Orthodox');

-- 2. John Chrysostom (d. 407): ecumenical → patristic
--    One of the most central Patristic figures; Ecumenical was a lookup error.
UPDATE authors
SET tradition_id = (SELECT id FROM traditions WHERE slug = 'patristic')
WHERE name = 'John Chrysostom';

-- 3. Ratramnus (d. 868): roman-catholic → byzantine
--    Pre-Schism Carolingian theologian; died 868 within the still-undivided church.
UPDATE authors
SET tradition_id = (SELECT id FROM traditions WHERE slug = 'byzantine')
WHERE name = 'Ratramnus';

-- 4. John Wycliffe (d. 1384): reformed → roman-catholic
--    Operated entirely within Roman Catholic structures; Reformed is anachronistic
--    by ~150 years. Proto-Protestant character should be noted in his bio.
UPDATE authors
SET tradition_id = (SELECT id FROM traditions WHERE slug = 'roman-catholic')
WHERE name = 'John Wycliffe';
