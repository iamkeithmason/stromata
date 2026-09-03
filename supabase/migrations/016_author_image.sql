-- Author portrait images.
--
-- image_url    — the public URL of the portrait in Supabase Storage (the
--                'authors' bucket, created below). We copy the image into our
--                own Storage rather than hot-linking Wikimedia so the site does
--                not depend on an external URL that may move or 404.
-- image_source — provenance of the portrait (the Wikimedia Commons / upload
--                URL it was fetched from, or a note for a manual upload). No
--                portrait is displayed without a source on record. This mirrors
--                the existing bio / bio_source pairing.
ALTER TABLE authors
  ADD COLUMN image_url    TEXT,
  ADD COLUMN image_source TEXT;

-- Public bucket for author portraits. Reads are public (portraits are shown on
-- the open site); writes go through server routes using the service-role key,
-- which bypasses RLS, so no additional storage policies are required.
INSERT INTO storage.buckets (id, name, public)
VALUES ('authors', 'authors', true)
ON CONFLICT (id) DO NOTHING;
