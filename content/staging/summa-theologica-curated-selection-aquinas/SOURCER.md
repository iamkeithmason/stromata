# Sourcer draft — Summa Theologica (curated selection)

- **Author:** Thomas Aquinas
- **Slug:** `summa-theologica-curated-selection-aquinas`
- **Pinned edition:** https://www.newadvent.org/summa/1002.htm
- **Fetched:** https://www.newadvent.org/summa/1002.htm (+25 more part(s)) (2026-09-01T12:26:25.565Z)
- **Prospect:** https://app.notion.com/p/Summa-Theologica-curated-selection-3cdd9194805d81aa8569dd522b4f1a1d
- **Staged by:** sourcer-agent v0

This is a **draft bundle for review**. Nothing here is published or in the database.
The deterministic clean has been applied to `body.md`; every risky correction is left
un-applied in `ocr-report.md` for you to accept/reject.

## ⚑ Flags

- author-missing: author is not yet in the corpus — create the author record before import

## Proposed metadata (confirm before import)

- Genre: Treatise
- Themes: contemplation, desire, virtue, salvation
- OCR quality: high
- Collection shape: **collection** — The curated selection spans distinct numbered Questions drawn from different Parts of the Summa (Prima Pars Q.2 on God's existence; Secunda Pars Q.1-4 on happiness), each with its own articles — a reader would navigate between these named Questions rather than read straight through.
  1. Question 2. The Existence of God
  2. Question 1. Man's Last End
  3. Question 2. Things in Which Man's Happiness Consists
  4. Question 3. What Is Happiness
  5. Question 4. Things That Are Required for Happiness

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
   `node scripts/detect-scannos.mjs --apply-reviewed=content/staging/summa-theologica-curated-selection-aquinas/ocr-report.md`.
2. Confirm the proposed genre / themes / collection structure in `metadata.yml`.
3. Create the author record (admin Wikipedia lookup) before import — flagged above.
4. Move the reviewed text into the normal import path and publish from the admin UI.
