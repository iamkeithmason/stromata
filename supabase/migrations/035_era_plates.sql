-- Era plates: one public-domain image per era, shown as the header band on its
-- era page (4 Nov 2026).
--
-- Every era has a default plate committed with the site (public/plates/eras/,
-- listed with its credit in lib/eras/plates.ts). These columns let the admin
-- era form replace it without a deploy:
--
-- plate_url     — public URL of an uploaded plate in the 'plates' bucket.
--                 NULL means "use the default".
-- plate_credit  — the credit line shown under the band (what it is, where it
--                 is held, and its licence). Required in the form whenever a
--                 plate is uploaded: no image is displayed without a source on
--                 record, as with author portraits (016).
-- plate_focus_y — 0–100, the vertical point the band keeps in view when the
--                 image is cropped (CSS object-position). NULL means 50.
ALTER TABLE eras
  ADD COLUMN plate_url     TEXT,
  ADD COLUMN plate_credit  TEXT,
  ADD COLUMN plate_focus_y SMALLINT CHECK (plate_focus_y BETWEEN 0 AND 100);

-- Public bucket for uploaded era plates. Reads are public; writes go through the
-- admin route with the service-role key, which bypasses RLS (as for 'authors').
INSERT INTO storage.buckets (id, name, public)
VALUES ('plates', 'plates', true)
ON CONFLICT (id) DO NOTHING;
