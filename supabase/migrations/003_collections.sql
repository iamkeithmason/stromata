-- Collections: named containers for groups of related texts (e.g. a book of letters)

CREATE TABLE collections (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  author_id   UUID        REFERENCES authors(id) ON DELETE SET NULL,
  description TEXT,
  published   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Attach texts to a collection with an explicit ordering position
ALTER TABLE texts
  ADD COLUMN collection_id    UUID REFERENCES collections(id) ON DELETE SET NULL,
  ADD COLUMN collection_order INT;

CREATE INDEX idx_texts_collection ON texts (collection_id, collection_order);
