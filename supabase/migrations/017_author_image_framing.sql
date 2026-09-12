-- Non-destructive per-author portrait framing.
--
-- Author portraits are drawn object-fit: cover inside a tall lancet arch, so a
-- full-figure source (e.g. a statue) can have its head cropped out of the top.
-- Rather than re-cut the stored file, we store how each portrait should be
-- framed and apply it in the LancetArch renderer (object-position focal point +
-- a scale zoom). The original image is never modified, so framing stays
-- adjustable at any time.
--
-- image_focus_x / image_focus_y — object-position focal point, 0-100 (%).
--   50/50 is dead-centre and reproduces the pre-framing default, so existing
--   portraits render identically after the backfill.
-- image_zoom — scale multiplier applied at the focal point, >= 1 (1 = no zoom).
ALTER TABLE authors
  ADD COLUMN image_focus_x real NOT NULL DEFAULT 50 CHECK (image_focus_x BETWEEN 0 AND 100),
  ADD COLUMN image_focus_y real NOT NULL DEFAULT 50 CHECK (image_focus_y BETWEEN 0 AND 100),
  ADD COLUMN image_zoom    real NOT NULL DEFAULT 1  CHECK (image_zoom BETWEEN 1 AND 5);
