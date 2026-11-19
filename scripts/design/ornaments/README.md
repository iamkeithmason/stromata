# Genre ornaments: how they are made

The seventeen genre ornaments in `lib/genres/ornaments.ts` (on every book cover, and on `/design/visual`) are traced from woodcuts and prints
made before 1600. This folder keeps everything needed to rebuild them, change one, or add another in the same
hand. The method and what it cost are written up in
`docs/research/2026-11-05-carry-the-rejections-into-the-brief.md`.

## Rebuild and check

```
pip install numpy shapely cairosvg pillow
python3 scripts/design/ornaments/build.py              # all seventeen
python3 scripts/design/ornaments/build.py Hymn Poem    # some
python3 scripts/design/ornaments/build.py --out=/tmp/o # also keep the SVGs
```

`build.py` runs each genre's script in a scratch directory and compares the path it draws with the `d` the site
stores for that genre, byte for byte. It prints `ok` for each match and exits 1 on any difference, so the scripts
and the site cannot drift apart unnoticed. To change an ornament, edit its script, rebuild, paste the new path
into `lib/genres/ornaments.ts` (never edit a path by hand), then run `npm run ornaments:svg` so the cover masks in
`public/ornaments/` follow; `lib/genres/ornaments.test.ts` fails until they do.

## What is here

- **`lib.py`**: the stroke builder. Every mark is a polygon: lines swell and thin (seeded), carry extra weight on
  the down-right shadow side, end blunt, chiselled or pointed, and meet with mitred joins. It also does wedge
  hatches, cream cut lines inside a shape, and the union and smoothing into one evenodd path on a 0 0 100 100
  box. `extra.py` adds solid lens leaves and crescent cuts for the herbal plants.
- **`genres/<genre>-<object>.py`**: one script per ornament. Each sets centrelines by hand, in the pixel
  coordinates of its source crop, and calls the library. Four passes by different agents wrote them, so their
  arguments and output names vary; `RECIPES` in `build.py` records the arguments that produce the accepted
  version of each.
- **`sources/`**: the crop each ornament was traced from, downscaled to 1200px (reference only; the scripts do
  not read them). `sources/licence/` holds each holder's own licence record.

## Sources and licences

| Genre | Object | Traced from | Licence (holder's record) |
|---|---|---|---|
| Sermon | fish | *Ortus sanitatis*, Strasbourg: Prüss, 1499, Fastaleon | Internet Archive `ortussanitatis00prss`, Public Domain Mark |
| Meditation | lily | *Ortus sanitatis*, Lilium | same |
| Poem | rose | *Ortus sanitatis*, Rosa | same |
| Catechesis | ear of spelt | *Ortus sanitatis*, Spelta | same |
| Essay | olive sprig | *Ortus sanitatis*, Oleum oliuarum | same |
| Commentary | vine | *Ortus sanitatis*, Vitis | same |
| Dialogue | pomegranate | *Ortus sanitatis*, Granatum | same |
| Homily | loaf | Dürer, *The Last Supper*, woodcut, 1523 | Met 388129, public domain |
| Prayer | candle | Zündt, *Candlestick with Lighted Candle*, etching, 1551 | Met 406041, public domain |
| Exegesis | key | Baldung Grien, *St Peter*, woodcut, 1519 | Met 416871, public domain |
| Hymn | harp | Cranach the Elder, angel with harp, Wittenberg *Heiltumsbuch*, 1509 | Met 432301, public domain |
| Rule | straw skep | Gheeraerts I, *The Bear and the Bees*, etching, 1567 | Rijksmuseum RP-P-1996-70, Public Domain Mark |
| Apology | tower | Nuremberg Chronicle, 1493, view of Jerusalem | Internet Archive `A335110`, Public Domain Mark |
| Treatise | open book | Nuremberg Chronicle, the doctors' books | same |
| Confession | heart and arrow | Cranach the Elder, Sacred Heart, woodcut, 1505; arrow after the Chronicle | Met 625309, public domain |
| Letter | quill | Palatino, *Libro … a scrivere*, Rome 1548 | Internet Archive `bub_gb_TM7Y4eNQfcMC`, Public Domain Mark |
| Hagiography | martyr's palm | Schongauer, *St Agnes*, engraving, c. 1470–91 | Met 367023, public domain |

Wikimedia Commons refuses cloud sessions, so every source came from the Internet Archive, the Met or the
Rijksmuseum. Check a new source's licence in the holder's own metadata before tracing it.

## Adding or redrawing one

What Keith accepted, and what he turned down, matters more than the code:

- **Cut, not drawn.** He turned down filled silhouettes (lumpy) and even-weight line art with round ends (read as
  modern UI icons). Brief any agent with both rejections, not just the target.
- **Judge at the real size, in the set.** A piece that passes alone at 160px can fail at 30–40px or beside a
  neighbour (the wheat read as a corn cob; the palm passed for grass beside the wheat). Show the source, the
  previous attempt, the new one at 30/40/64/160px, and the whole set in a row at 40 and 30px.
- **After two failed passes, change the object.** The column became a stick at any proportion, so Treatise
  became an open book. The flaming heart read as a strawberry three times, so Confession uses the arrow.
