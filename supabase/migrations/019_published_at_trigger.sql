-- Set published_at automatically, in the database, rather than in each
-- app-level write path. A trigger sets it exactly once, atomically with the
-- publish itself, on the false->true transition (INSERT already published
-- counts as its own transition) — and never touches it again once it's
-- non-null. This avoids the failure mode of a separate read-then-write in
-- application code (e.g. a transient read of the prior row failing and
-- silently nulling out an already-recorded published_at on the next save).
CREATE OR REPLACE FUNCTION set_published_at_on_publish()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published
     AND NEW.published_at IS NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER texts_set_published_at
  BEFORE INSERT OR UPDATE ON texts
  FOR EACH ROW EXECUTE FUNCTION set_published_at_on_publish();

CREATE TRIGGER collections_set_published_at
  BEFORE INSERT OR UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_published_at_on_publish();
