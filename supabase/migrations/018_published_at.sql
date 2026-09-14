-- Track the moment a text or collection first becomes published, so the
-- weekly Growth Digest's "Texts added" metric can count exact publish
-- transitions instead of approximating from updated_at (bumped by any edit,
-- not just a publish) or created_at (reflects import time, not publish
-- time). Nullable; set once by the admin save handlers on the false->true
-- transition and never overwritten afterward, so pre-existing published
-- rows are left null rather than backfilled with a guessed date.
ALTER TABLE texts ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN published_at TIMESTAMPTZ;
