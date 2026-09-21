# The flattened copy

## In one line

Before writing code to repair a mangled artefact, check whether the same source
also publishes an unflattened form of it — most of the "damage" is often
structure that one representation dropped and the other still carries.

## Where it came from

Bringing Prudentius' *Psychomachia* into The Stromata from an Archive.org scan
of a 1743 English verse translation — the only complete public-domain English
text of it that exists. The first pass went through the project's existing OCR
cleaner, which reads the item's `_djvu.txt`.

The result was unusable, and interestingly so. Couplets came out merged two to a
line. Run-overs — the tail of a long line, which the printer sets flush right on
the next line — were orphaned as junk. Page numbers were spliced into the middle
of verse. Catchwords were indistinguishable from short lines of poetry. On
several pages the lines came out in the **wrong order**.

The obvious next move, and the one I started on, was to write rules: strip
bracketed numbers, detect catchwords by checking whether the next line starts
with the same word, rejoin lines beginning with a lowercase letter. Perhaps
thirty rules, each tuned to this scan, each one a guess.

Then I listed the item's files. Next to the 66 KB `_djvu.txt` sat a 1 MB
`_djvu.xml` — **the same OCR**, but with a `<LINE>` element per printed line, a
bounding box for every word, and a per-word confidence score. Every failure above
was a direct consequence of the `.txt` discarding those three things. None of it
needed better OCR. It needed the structure that was already sitting in the
directory.

## What we did

Read the XML instead. `scripts/lib/djvu-layout.mjs` parses it into pages of
positioned lines and classifies each line by **where it sits**: above the text
block is a header, below it a footer, short and set well into the measure is a
run-over to be folded back into the line above. `scripts/ingestion/extract-djvu-xml.mjs`
drives it and writes both the staged markdown and a review file.

Two behaviours beyond extraction turned out to matter more than the extraction:

- **Every removal is reported**, with its reason and its page. A line of the poem
  vanishing without trace is the failure the whole design is aimed at.
- **Lines the scan lost are detected.** Leaded verse has a near-constant
  baseline-to-baseline pitch, so a gap half again the usual one means type that
  did not come through. This is damage that leaves *no mark in the text* and
  would otherwise have shipped silently. It found 55, and the couplets either
  side of the ones I checked by hand do not rhyme — so they are real.

## What worked

**Deciding from geometry, not from the text.** Every rule I would have written
against the flat file was a rule about what characters look like — starts with a
bracket, is all digits, is a single word. Position survives bad OCR; spelling
does not. `[ 22 ]`, `{821`, `(44)`, `[04]`, `[ 10 E` and `L 27` are all the same
page number in the same place on the page, and only one of those six facts is
stable.

**Refusing to use word count as a signal.** The scanner splits a row of specks in
the margin into eight "words", which made the emptiest line on the page look like
the fullest. `2 „ — — K 2 8 8` came through as verse on the first pass because of
it. Letter count and box height are the honest measures.

**Turning the absence of evidence into evidence.** The missing-line detector is
the piece I would not have thought to build if the XML had not made it nearly
free. It is the only check in the pipeline that finds damage with no textual
symptom.

**Building the checklist from the detector.** The 55 gaps ship as a checkbox list
with a deep link to each scanned leaf and the two lines either side, so the human
pass is "read two lines, look at the image, type what is between them" rather
than "proofread 1,200 lines of 18th-century verse".

## What didn't, and why

**The corpus could not arbitrate its own corrections.** The 1743 uses the long s,
and the scanner misreads it two ways: as `ſ` (one global rule fixes every
instance) and as `f` — `Cafe`, `fubdue`, `whofe`. For the `f` cases I reached for
what felt like a principled, self-validating test: *which `f`-words have an
`s`-form attested elsewhere in this same text?* No external dictionary, no
guessing, evidence drawn from the document itself.

It proposes `for`→`sor`, `fight`→`sight`, `fame`→`same`, `before`→`besore`.

The scan **also** misreads `s` as `f`, so both spellings of everything are
attested, and the corpus contains the error in both directions. The heuristic
looks principled, runs clean, and returns confident nonsense. Every correction
ended up named individually in a `wordFixes` map instead — about eighty entries,
each a reading I could defend from the sense of its own line.

