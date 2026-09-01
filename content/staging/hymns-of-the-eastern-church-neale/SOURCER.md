# Sourcer draft — Hymns of the Eastern Church

- **Author:** John Mason Neale
- **Slug:** `hymns-of-the-eastern-church-neale`
- **Pinned edition:** https://archive.org/details/hymnsofeasternch00neal_0
- **Fetched:** https://archive.org/stream/hymnsofeasternch00neal_0/hymnsofeasternch00neal_0_djvu.txt (2026-09-01T12:27:00.026Z)
- **Prospect:** https://app.notion.com/p/Hymns-of-the-Eastern-Church-3cdd9194805d81c9b172d281d3fa361d
- **Staged by:** sourcer-agent v0

This is a **draft bundle for review**. Nothing here is published or in the database.
The deterministic clean has been applied to `body.md`; every risky correction is left
un-applied in `ocr-report.md` for you to accept/reject.

## ⚑ Flags

- author-missing: author is not yet in the corpus — create the author record before import

## Proposed metadata (confirm before import)

- Genre: Hymn
- Themes: liturgy, salvation, death, prayer
- OCR quality: high
- Collection shape: **single** — Automated heading detection on this scanned archive.org edition surfaced only site-navigation artifacts, not reliable internal hymn or section titles; absent tool-verified named divisions, the volume is staged as one continuous text for editorial review.

## Detection summary (see `ocr-report.md`)

- Scanno flags: 0
- Orphaned footnote markers: 0
- Suspect Greek runs: 0
- Near-homographs to choose: 0

## Bundle files

- ☑ `raw.txt`
- ☑ `body.md`
- ☑ `provenance.yml`
- ☑ `metadata.yml`
- ☑ `ocr-report.md`
- ☑ `SOURCER.md`

## Next steps (editor)

1. Review `body.md` and edit `ocr-report.md`, then run
   `node scripts/detect-scannos.mjs --apply-reviewed=content/staging/hymns-of-the-eastern-church-neale/ocr-report.md`.
2. Confirm the proposed genre / themes / collection structure in `metadata.yml`.
3. Create the author record (admin Wikipedia lookup) before import — flagged above.
4. Move the reviewed text into the normal import path and publish from the admin UI.
