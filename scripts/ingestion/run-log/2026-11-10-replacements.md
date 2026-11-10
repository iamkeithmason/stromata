# Replacement run — 2026-11-10

Three held texts given cleared translations **in place** (same id, slug, accession number, author, genre,
themes) with `scripts/replace-text-body.mjs`. Staged bodies: `scripts/ingestion/output/replacements/`.
Rows stay `published: false`, `review_state: pending`. `on-the-thoughts` (accession 24) untouched.

**Database status: written 10 Nov 2026** through the Supabase connector (`--sql`), Keith confirming each write.
Each row was checked afterwards: stored body MD5 and provenance fields equal to the staged file, `published: false`,
`review_state: pending`. Scripture references rebuilt (Praktikos 24, Confession 121, Sermon 0).

| Text | Accession | Old words | New words | Scripture refs |
|---|---|---|---|---|
| treatise-on-the-practical-life | 25 | 7,514 | 7,250 (7,206 without the editor's note) | 24 (replaces 46) |
| confession | 21 | 6,345 | 7,299 (6,806 without the 53 footnotes) | 121 |
| sermon-of-the-wolf-to-the-english | 30 | 2,665 | 1,856 | 0 |

## treatise-on-the-practical-life — Evagrius, Praktikos (Dysinger)
Source: evagriusponticus.net TAN transcription. Letter to Anatolius, 100 chapters, epilogue; site chrome and
the "about this transcription" panel removed. Citations rendered inline `(Book c:v)`. Dysinger's nested
lists (69 items, e.g. ch. 57) kept as markdown lists. `license: cc-by-4.0` (added to `lib/licenses.ts`).
For the editor:
- Psalm and Malachi references converted, at Keith's request, from Dysinger's Septuagint numbering to English
  numbering, with one editor's note (`[^ed1]`) saying so: Ps 126:1→127:1, 41:6→42:5, 10:2→11:2, 17:39→18:38,
  26:2→27:2, 125:6→126:6, Mal 3:20→4:2. Dysinger's "Ps 103.13" ("makes glad the heart of man") is Ps 104:15 in
  English numbering (103:15 in the Greek), so the source's verse looks like a slip; cited here as 104:15.
- Chapter 14 prints its last sentence twice (once as a list, once as prose), as the source does.
- The source has no heading 8 among its chapter-group headings (1–7, 9, 10). Not a parsing loss.
- Source typos left as printed: "wraps a round" (letter), "the an who brought the news" (95),
  missing full stops in 94 and 99.
- The rubric "by the same [Evagrius]" before the chapters was dropped; the heading reads "Treatise on the Praktiké: 100 Chapters".
- `summary` replaced at Keith's request (the old one described only the letter): "A hundred short chapters on the eight tempting thoughts and the way to dispassion, opened by a letter on the meaning of the monk's habit."
- `note_draft` (not touched) leans on the old translation's vocabulary (cucullion, analabos).

## confession — Patrick (N. J. D. White, 1918)
Source: archive.org `translationoflat00patrrich` djvu.txt, cleaned with `clean-archive-ocr.mjs`
(config `patrick-confession-white`), pp. 5–26. White's section numbers kept (`1\.` house form).
White's page-foot apparatus (scripture references keyed by section) is kept as markdown footnotes, one per
section, in White's own citation form, plus his one note ("In Co. Mayo") at Foclut: 53 footnotes, following
the footnote convention on the backlog card "Reader footnotes" (`[^n]` in body). The reader has no footnote
styling yet, so they render as a plain list at the end until that card ships.
The Letter to Coroticus follows in the same volume (pp. 26 ff.) if wanted as a separate text.

For the editor:
- **Italics are lost.** White prints scripture quotations in italic; the OCR keeps none of it, and his
  bracketed note explaining the italics was dropped with them.
- Apparatus readings corrected from the OCR: section labels misread as 9 (→8), 26 (→25), 66 (→55, 56),
  68 (→58), 60 (→50), "ao" (→20), "n-" (→61); "Acts XYiii" → xviii; "Pa."/"Fs." → Ps.; "^om." → Rom.;
  "Tit. iii, 5, §" → 5, 6. White's "Is." written "Isa." so the scripture index recognises Isaiah. Section 8's "Eph. vi. 6" may be vi. 5 ("fear and trembling"): check the scan.
- Spellings kept as printed: Calpornus, Banavem (single n), Helias, Scottic.

Judgement calls (confirm against the scan):
- `thy fatherland/'` → `thy fatherland."`
- `danger of starvation 1 Hardly` → `danger of starvation! Hardly`
- `As I stated above.⏎⏎for twenty -eight days` → `As I stated above, for twenty-eight days`
- `children of Godl Sons` → `children of God! Sons`

Italic full stops the OCR read as commas, at the end of a quotation (changed to a full stop):
- `to the Father And he gave` → `to the Father. And he gave`
- `the works of God,⏎` → `the works of God.⏎`
- `under the whole heaven,⏎` → `under the whole heaven.⏎`
- `the teaching of truth,⏎` → `the teaching of truth.⏎`
- `ordained by the Most High,⏎` → `ordained by the Most High.⏎`
- `intercession for us,⏎` → `intercession for us.⏎`
- `for I lie not, From the time` → `for I lie not. From the time`
- `before the world began,⏎` → `before the world began.⏎`
- `he shall sustain thee,⏎` → `he shall sustain thee.⏎`
- `spent for your souls,⏎` → `spent for your souls.⏎`

Letter-level OCR misreads corrected (one possible reading each; italic `/` = I, `h` = b, `y` = comma):
- `Banavem Tabernise` → `Banavem Taberniae`; `holding all things \i.e. Almighty]` → `holding all things [i.e. Almighty]`; `5. Foo:" he himself` → `5. For he himself`; `exalt and 'praise` → `exalt and praise`; `gave me a 'piece` → `gave me a piece`; `will he discovered understanding` → `will be discovered understanding`; `made at the outset 1` → `made at the outset?`; `learn to s;peak peace` → `learn to speak peace`; `ends of the earthy although` → `ends of the earth, although`; `hefore I was afflicted` → `before I was afflicted`; `he tJiat is mighty` → `he that is mighty`; `in everything'?` → `in everything?`; `unblameahly` → `unblameably`; `tending flocks Was my` → `tending flocks was my`; `Love of G-od` → `Love of God`; `How is this, 0 Christian 1 thou say est that thy Cod` → `How is this, O Christian? thou sayest that thy God`; `shouting **Helias"` → `shouting "Helias"`; `my trouble as he saith` → `my trouble, as he saith`; `it is not ye thai speak, hut the Spirit` → `it is not ye that speak, but the Spirit`; `pro\aded` → `provided`; `wood of Foclut which` → `wood of Foclut,[^mayo] which`; `h'oken in hearty and` → `broken in heart, and`; `/ cannot telly God knoweth` → `I cannot tell, God knoweth`; `*' He who laid down his life foi* thee` → `"He who laid down his life for thee`; `who it Could be` → `who it could be`; `hut the Spirit himself maJceth` → `but the Spirit himself maketh`; `which cannot he uttered, which cannot he expressed` → `which cannot be uttered, which cannot be expressed`; `Advocate maheth` → `Advocate maketh`; `episcopate— certainly` → `episcopate — certainly`; `may not he laid` → `may not be laid`; `*' We have seen with anger the face` → `"We have seen with anger the face`; `toiicheth` → `toucheth`; `ap^le` → `apple`; `a]pproved` → `approved`; `of men»` → `of men.`; `**Lo, thou art to be raised to the rank of bishop ; '*` → `"Lo, thou art to be raised to the rank of bishop;"`; `But Cod knoweth` → `But God knoweth`; `a living victinHy my soul` → `a living victim, my soul`; `Who am /, 0 Lord` → `Who am I, O Lord`; `foreshowng` → `foreshowing`; `cared for God"?` → `cared for God?`; `fatherland and kindred %` → `fatherland and kindred?`; `exceedingly to Grod` → `exceedingly to God`; `angel of Grod` → `angel of God`; `unto thee frmi the ends` → `unto thee from the ends`; `/ have set thee to he a light` → `I have set thee to be a light`; `and lOj I am with you` → `and lo, I am with you`; `Go ye therefm^e into all the worlds and pleach` → `Go ye therefore into all the world, and preach`; `He that helieveth` → `He that believeth`; `world Jor a witness` → `world for a witness`; `a>nd then shall` → `and then shall`; `saith the Lardy I will` → `saith the Lord, I will`; `yet / am hound in the Spirit` → `yet I am bound in the Spirit`; `body of this death ,` → `body of this death,`; `the I^ord being` → `the Lord being`; `frotii any one` → `from any one`; `ths>t they might receiye me` → `that they might receive me`; `districts which r more` → `districts which I more`; `/ call Ood` → `I call God`; `vjhom` → `whom`; `our Eedeemer` → `our Redeemer`; `God smd joint` → `God and joint`; `reign eth` → `reigneth`; `frod's good` → `God's good`; `/ (italic I, 9 places)` → `I`

Left as printed, possibly OCR full stops for commas before a quotation: "it is written. The tongue",
"shall say. As our fathers", "the apostle saith. The Spirit", "through the prophets. Behold",
"where it was said. Ye are not". Also "and her one that hath obtained mercy" (40) and "to day among the
heathen" (34).

## sermon-of-the-wolf-to-the-english — Wulfstan, Sermo Lupi (Cook & Tinker 1908)
Source: archive.org `selecttranslatio00cook` djvu.txt, pp. 194–9, config `wulfstan-sermo-lupi-cook`. The
sermon's own heading is kept as an italic opening line; the editors' headnote is excluded. No footnotes in
the print.

**Correction to the brief:** the translation *is* individually credited. It is signed at its end
"Elizabeth W. Manwaring", as each selection in the volume is signed by its translator. `source_attribution`
and `translation_notes` name her. US status is unaffected (published 1908). UK status turns on her death
year, which two searches on 10 Nov could not find. Left flagged in `translation_notes`. Keith's ruling (10 Nov): publication in 1908 settles US status; the UK death year stays an open question on the record, and it does not block publishing.

OCR corrections (config `manualCorrections`): mjus-tice → injustice; tliese, tliis, wliich, wlierein; dihgence;
tilings → things (×2); appomted; livxig; hatmg; "might I Here" → "might! Here"; "together I Let" →
"together! Let"; "disease. ." → "disease."; "shame- '" → shamefully; God- fearing → God-fearing;
^thelred → Æthelred. Space before ; : ! ? closed up.
