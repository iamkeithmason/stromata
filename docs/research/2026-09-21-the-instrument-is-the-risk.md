# When you build the ruler, the ruler is the risk

*The Stromata · 21 September 2026 · from recovering the 1743 Psychomachia from its page images ([#125](https://github.com/iamkeithmason/stromata/pull/125))*

## In one line

To prove a re-transcription was better than the OCR it replaced I built a
checker, and the checker turned out to be the least-verified code in the
session — four bugs, three of which moved the headline number in the direction
I wanted, because I tuned the instrument while watching its output and stopped
when the number looked right.

## Where it came from

The 1743 Psychomachia had been staged from an Archive.org scan and sat
unpublishable at `ocr_quality: low`. Keith asked whether hand-correction was
the only way out. It wasn't: the page images were on Archive.org the whole
time, and the `_djvu.xml` page dimensions share their pixel space, so the XML's
own body-block coordinates could drive a crop per leaf. Nine subagents re-read
all 72 leaves.

Proving that worked needed a number. The poem is in heroic couplets, so the
form is a checksum: `scripts/lib/couplet-check.mjs` pairs lines and reports the
ones that don't rhyme and the ones ending in something that isn't a word.

I reported four figures to Keith over the session. Three were wrong.

**30.5% baseline.** The checker paired rigidly from index 0. This is couplet
verse *with triplets* — braced in the margin, as eighteenth-century couplet
verse usually is — and every triplet threw all following pairs out of phase.
The real baseline was 56.8%.

**"7 lines still carry wreckage."** A four-consonant-run heuristic in
`plausibleWord`. All seven were words: `constrain` (nstr), `o'erthrown` and
`overthrows` (rthr), `o'erspreads` (rspr). The real count was 0.

**83.2% after.** The vowel-class fallback in `rhymes()` had never once fired —
it compared the class-encoded rime (`v1|d`) and stripped the encoding with a
regex that left an empty string, so every lookup missed. Dead from the day it
was written. With it working: 86.3%.

**"30 leaves were read against the scan by hand."** Five were. The other
twenty-five were settled on pattern and on global couplet phase. The config
recorded that distinction correctly; the generated summary averaged it up.

## What we did

Fixed each one, re-measured **both** sides with the corrected checker each
time, and restated every published figure. Final: 1,227 → 1,373 lines, 58.6% →
86.3% rhyme rate, 65 → 0 lines carrying wreckage.

Wrote the failures into the code rather than the commit log, because the next
person to touch `plausibleWord` needs to know why the threshold is 5 and not 4
at the point where they would lower it.

## What worked

**The artefact's own redundancy, which cost nothing to build.** Two checks
came free with the domain and both outperformed anything I wrote:

- **Couplet rhyme.** The poem tells you when a line ending is wrong.
- **Catchwords.** Eighteenth-century printers set the next page's first word at
  the foot of each page so the binder could check the gathering. It is a
  collation checksum, three hundred years old, and the OCR had already read
  them and classified them as footers. One of these — leaf 72's "Where",
  answered by nothing — is how we found that the poem was **missing its
  ending**: leaf 73 is printed page 72, four lines and "The END.", recorded in
  the config as a rear endpaper.

These were trustworthy precisely because they predate the problem. Nobody
tuned them to make this run look good.

**Withholding the answer from the thing being checked.** The XML's line-pitch
analysis predicts how many lines each leaf holds; transcribers were never told
that number. Tell them and it becomes a target to pad toward, and the check
stops being independent. This one I got right on purpose and it is the reason
the count check caught anything.

**Separating "read it" from "check it".** `prepare` crops, `assemble`
verifies, and what fills the gap — subagents on subscription tokens here, a
scripted API pass later — is deliberately not decided by the script.

## What didn't, and why

**Three of four bugs flattered the answer, and that is not chance.** I wrote
the checker, ran it, looked at the output, and adjusted. That loop has a
gradient: a change that makes the number look wrong gets scrutinised, a change
that makes it look right gets kept. The bias doesn't land on the work — the
work was fine — it lands on the instrument, because the instrument is the only
thing still being edited while you watch the score.

**A test satisfied by a different code path is not a test.** The dead
vowel-class rule had a fixture aimed squarely at it: `seat`/`State`. That pair
also passes on the exact-rime path two lines above, so the test was green for
the whole life of the dead branch. The regression test now uses pairs
(`apply'd`/`Guide`, `lead`/`seed`) that can pass by no other route.

**A guard can inherit the blindness of the thing it guards.** `prepare` skipped
any leaf the old OCR found no text on — which is exactly the set of leaves the
old OCR failed hardest on. Leaf 73's OCR is fifteen specks (`r ee`, `HS dE`),
so the page with the poem's ending was never even fetched. The tool trusted the
broken system to scope the work of replacing it.

**The prediction I was using as ground truth was itself fallible.** On leaf 26
the pitch test named three gaps exactly right — 4, 2 and 1 lines, all confirmed
against the image — and still over-counted the page by two. I generalised from
the three hits and briefly treated the count as a gate. It is a queue.

## The principle, stated generally

**When a change is justified by a number, the code that produces the number is
the highest-risk code in the change, and it is usually the least-tested.**

The work gets reviewed because it is the point. The instrument gets written in
passing, to settle a question, and then quietly becomes the evidence. Worse,
it is the component still under active edit while you are watching the score,
so it absorbs whatever confirmation pressure the session has. Three of four
errors pointing the same way is what that pressure looks like from inside.

Two corollaries:

- **Verification you did not build is worth more than verification you did** —
  a property of the artefact, a checksum from the domain, a constraint that
  predates the question. It cannot have been tuned to the answer.
- **Never let the system you are replacing define the scope of its
  replacement.** Its blind spots become yours, and they are concentrated
  exactly where the replacement was most needed.

## Where else it fits

- **Analytics.** The verification rule here already says an event isn't done
  until you've watched the wire. Same shape: `scripts/verify-analytics.mjs`
  asserts through `wire-check.mjs`, which is unit-tested — because the sweep
  going green by looking in the wrong place is the failure that matters.
- **Evals and LLM judges.** A judge prompt tuned while watching scores rise is
  this failure with a bigger budget. Hold out fixtures the judge was not tuned
  on, exactly as the regression test above uses pairs no other rule can pass.
- **Migrations and backfills.** The dry-run reporter is the instrument; a
  heuristic that silently matches nothing reads as "nothing to do".
- **Any before/after claim.** If the measurement code changed between the two
  measurements, the comparison is void. Re-measure both sides with the final
  instrument, every time — it happened three times in this session.
- **Scoping from a failing system's own output.** Import scripts that skip rows
  the old parser couldn't read; monitoring that only watches endpoints the old
  config knew about; a lint ratchet seeded from files the old rule could parse.
- **An agent's working directory is not a shared artefact.** This one landed on
  the session that wrote the rule. The database write was hung off `assemble`,
  so it needed the manifest and all 72 transcripts — and `work/` was gitignored
  wholesale, so the only machine holding the credentials was the only machine
  that could not run the command. Keith hit it on the first try. The same
  gitignore buried 61,000 characters of transcription, the half of the job that
  cannot be re-downloaded, next to 22MB of crops that can. Both are the
  circularity above wearing different clothes: what was convenient where the
  work happened got mistaken for what is true everywhere. **The step that writes
  somewhere shared must depend only on the artefact that is shared**, and what
  an agent cannot regenerate belongs in the repository, whatever sits next to it.

## Rules of thumb

1. **If a number is the argument, test the thing that computes it harder than
   the thing it measures.** Its tests are the specification for your evidence.
2. **Re-measure both sides after every instrument fix.** A before/after where
   the ruler changed in between is not a comparison.
3. **When your errors point the same way, stop and look at the instrument.**
   Random bugs scatter; biased bugs cluster, and they cluster toward whatever
   you were hoping for.
4. **Make each test fail for its own rule.** Prove a fixture can't pass by
   another path, or the rule it guards can die unnoticed.
5. **Prefer a check that comes with the domain** — a rhyme scheme, a checksum,
   a catchword, a parity bit, an invariant older than the bug.
6. **Never tell the checked party the expected answer.** A prediction leaked to
   the thing being verified is a target, not a test.
7. **When replacing a broken system, don't ask it where to look.** Enumerate
   the work independently; its blind spots are where your win is.
8. **State how much looking is behind each claim.** "Verified" and "consistent
   with the pattern" are different, and the aggregate should never round the
   second up to the first.
9. **Hand-off step, shared input.** Before ending, run the command you are
   about to hand someone from a checkout that has only what they will have.
   An ignore rule is a claim that a file is regenerable — check it is true of
   every file it covers, not just the big ones.
