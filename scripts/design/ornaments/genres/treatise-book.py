"""Treatise (alternative): an open book. After the open books of the doctors in the Nuremberg Chronicle
(Liber chronicarum, Nuremberg: Koberger, 1493; Internet Archive A335110, Public Domain Mark): Saint
Hippolytus, fol. CXVIII (leaf n278, sources/treatise-book-nuremberg-hippolytus.png), whose book lies open
in a shallow V with its leaves cut as ruled lines, and Aulus Gellius, fol. CXIIII (leaf n270,
sources/treatise-book-nuremberg-gellius.png), whose book shows the stacked page-edges and the board
standing proud of the block. Both are seen at an angle in the cut; here the book is turned to face the
reader, which is composed rather than traced. Composition space 0..1000 x 0..600."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
o = Orn(seed=23)
rng = np.random.default_rng(8)
C = (500, 330)
G0, G1 = (500, 186), (502, 470)                       # the gutter
LT = [(500,186),(430,140),(320,112),(190,118),(76,150)]   # left page top edge
RT = [(500,186),(572,138),(684,108),(812,112),(928,142)]
LB = [(62,420),(180,398),(330,404),(450,432),(502,470)]   # bottom edges
RB = [(502,470),(556,430),(672,400),(822,394),(942,414)]
# pages: top edges, outer edges, bottom edges
o.cut(LT, w=0.8, ends=('join','chisel'), out=C, shade=0.4)
o.cut(RT, w=0.85, ends=('join','chisel'), out=C, shade=0.4)
o.cut([(76,150),(66,290),(62,420)], w=0.85, ends=('join','join'), out=C, shade=0.4)
o.cut([(928,142),(938,280),(942,414)], w=1.05, ends=('join','join'), out=C, shade=0.45)
o.cut(LB, w=0.75, ends=('join','join'))
o.cut(RB, w=0.75, ends=('join','join'))
o.cut([G0, (498,330), G1], w=0.75, ends=('blunt','join'))
# the page block under the leaves: stacked edges, and the board standing proud beneath
for k, dy in enumerate((30,)):
    o.cut([(p[0]+(-6 if p[0] < 500 else 6)*(k+1), p[1]+dy) for p in LB[:-1]] + [(500, 470+dy)], w=0.45, ends=('chisel','join'))
    o.cut([(500, 470+dy)] + [(p[0]+(6)*(k+1), p[1]+dy) for p in RB[1:]], w=0.5, ends=('join','chisel'), out=1, shade=0.4)
o.cut([(30,486),(200,478),(380,500),(500,548),(620,500),(800,476),(972,482)], w=1.05, ends=('chisel','chisel'), out=1, shade=0.45, slant=(1,-1))
o.cut([(30,486),(48,440)], w=0.8, ends=('chisel','join'))
o.cut([(972,482),(954,436)], w=0.95, ends=('chisel','join'))
# ruled text: lines that follow each page's curl, cut in two or three runs, heavy where they start
def text(top, bot, x0, x1, side):
    ct, cb = catmull(top), catmull(bot)
    for f in np.linspace(0.22, 0.82, 5 if V == 'A' else 4):
        xs = np.linspace(x0, x1, 30)
        yt = np.interp(xs, *zip(*sorted(zip(ct[:,0], ct[:,1]))))
        yb = np.interp(xs, *zip(*sorted(zip(cb[:,0], cb[:,1]))))
        ys = yt + (yb - yt)*f
        pts = list(zip(xs, ys))
        cuts = sorted(rng.choice(range(6, 24), 2, replace=False))
        for a, b in ((0, cuts[0]), (cuts[0]+2, cuts[1]), (cuts[1]+2, 29)):
            if b - a < 3: continue
            seg = pts[a:b+1] if side < 0 else pts[a:b+1]
            o.cut(seg[::2] if len(seg) > 4 else seg, w=0.32, ends=('blunt','point'), tl=(None, 16), amp=0.2)
text(LT[::-1], LB, 116, 456, -1)
text(RT, RB[::-1], 548, 890, 1)
if V == 'B':   # a ribbon marker hanging from the foot of the gutter
    o.cut([(504,480),(520,540),(506,600),(530,650)], w=0.75, ends=('join','chisel'), swell=0.2)
o.build(fit=94, ws=0.92, rot=-3)
svg = o.svg(); open(f'variants/treatise-book-{V}.svg', 'w').write(svg)
