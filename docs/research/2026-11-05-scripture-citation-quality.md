# Scripture citation quality and passage neighbourhoods — audit and plan

Backlog card: *Scripture citation clustering & normalization quality*. Investigation only: no code,
schema or data changed. Measured 2026-11-05 with read-only queries on `text_scripture_references`
(193 rows across the four sample chapters; no `texts.body` read, so no meaningful egress).

## What was measured

Every row citing Matthew 6, John 6, 1 Corinthians 11 or Romans 13, classified by what the stored
columns keep of the `osis` string:

| Pattern | Matt 6 | John 6 | 1 Cor 11 | Rom 13 | Total | Lossy? |
|---|---|---|---|---|---|---|
| Single verse (`John 6: 52`) | 35 | 43 | 39 | 28 | 145 | No |
| Same-chapter range kept (`6:51-55`) | 4 | 2 | 9 | 4 | 19 | No |
| Chapter only (`John 6`) | 4 | 5 | 2 | 5 | 16 | By design: `verse_start` NULL |
| Comma list, end lost (`11:20, 21`, `6:31,32`, `13:3, 4`) | 0 | 2 | 1 | 1 | 4 | **Yes** |
| Bare number, no book in `raw` (`8`, `66`, `33`) | 2 | 1 | 2 | 1 | 6 | `osis` right, `raw` has no book |
| Bare list (`5, 6`) | 1 | 0 | 0 | 0 | 1 | **Yes**, same as comma list |
| Bare range (`26–28`) | 0 | 0 | 1 | 0 | 1 | No (end kept) |
| Chapter span (`Rom. 13, 14` → `Rom.13-Rom.14`) | 0 | 0 | 0 | 1 | 1 | Chapter 14 invisible to lookups |

(Some rows land in two lines of reasoning; the table uses the first matching pattern. The card's
earlier counts, e.g. 36/41 with `verse_start` on Matt 6, were the same data before it grew.)

**Findings.**

1. **Verse starts are reliable.** Every row with a verse has the right `verse_start`; no wrong verse
   was found in the 193. Normalization accuracy for the start point is 100% on this sample.
2. **The loss is in the end of comma lists.** `osis` is correct (`1Cor.11.20-1Cor.11.21`) but
   `verse_end` is NULL, because `parseReferences` only fills `verseEnd` when bcv reports
   `type === 'range'` and a comma list is a `sequence` (`lib/scripture/parse.ts`). Five rows, 2.6% of
   the sample. Effect: a lookup for 1 Cor 11:21 misses the text that cited "11:20, 21" unless it
   reads `osis`. Nothing else is lost; `osis` and `raw` are intact.
3. **Chapter-only citations are 8% of rows** (16/193) and are the weakest evidence: "John 6" says
   nothing about which verse. They must not be clustered with verse-level citations as if they
   pointed at the same place.
4. **Bare-number rows are real but fine.** The parser carries the book and chapter over from the
   previous citation. The `osis` is right, but `raw` alone cannot be read without its neighbour.
5. **Cross-chapter spans keep only the start chapter** in the structured columns (`Rom. 13, 14`
   is filed under chapter 13 only). One row here; rare.

Not measured: roman-numeral references and `Apoc.` (handled in `normalize.ts`, about 2% corpus-wide
per its own comment), and books other than the four sampled.

## Clustering rules (proposed, deterministic)

Work on **intervals of verses within one book**, derived from `osis` (not from `verse_start` /
`verse_end`, which are lossy). A citation is `[b, c1:v1 .. c2:v2]`.

1. **Expand `osis`** into one or more intervals: `A-B` is one interval; the comma-list form
   `X.20-X.21` is one interval of two verses; a bare chapter is the interval of the whole chapter
   and is tagged `grain = 'chapter'`.
2. **Two verse-level citations are in the same neighbourhood** when their intervals overlap, or are
   within a gap of 0 verses (adjacent), inside one chapter. Merge transitively (single-linkage), so
   11:23-24 and 11:24-25 and 11:26-28 form one neighbourhood 11:23-28.
3. **Chapter-grain citations never merge verse-level ones.** They attach to the chapter as a whole
   ("cited generally") and are counted separately, so "John 6" does not inflate John 6:53.
4. **A cluster is a span, not an interpretation.** It carries `{book, chapter, start, end,
   citation_count, text_count}` and nothing else. No label, theme or name is generated; public naming
   stays human-directed (card constraint). Cluster membership implies only that the same verses were
   cited, never that the texts agree.
5. **Cap the span** (suggest 12 verses) and split wider chains at the largest gap, to stop one long
   citation (Romans 13:1-14) chaining a whole chapter into one blob.

Confidence / method convention: add a `norm_method` text value per row (`'bcv'`, `'roman'`,
`'carried'` for bare numbers, `'osis-expanded'` for comma-list repair) so any consumer can discount
or exclude weaker rows. Keep `raw` and `osis` untouched; they are the evidence.

## Bounded implementation plan

Each step ships separately and is verifiable without the admin login.

1. **Parser fix (code only).** In `parse.ts`, set `verseEnd` when the OSIS of a same-chapter
   `sequence` is a contiguous run, or expand to the last verse of the last item. Unit tests with the
   five real rows above. No schema change.
2. **Backfill the five-ish rows' `verse_end`.** Re-run `scripts/backfill-scripture-refs.ts` scoped to
   the affected texts. Meter: Egress, because the script reads `texts.body` (about 30 MB for the
   whole corpus; a scoped run reads only the texts whose rows have `osis` containing `-` and a NULL
   `verse_end`, found first with a body-free query). Find them with
   `select distinct text_id from text_scripture_references where verse_end is null and osis ~ '^[^.]+\.\d+\.\d+-'`.
3. **Add `norm_method`** (migration, nullable, default NULL) and have the backfill set it. Needs a
   migration applied by Keith; do not assume it has run.
4. **Pure `clusterReferences()` in `lib/scripture/`** implementing rules 1-5 over rows already in
   the table, with tests built from the Matthew 6 and 1 Corinthians 11 rows above (11:23-24,
   11:24-25, 11:26-28 must merge; "John 6" must not merge 6:53-58).
5. **Decide on exposure later.** A read-only neighbourhoods view for the Scripture pages is a UI
   change and belongs on its own card.

## Open question for Keith

Whether the chapter-grain rows (8% of citations) should appear at all in neighbourhood counts, or only
as a separate "cited generally" line. The plan above assumes separate.
