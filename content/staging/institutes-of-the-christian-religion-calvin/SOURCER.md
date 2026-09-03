# Sourcer draft — Institutes of the Christian Religion (curated selection)

- **Author:** John Calvin
- **Slug:** `institutes-of-the-christian-religion-calvin`
- **Pinned edition:** https://ccel.org/ccel/calvin/institutes
- **Fetched:** https://ccel.org/ccel/c/calvin/institutes/cache/institutes.txt (2026-09-01T12:14:35.486Z)
- **Prospect:** https://app.notion.com/p/Institutes-of-the-Christian-Religion-curated-selection-3cdd9194805d81dab0eef1657802bdcc
- **Staged by:** sourcer-agent v0

This is a **draft bundle for review**. Nothing here is published or in the database.
The deterministic clean has been applied to `body.md`; every risky correction is left
un-applied in `ocr-report.md` for you to accept/reject.

## ⚑ Flags

- author-missing: author is not yet in the corpus — create the author record before import

## Proposed metadata (confirm before import)

- Genre: Treatise
- Themes: scripture, providence, christology, salvation, sacraments, prayer
- OCR quality: high
- Collection shape: **excerpt** — At roughly 795,000 words the pinned CCEL/Beveridge text is the complete Institutes, not a pre-trimmed selection despite the prospect title; Calvin himself organized the whole work into four self-contained Books, each a coherent argument, so excerpting at the Book level gives the editor self-contained units to select from rather than one undifferentiated mass.
  1. Book I: The Knowledge of God the Creator
  2. Book II: The Knowledge of God the Redeemer in Christ
  3. Book III: The Mode of Obtaining the Grace of Christ
  4. Book IV: The External Means or Aids by Which God Invites Us into the Society of Christ

## Detection summary (see `ocr-report.md`)

- Scanno flags: 0
- Orphaned footnote markers: 1584
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
   `node scripts/detect-scannos.mjs --apply-reviewed=content/staging/institutes-of-the-christian-religion-calvin/ocr-report.md`.
2. Confirm the proposed genre / themes / collection structure in `metadata.yml`.
3. Create the author record (admin Wikipedia lookup) before import — flagged above.
4. Move the reviewed text into the normal import path and publish from the admin UI.
