# Edition metadata audit — 2026-11-10

Read-only proposal run over 555 texts (published only). Pass 1 (deterministic) + Pass 2 (LLM, verbatim-evidence only). Nothing was written to the database.

A row is **resolved** when it is an original-language/English work (`is_translation: false`), or a translation with a translator and, for a multi-volume series, a volume.

## Resolution

| | Rows | Share |
|---|---:|---:|
| Resolved overall | 532 | 95.9% |
| `is_translation` decided (true/false) | 541 | 97.5% |
| …of which original language / English (`false`) | 46 | 8.3% |
| …of which translations (`true`) | 495 | 89.2% |
| Translations with a translator | 486 | 98.2% of translations |
| Translations with a series | 473 | 95.6% of translations |
| Multi-volume series rows with a volume | 437 | 100.0% of 437 |
| Rows with a publication year | 385 | 69.4% |
| Rows with a publisher | 287 | 51.7% |
| Series + volume + translator (the SQL audit's measure) | 434 | 78.2% |

Confidence: high 393 · medium 136 · low 26

Pass 2 (LLM): 22 unresolved rows asked; 51 fields passed the verbatim-evidence guard, 0 were rejected, and 24 filled a field Pass 1 had left blank (the rest restated what Pass 1 already had). 0 of the asked rows are now resolved.

Sourced and editor-confirmed fields (`outputs/edition-audit/sourced-fields.json`): 14 rows checked against an outside citation, 1 confirmed by the editor. 6 of them corrected a value the notes gave (`the-stromata-book-i`, `the-stromata-book-ii`, `the-stromata-book-iv`, `the-stromata-book-v`, `the-stromata-book-vi`, `the-stromata-book-vii`).

Field values by method: pattern 2982 · inherited_from_collection 122 · sourced 82 · alias 42 · inferred 26 · llm 24 · editor 1

## What we hold, by series and volume

| Series | Rows | Volumes (rows) |
|---|---:|---|
| NPNF1 — Nicene and Post-Nicene Fathers, Series 1 | 215 | 1 (14), 2 (26), 3 (1), 4 (33), 5 (6), 6 (2), 7 (124), 9 (6), 10 (2), 12 (1) |
| ANF — Ante-Nicene Fathers | 120 | 1 (18), 2 (18), 3 (19), 4 (15), 5 (18), 6 (7), 7 (19), 9 (2), 10 (4) |
| NPNF2 — Nicene and Post-Nicene Fathers, Series 2 | 92 | 1 (10), 3 (5), 4 (1), 5 (1), 6 (5), 7 (25), 8 (1), 9 (4), 10 (2), 11 (23), 12 (5), 13 (9), 14 (1) |
| OTHER — Other named edition | 51 | 3 (1), 4 (1), ? (49) |
| LUTHER_PHILA — Works of Martin Luther (Philadelphia Edition) | 7 | 1 (1), 2 (5), 3 (1) |
| PARKER — Parker Society | 4 | ? (4) |
| LIB_FATHERS — Library of the Fathers (Oxford) | 2 | 5 (1), 41 (1) |
| TCL_SPCK — Translations of Christian Literature (SPCK) | 1 | ? (1) |
| SCHAFF_CREEDS — The Creeds of Christendom (Schaff) | 1 | 3 (1) |

## Unresolved rows, by reason

23 unresolved rows. Every one carries at least one reason code (checked).

### `original_english` — 45 rows (0 unresolved)

- `a-form-of-prayer-on-the-lords-prayer` (Jeremy Taylor) — OTHER · 1655
- `a-homily-to-be-read-in-the-time-of-pestilence` (John Hooper) — PARKER · 1852
- `a-prayer-for-charity` (Jeremy Taylor) — OTHER · 1655
- `a-priest-to-the-temple-the-country-parson` (George Herbert) — 1632 — _edition 1632 within the author's lifetime/soon after (d. 1633), no translator named_
- `a-short-catechism` (Jeremy Taylor) — OTHER · 1655
- `an-exposition-of-the-apostles-creed` (Jeremy Taylor) — OTHER · 1655
- `call-to-unconverted-sermon-1-baxter` (Richard Baxter) — 1658
- `centuries-of-meditations-first-century` (Thomas Traherne) — OTHER · 1908
- `christian-morals-part-1` (Sir Thomas Browne) — 1716
- `christian-morals-part-2` (Sir Thomas Browne) — 1716
- `christian-morals-part-3` (Sir Thomas Browne) — 1716
- `directions-right-singing-psalms-roberts` (Francis Roberts) — OTHER · 1675
- `examination-of-william-thorpe` (Anonymous (trial record of William Thorpe)) — 1563
- `family-duty` (John Bunyan)
- `fruitful-dialogue-custom-verity` (Edmund Grindal) — PARKER · 1843
- `hydriotaphia-chapter-1` (Sir Thomas Browne) — 1658
- `hydriotaphia-chapter-2` (Sir Thomas Browne) — 1658
- `hydriotaphia-chapter-3` (Sir Thomas Browne) — 1658
- `hydriotaphia-chapter-4` (Sir Thomas Browne) — 1658
- `hydriotaphia-chapter-5` (Sir Thomas Browne) — 1658
- `hymns-celebrating-the-mysteries-and-chief-festivals-of-the-year` (Jeremy Taylor) — OTHER · 1655
- `laying-foundation-new-chapel-wesley` (John Wesley) — 1777
- `learned-discourse-justification-hooker` (Richard Hooker) — 1612
- `letanies-for-all-things-and-persons` (Jeremy Taylor) — OTHER · 1655
- `national-apostasy` (John Keble)
- `on-frequent-communicating` (John Erskine)
- `practice-of-prelates-tyndale` (William Tyndale) — PARKER · 1848
- `prayers` (Jeremy Taylor) — OTHER · 1655
- `reduction-episcopacy-ussher` (James Ussher) — 1656
- `salvation-by-faith` (John Wesley) — 1738
- `sermon-37-nature-of-enthusiasm` (John Wesley)
- `sermon-66-signs-of-the-times` (John Wesley)
- `sermon-good-works-annexed-unto-faith` (Thomas Cranmer) — PARKER · 1846
- `sermon-on-the-trinity` (Jonathan Swift)
- `short-treatise-political-power` (John Ponet) — 1556
- `the-diary-or-rule-to-spend-each-day-religiously` (Jeremy Taylor) — OTHER · 1655
- `the-gunpowder-plot-sermon` (Lancelot Andrewes) — 1629
- `the-nature-of-the-kingdom-or-church-of-christ` (Benjamin Hoadly) — 1717
- `the-rule-and-exercises-of-holy-dying-taylor-01-chapter-i` (Jeremy Taylor) — 1651
- `the-rule-and-exercises-of-holy-dying-taylor-02-chapter-ii` (Jeremy Taylor) — 1651
- …and 5 more (see proposals.csv)

### `translator_missing` — 23 rows

- `a-paper-on-usury` (John Jewel) — OTHER 4 · 1845
- `a-short-rule-of-life` (John Wycliffe) — OTHER 3 · 1869 — _provenance notes mention translation, but not of this part specifically_
- `conference-with-john-feckenham` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `confession-catholic-faith-damasus` (Pope Damasus I) — NPNF2 3 · 1892
- `first-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `how-the-office-of-curates-is-ordained-of-god` (John Wycliffe)
- `letter-to-lady-katherine-grey` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `letter-to-the-duke-of-suffolk` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `letter-to-thomas-harding-on-his-apostasy` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `note-to-her-father-memorial-for-sir-john-brydges-and-tower-inscriptions` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `on-prayer` (John Wycliffe) — 1880
- `on-the-body-and-blood-of-our-lord` (Ratramnus) — _provenance notes mention translation, but not of this part specifically_
- `prayer-before-execution` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `preface-to-the-pastoral-care` (Alfred the Great) — 1876
- `psychomachia-prudentius` (Prudentius) — 1743 — _series named only to rule it out: "Nicene and Post-Nicene Fathers"_
- `scaffold-speech` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `second-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `secular-authority-luther` (Martin Luther) — LUTHER_PHILA 3 · 1915
- `short-clear-exposition-christian-faith-zwingli` (Huldrych Zwingli) — 1536
- `small-catechism` (Martin Luther) — _year 1529 is not after the author's death (1546); likely the original's date, not the translation's_
- `the-apostles-creed` (Unknown (Early Church)) — OTHER · 1921
- `the-nicene-creed` (Unknown (Ecumenical)) — OTHER · 1921
- `third-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_

### `translator_is_editor` — 7 rows (0 unresolved)

- `fragments-lost-writings-irenaeus` (Irenaeus of Lyons) — ANF 1 · Philip Schaff · 1885 — _credit ends "et al."; the per-work translator is not named_
- `the-stromata-book-i` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_
- `the-stromata-book-ii` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_
- `the-stromata-book-iv` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_
- `the-stromata-book-v` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_
- `the-stromata-book-vi` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_
- `the-stromata-book-vii` (Clement of Alexandria) — ANF 2 · William Wilson · 1885 — _translator from notes ("Alexander Roberts & James Donaldson") replaced by the cited edition's ("William Wilson")_

### `year_suspect` — 2 rows (0 unresolved)

- `tractate-25-john-615-44` (Augustine of Hippo) — NPNF1 7 · John Gibb — _suspect year "18888" in source_attribution; collection parts disagree on translator_display (most say "John Gibb & James Innes")_
- `tractate-30-john-719-24` (Augustine of Hippo) — NPNF1 7 · John Gibb — _suspect year "18888" in source_attribution; collection parts disagree on translator_display (most say "John Gibb & James Innes")_

### `series_false_positive_suspect` — 1 rows

- `psychomachia-prudentius` (Prudentius) — 1743 — _series named only to rule it out: "Nicene and Post-Nicene Fathers"_

### `collection_mixed` — 2 rows (0 unresolved)

- `tractate-25-john-615-44` (Augustine of Hippo) — NPNF1 7 · John Gibb — _suspect year "18888" in source_attribution; collection parts disagree on translator_display (most say "John Gibb & James Innes")_
- `tractate-30-john-719-24` (Augustine of Hippo) — NPNF1 7 · John Gibb — _suspect year "18888" in source_attribution; collection parts disagree on translator_display (most say "John Gibb & James Innes")_

### `modern_translation_check` — 9 rows (1 unresolved)

- `letters-109697-to-trajan-on-the-christians` (Pliny the Younger) — Melmoth & Bosanquet
- `small-catechism` (Martin Luther) — _year 1529 is not after the author's death (1546); likely the original's date, not the translation's_
- `small-catechism-confession` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-daily-devotions` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-holy-baptism` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-lords-prayer` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-sacrament-of-the-altar` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-ten-commandments` (Martin Luther) — Robert E. Smith · 1994
- `small-catechism-the-creed` (Martin Luther) — Robert E. Smith · 1994

### `url_only` — 15 rows

- `a-paper-on-usury` (John Jewel) — OTHER 4 · 1845
- `a-short-rule-of-life` (John Wycliffe) — OTHER 3 · 1869 — _provenance notes mention translation, but not of this part specifically_
- `conference-with-john-feckenham` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `first-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `how-the-office-of-curates-is-ordained-of-god` (John Wycliffe)
- `letter-to-lady-katherine-grey` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `letter-to-the-duke-of-suffolk` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `letter-to-thomas-harding-on-his-apostasy` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `note-to-her-father-memorial-for-sir-john-brydges-and-tower-inscriptions` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `on-the-body-and-blood-of-our-lord` (Ratramnus) — _provenance notes mention translation, but not of this part specifically_
- `prayer-before-execution` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `preface-to-the-pastoral-care` (Alfred the Great) — 1876
- `scaffold-speech` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `second-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_
- `third-letter-to-henry-bullinger` (Lady Jane Grey) — _provenance notes mention translation, but not of this part specifically_

## Collections whose parts disagree

- **tractates-on-the-gospel-of-john** (124 parts): translator_display ∈ {John Gibb & James Innes | John Gibb} (majority: John Gibb & James Innes; only dissenting parts flagged)

Values offered from sibling parts (`inherited_from_collection`):

- **the-stromata**: publication_year → 1 part
- **tractates-on-the-gospel-of-john**: publisher → 122 parts

## Translators

74 distinct translator names.

| Translator | Rows |
|---|---:|
| John Gibb | 124 |
| James Innes | 122 |
| Richard Stothert | 33 |
| Marcus Dods | 28 |
| James Donaldson | 26 |
| Edwin Hamilton Gifford | 24 |
| David S. Schaff | 23 |
| Edgar C.S. Gibson | 22 |
| Robert Ernest Wallis | 19 |
| Alexander Roberts | 18 |
| Peter Holmes | 15 |
| J.G. Pilkington | 13 |
| Frederick Crombie | 12 |
| S. Thelwall | 11 |
| Arthur Cushman McGiffert | 10 |
| William Wilson | 9 |
| J.H. MacMahon | 8 |
| John Gwynn | 8 |
| William Fletcher | 8 |
| Hamilton Bryce | 7 |
| Hugh Campbell | 7 |
| Robert E. Smith | 7 |
| W.R.W. Stephens | 6 |
| James Barmby | 5 |
| M.W. Keatinge | 5 |
| W.H. Fremantle | 5 |
| Allan Menzies | 4 |
| Benjamin Thorpe | 4 |
| Blomfield Jackson | 4 |
| E.W. Watson | 4 |
| G. Lewis | 4 |
| J.F. Shaw | 4 |
| L. Pullan | 4 |
| W.G. Martley | 4 |
| C.M. Jacobs | 3 |
| George Reith | 3 |
| Benjamin Barron Wiffen | 2 |
| George Prevost | 2 |
| H. de Romestin | 2 |
| J. Armitage Robinson | 2 |
| Philip Schaff | 2 |
| Walter John Sedgefield | 2 |
| William Findlay | 2 |
| A. Steimle | 1 |
| A.T.W. Steinhaeuser | 1 |
| Adolph Spaeth | 1 |
| B.P. Pratten | 1 |
| Bosanquet | 1 |
| C.A. Heurtley | 1 |
| C.L. Cornish | 1 |
| Charles Gordon Browne | 1 |
| Charles Lett Feltoe | 1 |
| Ernest Cushing Richardson | 1 |
| Frederick Morgan Padelford | 1 |
| H. Ellershaw | 1 |
| H.M. Wilkins | 1 |
| Henry C. Vedder | 1 |
| Henry Eyster Jacobs | 1 |
| Henry R. Percival | 1 |
| Hugh Connolly | 1 |
| J.E. Ryland | 1 |
| J.G. Cunningham | 1 |
| James Edward Swallow | 1 |
| John Brande Morris | 1 |
| John Henry Richards | 1 |
| John Patrick | 1 |
| L.D. Reed | 1 |
| M.B. Riddle | 1 |
| Melmoth | 1 |
| Sidney Norton Deane | 1 |
| Susanna Winkworth | 1 |
| Talbot W. Chambers | 1 |
| William Moore | 1 |
| William Muir | 1 |

### Suspected alias pairs (proposed additions to the alias map)

None found.

## Proposed seed for a `source_editions` table

A starting point for the Step 2 migration, built only from what the notes say. Editors are the names the notes give for the series; check before using.

| key | title | editors (from notes) | publisher | place | years cited | volumes held | rows |
|---|---|---|---|---|---|---|---:|
| NPNF1 | Nicene and Post-Nicene Fathers, Series 1 | Philip Schaff | Christian Literature Publishing Co. | Buffalo, NY | 1886–1889 | 1, 2, 3, 4, 5, 6, 7, 9, 10, 12 | 215 |
| ANF | Ante-Nicene Fathers | Alexander Roberts; James Donaldson; A. Cleveland Coxe; Allan Menzies | Christian Literature Publishing Co. | Buffalo; Buffalo, NY | 1868–1896 | 1, 2, 3, 4, 5, 6, 7, 9, 10 | 120 |
| NPNF2 | Nicene and Post-Nicene Fathers, Series 2 | Philip Schaff; Henry Wace; W.H. Fremantle | Christian Literature Publishing Co.; Christian Literature Company | Buffalo, NY | 1890–1900 | 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 | 92 |
| LUTHER_PHILA | Works of Martin Luther (Philadelphia Edition) | — | A. J. Holman Company | Philadelphia | 1915–1916 | 1, 2, 3 | 7 |
| PARKER | Parker Society | Charles Nevinson; William Nicholson; Henry Walter; John Edmund Cox | Cambridge University Press | Cambridge | 1843–1852 | — | 4 |
| LIB_FATHERS | Library of the Fathers (Oxford) | — | John Henry Parker | Oxford | 1847–1853 | 5, 41 | 2 |
| TCL_SPCK | Translations of Christian Literature (SPCK) | — | SPCK | London | 1920–1920 | — | 1 |
| SCHAFF_CREEDS | The Creeds of Christendom (Schaff) | — | Harper & Brothers | New York | 1877–1877 | 3 | 1 |

`OTHER` (51 rows) groups named single editions with an imprint but no series; each becomes its own `source_editions` row in Step 2 if wanted:

- Scribner, New York, 1915 — 23 rows
- J.F. for R. Royston at the Angel in Ivie-lane, London, 1655 — 9 rows
- Adam and Charles Black, London, 1896 — 5 rows
- Record Commission, London, 1840 — 3 rows
- Clarendon Press, Oxford, 1900 — 2 rows
- London, 1865 — 2 rows
- Concordia Publishing House, St. Louis, 1921 — 2 rows
- Cambridge University Press, Cambridge, 1845 — 1 row
- Clarendon Press, Oxford, 1869 — 1 row
- 1908 — 1 row
- London, 1675 — 1 row
- G. P. Putnam's Sons, Knickerbocker Press, New York, 1905 — 1 row

## Copyright review

Translations dated after 1928, or undated outside a known public-domain series (`modern_translation_check`), and translated works with no provenance text at all. This is a routing list, not a verdict.

- `letters-109697-to-trajan-on-the-christians` (Pliny the Younger) — modern_translation_check · Melmoth & Bosanquet
- `small-catechism` (Martin Luther) — modern_translation_check
- `small-catechism-confession` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-daily-devotions` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-holy-baptism` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-lords-prayer` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-sacrament-of-the-altar` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-ten-commandments` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
- `small-catechism-the-creed` (Martin Luther) — modern_translation_check · 1994 · Robert E. Smith
