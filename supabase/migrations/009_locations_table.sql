CREATE TABLE locations (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  alternative_names TEXT,
  lat               NUMERIC,
  lng               NUMERIC,
  description       TEXT
);

ALTER TABLE authors
  ADD COLUMN location_id INTEGER REFERENCES locations(id),
  DROP COLUMN country,
  DROP COLUMN historical_location,
  DROP COLUMN lat,
  DROP COLUMN lng;