**A case-insensitive replace destroyed something orthogonal to what it fixed.**
Applying the corrections with a `gi` regex turned `Cafe` into `case` and `Earneft`
into `earnest` — correct letters, and it silently flattened the 18th-century
capitalisation of nouns, which is part of the text. The fix preserves the case it
found. The general shape: a bulk edit aimed at dimension A will quietly overwrite
dimension B unless B is explicitly preserved.

**A trailing `\b` on a key ending in punctuation matched nothing, silently.**
`IRS T,` (the drop-capital `F` the scanner missed) never fired, and nothing said
so until the run printed "word fix never matched". That warning existed only
because the same class of failure had already cost a session elsewhere in this
repo.

## The principle, stated generally

**A lossy view of an artefact and the artefact itself are often both published,
side by side, and the lossy one is usually the default.** Convenience formats —
the flat text export, the CSV, the rendered markdown, the PDF's text layer, the
HTML-to-markdown conversion — are derived from something richer that the same
source still holds. Work spent repairing the derived form is work spent
reconstructing, by inference, information that is available directly.

So the first question on receiving a mangled artefact is not "what rules will
repair this?" but **"what does this source also publish?"** The second is "which
of my problems are actually consequences of the conversion I accepted?"

And the corollary, which is the more expensive lesson: **a corpus cannot
arbitrate a correction when the corpus contains the error in both directions.**
Self-supervised correction — inferring the right form from what else appears in
the same data — is only valid when the errors are one-directional. Where they are
symmetric, the method produces a confident, well-evidenced, wrong answer, and
produces it at scale.

## Where else it fits

- **Data pipelines.** A CSV export versus the API that generated it; a flattened
  event log versus the structured records behind it; a `--json` flag that exists
  next to the human-readable output being parsed with regex.
- **Document work.** A PDF's extracted text layer versus its layout tree; a
  scanned form versus its coordinates; converting HTML to markdown and then
  writing rules to recover the structure the conversion dropped.
- **Code.** Parsing a compiler's human-readable output when it also emits
  structured diagnostics; scraping `git log` output rather than using
  `--format`; reading a build's console log when the machine-readable report
  exists beside it.
- **LLM-facing work specifically.** Model output parsed out of prose when the
  same call could return a schema; a tool that returns a rendered table where the
  rows were available; the reflex to fix a bad string rather than to ask for a
  better shape. The correction always looks like the cheaper move and rarely is.
- **Any self-supervised cleanup.** Spelling correction from a corpus that
  contains the misspellings; deduplication keyed on a field the duplication
  corrupted; using a model's own output as its evaluation set.

## Rules of thumb

1. **List the source's other files before writing a parser.** One `curl` to
   `archive.org/metadata/<id>` replaced roughly thirty hand-tuned rules. The
   equivalent exists for most sources and takes a minute.
2. **If the output looks structurally broken — not just noisy — suspect the
   representation, not the data.** Wrong *order* is the loudest tell: no amount
   of bad OCR reorders lines, but a flattening can.
3. **Prefer signals that survive the damage you are repairing.** Position, size
   and count survive bad OCR; spelling does not. Pick the classifier's inputs
   from the properties the corruption leaves alone.
4. **Before trusting a self-validating heuristic, ask whether the errors are
   one-directional.** If the data can be wrong both ways, it cannot vote on
   itself, and the vote will look convincing.
5. **A bulk edit must state what it preserves, not only what it changes.** Case,
   whitespace, ordering and encoding are the usual casualties of a fix aimed
   somewhere else.
6. **Build the detector for damage that leaves no trace.** Every pipeline has a
   failure mode with no symptom in the output. If one exists, finding it is worth
   more than any amount of polish on the failures that announce themselves.
7. **Make the human pass a checklist with links, not a proofread.** 55 items
   each reading "check these two lines against this image" is finishable; "read
   1,200 lines of 18th-century verse" is not.
8. **When a correction cannot fire, say so on every run.** A silent no-op in a
   correction table is indistinguishable from a correction that was not needed.
