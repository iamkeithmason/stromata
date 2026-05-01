-- Add location fields directly to authors table.
-- author_locations table is left untouched.
ALTER TABLE authors
  ADD COLUMN country text,
  ADD COLUMN location text,
  ADD COLUMN historical_location text,
  ADD COLUMN lat numeric,
  ADD COLUMN lng numeric;
