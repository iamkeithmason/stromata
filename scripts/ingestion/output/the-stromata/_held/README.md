# Held Stromata files (not imported)

Files in this `_held/` subdirectory are deliberately **excluded** from import —
`pipeline-import.mjs`'s `findOutputFiles()` only reads the top level of the
collection directory, so nothing here is picked up.

- `the-stromata-book-iii.md` — **Latin.** The Ante-Nicene Fathers editors left
  Book III (on marriage) untranslated in Latin out of Victorian reticence, and
  New Advent reproduces that; the OCR of the Latin is also garbled.
  **No public-domain English translation exists.** The only complete English
  Book III is Oulton & Chadwick's (*Alexandrian Christianity*, Library of
  Christian Classics Vol. II, Westminster Press, 1954) — the version hosted at
  earlychristianwritings.com and gnosis.org — which is **in copyright** (US: PD
  in 2050; UK/EU: life+70, Chadwick d. 2008). Because the 19th-century ANF/ANCL
  translators Latinised this book, there is no pre-1929 English fallback. Treat
  Book III as a known gap unless a genuinely PD English translation surfaces.
- `the-stromata-book-viii.md` — the fragmentary methodological appendix. Clean
  English, but the live collection is titled "Books I–VII"; including it is a
  scope decision. To add it: clean it like the others and move it up one level.
- `the-stromata-book-i.md` — the stale staged Book I. Book I is already live in
  the database (hand-finished separately); this raw New Advent copy is kept only
  for reference.
- `_review-summary.md` — the original fetch run's review summary.
