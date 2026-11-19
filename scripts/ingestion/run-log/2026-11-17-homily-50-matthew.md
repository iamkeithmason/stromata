# Pipeline Run — 2026-11-17 (Homily 50 on Matthew header)

## Summary
- Follow-up flagged in the 2026-11-17 Ephesians run (PR #234): one **published** row patched in place.
  No new rows, no imports.
- Guarded SQL update (id + accession 3 + slug + exact old opening present): body header,
  `provenance_notes`, `translation_notes`. `published`, `editorial_introduction` and `note_draft` untouched.

## Details

### homily-50-on-matthew — accession 3, id ac0f3310-77be-4369-8d1d-f8c759582dcf, published
Opening header (Matthew 14:23–24) restored from NKJV to the NPNF I/10 rendering, checked word for word
against CCEL `npnf110.txt`, Homily L (the "[1952]" footnote marker there is apparatus and was left out):
- was: "…He went up on the mountain by Himself to pray. Now when evening came, He was alone there. 24 But
  the boat was now in the middle of the sea, tossed by the waves, for the wind was contrary."
- now: "…He went up into the mountain apart to pray: and when the evening was come, He was there alone. But
  the ship was now in the midst of the sea, tossed with waves: for the wind was contrary."

The stray inline verse number "24" is gone with the NKJV wording. The citation line `Matthew 14:23-24.`
is unchanged, and so is its `text_scripture_references` row (`Matt.14.23-Matt.14.24`). `word_count`
(generated) moved 3,742 → 3,741.

provenance_notes (was null): records the restoration and the CCEL check.
translation_notes: replaced the "consider restoring the NPNF rendering" note with the edition
(NPNF I/10, 1888; Prevost, rev. Riddle; public domain by publication date) and a pointer to the change.

### Page refresh
No `REVALIDATE_SECRET` in the cloud container, so `revalidateSite()` could not run. The live
`/texts/homily-50-on-matthew` page keeps the NKJV header until Keith next saves the text in the admin
edit form (which revalidates through `lib/publishing/publish-text.ts`), or until the week-long cache
expires (by about 24 Nov 2026).
