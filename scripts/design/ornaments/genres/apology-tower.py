"""Apology: a strong tower. Traced from the Nuremberg Chronicle (Hartmann Schedel, Liber chronicarum,
Nuremberg: Koberger, 1493; woodcut by Wolgemut/Pleydenwurff workshop), the view of Jerusalem
(Hierosolima), fol. XVII: the tall tower behind the Porta vetus. Internet Archive A335110 (Public Domain
Mark), leaf n76. Coordinates are pixels of sources/apology-tower-nuremberg-jerusalem.png (330 px across).
Kept: the square shaft with its hatched side face and plain front face, the jettied battlemented head on
a corbel band, the two slit windows, the tall round-headed doorway cut dark.
Changed: the battlements are given as merlons standing up from the parapet (the cut shows them as dark
crenels seen from slightly above; upright merlons are what reads at 30 px), and the shaft is shortened
so the tower stands stocky in a square."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
WS = float(sys.argv[2]) if len(sys.argv) > 2 else 0.74
o = Orn(seed=53)
K = 0.95                               # shaft compression below the corbels
def Y(y): return y if y < 130 else 130 + (y-130)*K
def P(pts): return [(x, Y(y)) for x, y in pts]
C = (170, 300)
# ---- head: jettied block, battlemented
TOP, BOT = 40, 104
XL, XR, XM = 22, 314, 166               # left edge, right edge, the corner between side and front
o.cut(P([(XL, TOP-2), (XL+2, BOT+4)]), w=0.9, ends=('chisel', 'join'))
o.cut(P([(XR, TOP), (XR-2, BOT+4)]), w=1.15, ends=('chisel', 'join'), out=1, shade=0.4)
o.cut(P([(XM, TOP+2), (XM, BOT)]), w=0.55, ends=('blunt', 'join'))
o.cut(P([(XL-4, TOP), (XM, TOP-1), (XR+4, TOP+1)]), w=0.9, ends=('chisel', 'chisel'), amp=0.1)
# merlons: solid blocks on the parapet, cut a little out of true
MER = [(XL-4, 40), (60, 40), (104, 40), (146, 40), (190, 40), (236, 40), (280, 40)] if V == 'A' else \
      [(XL-4, 46), (104, 46), (186, 46), (270, 46)]
mw = 30 if V == 'A' else 44
rng = np.random.default_rng(3)
for i, (x, _) in enumerate(MER):
    w_ = mw if i < len(MER)-1 else (XR+4) - x
    if i == len(MER)-1: x = XR+4 - w_
    h = (26 if V == 'A' else 42) + rng.normal(0, 2)
    sk = rng.normal(0, 2.5)
    o.poly(P([(x, TOP+1), (x+sk, TOP-h), (x+w_*0.55, TOP-h-rng.uniform(-1, 3)), (x+w_+sk, TOP-h+rng.uniform(0, 4)), (x+w_, TOP+1)]))
# corbel band under the head: a heavy cut, nicked below
o.cut(P([(XL-2, BOT+6), (XM, BOT+8), (XR+2, BOT+6)]), w=1.5, ends=('chisel', 'chisel'), out=1, shade=0.4, slant=(1, -1))
for x in (52, 92, 132, 200, 244, 288):
    o.wedge(P([(x, BOT+12)])[0], P([(x-4, BOT+30)])[0], w=0.55)
# side-face hatching on the head: oblique cuts, as the cut has them
for x0 in (40, 84, 128):
    o.wedge(P([(x0, TOP+8)])[0], P([(x0+34, BOT-6)])[0], w=0.42, tip='chisel')
# ---- shaft
SY0, SY1 = 132, 520
o.cut(P([(74, SY0), (72, 330), (70, SY1)]), w=0.95, ends=('join', 'blunt'))
o.cut(P([(180, SY0), (179, SY1)]), w=0.6, ends=('join', 'blunt'))
o.cut(P([(264, SY0), (267, 330), (272, SY1)]), w=1.2, ends=('join', 'blunt'), out=1, shade=0.45)
# side-face hatching down the shaft: oblique wedges heavy at the left edge
for y in (160, 226, 292, 358, 424):
    o.wedge(P([(80, y)])[0], P([(160, y+66)])[0], w=0.4, tip='point')
# front: two slit windows and the round-headed doorway, cut dark
o.blob(P([(198, 162), (211, 160), (211, 204), (198, 204)]))
o.blob(P([(234, 162), (247, 160), (247, 204), (234, 204)]))
o.blob(P([(208, 520), (208, 340), (213, 304), (226, 290), (240, 304), (244, 340), (244, 520)]))
# ground: a footing cut wider than the shaft
o.cut(P([(30, 526), (170, 530), (318, 524)]), w=1.3, ends=('chisel', 'chisel'), out=1, shade=0.4, slant=(1, -1))
o.build(fit=94, ws=WS)
# masonry: a few cream courses cut across the front face
for y, x0, x1 in ((244, 190, 256), (420, 190, 204), (420, 248, 258)):
    a, b = P([(x0, y), (x1, y)])
    o.carve(a, b, w0=0.9, w1=0.5)
svg = o.svg(); open(f'variants/apology-tower-{V}.svg', 'w').write(svg)
