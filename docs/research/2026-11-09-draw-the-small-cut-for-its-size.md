# Draw the small cut for its size

*The Stromata · 9 November 2026 · from cutting the publisher's mark in four rounds
([#217](https://github.com/iamkeithmason/stromata/pull/217)); a sequel to
`2026-11-05-carry-the-rejections-into-the-brief.md`*

## In one line

The mark's worst flaw, reading as a dollar sign, was invisible on every large rendering and obvious on a real
book cover, and the fix was a second drawing made for the small size, not the large one shrunk.

## Where it came from

Keith asked for a publisher's mark to replace the plain S in the cover band: his inked sketch of an S wound
through a cross, cut in the woodcut hand of the seventeen genre ornaments, as a print master for books and a
small cut for the covers (10–14px; 6px on the reader page). A background agent drew each round; the orchestrating
session rendered every candidate on real covers from a local build and sent Keith the sheets.

## What we did

1. **Round 1** drew two faithful versions of the sketch. Both read well at 300px. On real covers both read as
   **$**: an S with a bar showing above and below is the dollar glyph, and the short arms could not override it.
2. **Round 2** made the cross a cross (arms past the S, a round boss) and removed the bar below the S. The agent
   tried a small cut with gaps in the weave; the gaps isolated the S and brought the dollar sign straight back.
   The small cut that worked merges cross and S into one solid shape, drawn for its size.
3. **Rounds 3 and 4** turned the print master into a woodcut like the ornaments while the small cut stayed solid.
   Each round's sheet put the candidates beside a plain "$" at the same pixel sizes, and on real covers.

## What worked

- **Rendering on the real surface, every round.** A script lifted real covers from the local site and swapped
  each candidate into the band at 148 and 224px. It caught the dollar sign in round 1 and confirmed the fix in
  round 2; neither sheet alone would have.
- **Putting the likely misreading beside the candidate.** A "$" set at 6, 10, 14 and 24px next to each small cut
  turned "does it look like a dollar?" from an argument into a glance.
- **Two cuts with different jobs.** Once the small cut was its own drawing, the print master was free to become a
  full woodcut (open outlines, hatching), which could never survive at 10px.
- **Asking the owner the real question.** "Does this look more like my drawing or like the ornaments?" got an
  honest answer (the drawing) and a clear choice, which set rounds 3 and 4.

## What didn't, and why

- **The first brief derived the small cut from the master** ("simplify it: drop hatching, widen the gaps"). That
  is how icons are usually made, and here it failed twice: hatching and gaps either vanish or, worse, survive just
  enough to change what the shape says.
- **A large sheet cannot show a small-size misreading.** Round 1's own sheet included 10 and 14px renders, but
  isolated on a swatch they read as "a cross-ish S"; in the band of a book cover, among real titles, the eye read
  "$". Context changed the reading, not only size.
- **The sketch's weights fought the brief.** The S was the heavier form and broke the shaft, so "cross first"
  needed a structural change, not tuning. That cost a round.

The references and four rounds took about a million subagent tokens. Round 1 was the one that taught the lesson.

## The principle, stated generally

A mark or icon that must work at several sizes needs a separate drawing for the smallest size, judged in the
place it will actually appear and beside the thing it is most likely to be mistaken for. Shrinking the master
and checking it on a neutral swatch tests the wrong thing: legibility depends on the surroundings and on what
the reader expects to see there.

## Where else it fits

- **Favicons, app icons, section ornaments and inline glyphs**: the same mark at 16px needs its own cut.
- **Any UI element whose meaning depends on context**: a status dot, a badge, a chart marker. Render it in the
  real component, not a style guide.
- **Reviewing LLM-produced design work generally**: the generator judges its own output on the sheet it made;
  the decisive check is the real page. This repeats the 5 Nov lesson (judge at the real size, in the set), now
  for the second time, which is why it is written down.

## Rules of thumb

- **Draw the smallest cut on purpose,** as its own shape, before polishing the master.
- **Render every candidate on the real surface** each round (here, real covers from a local build), not only on
  a sheet.
- **Put the likely misreading beside it** at the same pixel size: the "$", the competitor's logo, the warning icon.
- **Don't keep detail that half-survives.** At small sizes a gap or hatch either reads clearly or should go.
- **When the source sketch's weights contradict the brief, say so in round 1** and offer the structural fix.
