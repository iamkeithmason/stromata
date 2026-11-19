"""Hymn: a harp, traced from Lucas Cranach the Elder, 'A Silver Statuette of an Angel Playing the Harp',
from the Wittenberg Heiltumsbuch (woodcut, 1509; Met 432301, public domain). Coordinates are pixels of
sources/hymn-harp-woodcut.png. Kept: the Gothic frame (straight soundbox, bowed neck, long curved
fore-pillar cut as a heavy line with a thinner companion), the scroll on the head, vertical strings.
The angel's arm hides the lower soundbox in the source; it is completed along the visible line.
Simplified: the head's foliate scroll becomes one curl; the tuning-pin row becomes a few nicks."""
import sys; sys.path.insert(0,'.')
from lib import *
import numpy as np
ROT = float(sys.argv[1]) if len(sys.argv)>1 else -5
o = Orn(seed=31)
V = 0.8     # the source harp is held tilted and foreshortened; stand it up a little squatter
_cut, _wedge, _carve = o.cut, o.wedge, None
def sq(p): return (p[0], 400+(p[1]-400)*V)
def cut(pts, **k): return _cut([sq(p) for p in pts], **k)
def wedge(a,b,**k): return _wedge(sq(a),sq(b),**k)
C = (260, 420)
# soundbox: the heavy straight back, widening to the foot
cut([(152,170),(120,380),(84,600),(58,792)], w=1.35, swell=0.15, out=C, shade=0.4, ends=('chisel','point'), tl=(None,40), slant=(1,-1))
# neck: bowed arm from the soundbox up to the head
cut([(146,176),(220,196),(300,198),(370,180),(430,140),(476,92),(506,58)], w=1.15, out=C, shade=0.45, ends=('join','join'))
# head scroll: one curl rolling back over the neck
cut([(498,66),(520,34),(560,22),(598,38),(612,76),(596,110),(562,118),(542,96),(552,72),(574,70)], w=0.9, ends=('join','point'), tl=(None,30))
# fore-pillar: the long bowed column, heavy on its outer (shadow) side
P = [(486,92),(480,190),(462,290),(426,400),(364,520),(282,630),(180,730),(58,792)]
cut(P, w=1.15, out=C, shade=0.42, ends=('join','chisel'))
# its thinner companion line, inside
# strings: vertical, from the neck down to the pillar
def pillar_y(x):
    c = catmull(P); i = np.argmin(abs(c[:,0]-x)); return c[i,1]
for x in (190,232,274,316,358):
    ytop = 202 if x<330 else 194 - (x-330)*0.3
    cut([(x,ytop+6),(x,pillar_y(x)-34)], w=0.3, ends=('blunt','blunt'), amp=0.05)
# tuning-pin nicks under the neck
for x in (216,262,308,354):
    wedge((x,206),(x+6,226), w=0.5)
o.build(fit=92, ws=1.1, rot=ROT)
# the cut line down the pillar: the source cuts it as parallel lines
o.carve(sq((470,220)),sq((262,650)), w0=1.0, w1=0.3)
svg = o.svg(); open('hymn-harp.svg','w').write(svg)
preview(svg, 'work/harp_prev.png', src='sources/hymn-harp-woodcut.png')
