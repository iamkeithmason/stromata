# The publisher's mark: how it is made

The mark in `lib/brand/mark.ts` is an S wound through a cross, after the bronze serpent lifted up
(Numbers 21:4–9; John 3:14–15). Keith designed and inked it in April 2026 (`sketch/keith-sketch-ink.png`);
on 9 Nov 2026 it was cut in the hand of the genre ornaments (`../ornaments/`) over four rounds, logged on the
Notion card "Woodcut publisher's mark: the S woven with a cross".

## Rebuild and check

```
pip install numpy shapely cairosvg pillow
python3 scripts/design/publisher-mark/build.py              # both cuts
python3 scripts/design/publisher-mark/build.py --out=/tmp/m # also keep the SVGs
```

`build.py` runs `mark.py` in a scratch directory and compares each path with the `d` stored in
`lib/brand/mark.ts`, byte for byte, exiting 1 on any difference. To change the mark, edit `mark.py`, rebuild,
paste the new path into `lib/brand/mark.ts` (never edit a path by hand), then run `npm run mark:svg` so
`public/mark/` follows; `lib/brand/mark.test.ts` fails until it does.

## What is here

- **`mark.py`** draws both cuts in the pixel space of Keith's sketch. It builds on **`mark2.py`** and
  **`mark3.py`** (the geometry of rounds 2 and 3, which round 4 refined) and on **`markkit.py`** (the cut
  outline, knife strokes, hatching, and the Schneider curve fitting that turns the cut polygons into smooth
  cubic Béziers). **`lib.py`** is an unchanged copy of the ornaments' stroke library.
- **`sketch/`**: Keith's inked sketch and the John 3:14 picture he shared for the feel.
- **`sources/`**: the period references studied before drawing (Froben's device, Holbein's *Numeri XXI*, the
  Froschauer initial V, Solis, Beham, Bolswert, an anonymous *Law and Grace* woodcut, Fradin's and Plantin's
  marks, a Mosan enamel), downscaled; `sources/licence/` holds each holder's record. Nothing was copied from
  them; they guided the cutting.

## The two cuts

- **Print** (`print`): a woodcut. The cross is cut as separate knife strokes that overshoot at the corners,
  heavier on the shadow side, with hatching down the post and under the arms; the S is two outlines, thin on
  the lit side. Smooth curves, checked at 60mm and 300 dpi. For printed books and screen sizes from about
  160px up.
- **Small** (`small`): a solid silhouette drawn for its size, the cross leading, for the cover band (about
  10–14px) and the reader frontispiece (about 6px). Gaps in the weave do not survive at that size and brought
  back a dollar sign, so the small cut merges cross and S into one shape.

## What Keith decided, and why

- **The S is a letterform, not a creature.** No head, eye or scales; the serpent reading comes only from the S
  winding through the cross. The lower-left barb is the S's chiselled end.
- **The cross reads first**, so the serpent reads as redemptive. Round 1 followed the sketch's weights and read
  as "$" at cover size; the fix was long arms reaching past the S, a round boss, and no bar below the S.
- **The shaft passes in front of the S at every crossing** (version B), so the cross reads whole.
- **The print master is a woodcut like the ornaments**, not a filled shape close to the sketch.
