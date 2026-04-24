-- Add slug field to authors for public URL routing
ALTER TABLE authors ADD COLUMN slug TEXT UNIQUE;
