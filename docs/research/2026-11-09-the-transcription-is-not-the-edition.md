# The transcription is not the edition

*The Stromata · 9 November 2026 · from building the first print edition, Chrysostom's* On the Priesthood
*(W. R. W. Stephens, 1889), as a 5 × 8 in KDP paperback. The build kit lives on Drive (Stromata Print Editions ›
On the Priesthood), not in this repo.*

## In one line

The three corrections that mattered most came from outside the text we started with: the page images of the 1889
volume, Amazon KDP's rules for public-domain books, and Chrysostom's own words. Each one was found later than it
should have been.

## Where it came from

Keith asked for a printed, annotated edition of a text the site already holds. The text came from the CCEL
transcription of *Nicene and Post-Nicene Fathers* I.9, which is what the site's copy rests on. In one long chat,
Claude parsed it to JSON and typeset it in XeLaTeX with editorial paragraph breaks and a speech layout, built a
full-wrap cover adapted from `BookCover.tsx` (later adding the genre ornament and the publisher's mark from #211
and #217), and drafted a preface from Keith's dictation, which he revised by reading it aloud.

## What we did

1. **Checked the Greek in Stephens's notes against the 1889 scan** (Archive.org page images), one garbled word at
   a time.
2. **Checked the four notes that cite 1889 page numbers against the scan**, to reword them as references to notes
   in this edition.
3. **Read KDP's public-domain rules** when the question of an ISBN came up, near the end.
4. **Added the material those rules require** (a timeline, a map, questions, an index of scripture), with the
   repeatable parts built as data plus a script.
5. **Drafted the questions three times**, after Keith corrected their framing twice.

## What worked

- **The scan found errors the transcription could not show.** There were twelve Greek words garbled by the
  transcription and two misprints in the 1889 printing itself (λσιπὰς βχάβας for λοιπὰς βλάβας, *seio* for
  *scio*). There was also one page number that CCEL had **invented**: the 1889 note reads "(see page )" with the
  number left blank, and the transcription supplies "122". A derived text corrects its source silently, so nothing
  inside it marks where.
- **Data plus an engine for anything a series will repeat.** The map is `map.json` (frame, places, routes) plus
  one script with a fixed projection, an engraved style and a Mediterranean inset. The timeline is a JSON file
  and the questions are a plain-text file. The scripture index is generated from Stephens's notes: two passes
  with `\pageref`, then a final pass that reads the `.aux` and merges repeats on one page. A second book supplies
  new data and changes no code.
- **Solving a layout problem by structural analogy.** Book IV opens with a ten-word line of narration, and a
  three-line drop cap beside it left a hole. Book III already sets a speaker's name as its own line with the drop
  cap on the first words spoken. Doing the same for Book IV fixed it in one move, after two tries at padding the
  paragraph.
- **Checking every question against the text before showing it.** This caught one misdescription: a draft had
  Chrysostom's mother asking him not to leave her "a second time", when what she asks is not to be plunged into
  "a second widowhood". It also confirmed
  which book each passage sits in, using a phrase search over the source JSON, which took seconds per question.

## What didn't, and why

- **The rulebook came last.** KDP accepts a public-domain title already on sale only if it is "differentiated":
  original annotations, a translation, or ten or more illustrations, with "(Annotated)" in the title field. A
  preface alone is not enough. We learned this after the book was otherwise finished, and it reshaped what the
  book contains. Had we read it first, the timeline, map, questions and index would have been planned from the
  start rather than added.
- **The first framing of the questions put the reader at the centre.** The draft "study questions" were sound
  but generic. The second draft, "questions for reflection", opened by saying the questions "ask less what
  Chrysostom meant than what his words might ask of you". Keith saw the problem at once: the apparatus was
  editorialising, and the author had become a prompt for the reader's own concerns. The version that held quotes
  Chrysostom in nearly every question and asks what he means and why he argues it, with one question turned to
  the reader at the very end. That framing also turned out to be the one that works across traditions, because
  asking what *he* claims is not asking anyone to agree with it.
- **Two small mechanical traps.** An index label placed at the end of a long footnote takes the page where the
  note *ends*, so a note that breaks across pages was indexed one page late. And the Drive connector refuses
  uploads over about 3 MB, so the kit, with its coastline data, has to be uploaded by hand.

## The principle, stated generally

When an AI builds something finished from a derived source, check it against the primary references (the
original artefact, the rules of whoever will accept it, the author's own words) at the start, not at the end. The
derived source cannot check itself, and the AI tends to trust whatever it was handed.

## Where else it fits

- **The site's own pipeline.** CCEL and New Advent texts can carry the same silent "corrections". The OCR
  pipeline's page-image checks (`ocr-pages-vision.mjs`) already apply the same idea to letters.
- **`note_draft` and summaries.** Generated museum-label notes would gain from the same rule as the questions:
  quote the text, and check every attribution against it.
- **Any submission with a gatekeeper:** app stores, grant forms, journal styles. Read the acceptance rules before
  deciding what to build.
- **Later print editions**, which inherit the map, timeline, index and questions as data files.

## Rules of thumb

- Before typesetting a public-domain text, compare its notes, and anything not in English, against page images of
  the edition you name on the title page. Record each fix with the leaf it came from.
- Read the distributor's content rules before deciding what the edition contains.
- In interpretive questions, quote the author and ask what he means or why. Turn to the reader once, at the end.
  Check every attribution against the text.
- Build anything a series will repeat as data plus one script from the first book.
- Put an index anchor where a note starts, not where it ends.
- When a layout fix needs a hack, look for the place in the same book where the problem is already solved.
