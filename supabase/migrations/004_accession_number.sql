-- Persistent accession number for each text — assigned once on insert, never changes.
-- Displayed as № 01, № 02 etc. on book covers and text pages.

-- 1. Create the sequence
CREATE SEQUENCE texts_accession_seq;

-- 2. Add the column (nullable so existing rows can be backfilled first)
ALTER TABLE texts ADD COLUMN accession_number INTEGER;

-- 3. Backfill existing texts in the order they were added
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS n
  FROM texts
)
UPDATE texts SET accession_number = numbered.n
FROM numbered WHERE texts.id = numbered.id;

-- 4. Advance the sequence to the current maximum so the next insert carries on correctly
SELECT setval('texts_accession_seq', COALESCE((SELECT MAX(accession_number) FROM texts), 0));

-- 5. Make it the column default for all future inserts
ALTER TABLE texts
  ALTER COLUMN accession_number SET DEFAULT nextval('texts_accession_seq');

-- 6. Enforce uniqueness
ALTER TABLE texts
  ADD CONSTRAINT texts_accession_number_unique UNIQUE (accession_number);
