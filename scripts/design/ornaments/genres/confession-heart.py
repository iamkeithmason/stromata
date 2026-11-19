"""Confession: the heart. Outline traced from Lucas Cranach the Elder, 'Four Saints Adoring Christ
Crucified on the Sacred Heart' (woodcut, 1505; Met 625309, isPublicDomain true). Coordinates are pixels of
sources/confession-heart-cranach.png (800 px across, the heart and its frame).
Kept: the broad heart with two full lobes, the left flank cut as a rolled edge with hatching that follows
the curve, Cranach's small tailed flame-drops scattered over the right half.
Changed: the cleft is cut deeper and the foot drawn to a point (Cranach's foot is blunt and hidden by a
banderole); the crown and the Crucifixion are left out.
Variant A, flaming (Augustine): three flame tongues from the cleft, their form taken from the flame in
Matthias Zuendt's Candlestick with Lighted Candle (1551; Met 406041, public domain) -- forked tip, a cream
inner tongue.
Variant B, pierced (Augustine's other emblem): an arrow driven through on the diagonal, its long barbed
head and fletching after the arrows Saint Sebastian holds in the Nuremberg Chronicle (1493, fol. CXXV;
Internet Archive A335110, leaf n292, Public Domain Mark)."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
o = Orn(seed=11)
C = (400, 420)
CL = (400, 180)                        # the cleft
TIP = (400, 790)                       # the point
L = [CL, (360, 120), (290, 88), (200, 92), (118, 136), (66, 214), (52, 316), (72, 430), (128, 548), (210, 650), (306, 735), TIP]
R = [CL, (440, 120), (510, 88), (600, 92), (682, 136), (734, 214), (748, 316), (728, 430), (672, 548), (590, 650), (494, 735), TIP]
o.cut(L, w=1.0, out=C, shade=0.5, ends=('point', 'point'), tl=(14, 30), amp=0.14)
o.cut(R, w=1.08, out=C, shade=0.5, ends=('point', 'chisel'), tl=(14, None), amp=0.14, slant=(1, -1))
# the rolled left edge: an inner companion cut, and hatches between it and the rim, following the curve
RIM = [(150, 190), (112, 262), (104, 350), (126, 450), (176, 548), (246, 636)]
o.cut(RIM, w=0.55, ends=('point', 'point'), tl=(30, 40))
cr = catmull(RIM); co = catmull(L)
for f in np.linspace(0.1, 0.9, 7):
    p = cr[int(f*(len(cr)-1))]
    q = co[np.argmin(np.linalg.norm(co - p, axis=1))]
    o.wedge(tuple(q + (p - q)*0.05), tuple(p + (q - p)*0.15), w=0.48)
# Cranach's tailed flame-drops on the right half: a small head with a curling tail rising from it
def drop(x, y, s=1.0, flip=1):
    o.blob([(x-7*s, y), (x-6*s, y-8*s), (x, y-12*s), (x+6*s, y-8*s), (x+7*s, y), (x, y+8*s)])
    o.cut([(x, y-10*s), (x+5*s*flip, y-22*s), (x-3*s*flip, y-34*s)], w=0.4, ends=('blunt', 'point'), tl=(None, 14*s))
DROPS = [(560, 260), (640, 330), (590, 430)] if V == 'D' else []
for i, (x, y) in enumerate(DROPS): drop(x, y, 2.0, 1 if i % 2 else -1)
# modelling inside the right flank: cuts that follow the contour, heavier low down, as on the left
cRr = catmull(R)
for f0, f1, off, w in ((0.30, 0.52, 46, 0.5), (0.50, 0.78, 44, 0.55), (0.62, 0.86, 92, 0.42)):
    seg = cRr[int(f0*(len(cRr)-1)):int(f1*(len(cRr)-1))]
    d_ = np.array(C) - seg; d_ /= np.linalg.norm(d_, axis=1, keepdims=True)
    pts = seg + d_*off
    o.cut([tuple(p) for p in pts[::6]], w=w, ends=('point', 'point'), tl=(30, 30))
if V == 'A':   # flames from the cleft
    def flame(base, h, wdt, lean, tw=0.0):
        bx, by = base
        pts = [(bx - wdt*0.5, by), (bx - wdt*0.62, by - h*0.25), (bx - wdt*0.45 + lean*0.3, by - h*0.55),
               (bx - wdt*0.1 + lean*0.7, by - h*0.8), (bx + lean, by - h), (bx + wdt*0.12 + lean*0.55, by - h*0.72),
               (bx + wdt*0.4 + lean*0.25, by - h*0.5), (bx + wdt*0.6, by - h*0.22), (bx + wdt*0.5, by)]
        o.blob(pts)
    # Zuendt's flame (coordinates of his candle flame, sources/confession-flame-zundt.png), set in the
    # cleft, with two smaller tongues of it licking out over the lobes
    ZF = [(200,726),(140,690),(116,600),(128,480),(158,380),(170,300),(150,226),(196,286),
          (214,236),(226,160),(252,250),(272,340),(284,450),(288,560),(270,660),(236,712)]
    def flame(bx, by, s, mirror=1, rot=0.0, sx=1.6):
        a_ = np.radians(rot); Rm = np.array([[np.cos(a_), -np.sin(a_)], [np.sin(a_), np.cos(a_)]])
        o.blob([tuple(np.array([bx, by]) + Rm @ np.array([(x-205)*s*sx*mirror, (y-726)*s])) for x, y in ZF])
    flame(400, 230, 0.6)
    flame(300, 160, 0.34, -1, -30)
    flame(500, 160, 0.34, 1, 30)
if V == 'B':   # an arrow through the heart, lower left to upper right
    A0, A1 = np.array([-60., 700.]), np.array([840., 120.])
    u = (A1 - A0)/np.linalg.norm(A1 - A0); n = np.array([-u[1], u[0]])
    # shaft, broken where it passes behind the heart (shown as two lengths)
    o.cut([tuple(A0 + u*40), tuple(A0 + u*250)], w=0.7, ends=('blunt', 'join'))
    o.cut([tuple(A0 + u*800), tuple(A0 + u*950)], w=0.7, ends=('join', 'join'))
    # barbed head
    h0 = A0 + u*940
    o.poly([tuple(h0 - u*10 + n*12), tuple(h0 + u*24 + n*50), tuple(h0 + u*48 + n*16), tuple(h0 + u*150), tuple(h0 + u*48 - n*16), tuple(h0 + u*24 - n*50), tuple(h0 - u*10 - n*12)])
    # fletching: three vanes swept back
    for k in (0, 1, 2):
        b = A0 + u*(60 + k*36)
        o.cut([tuple(b), tuple(b - u*50 + n*58)], w=0.62, ends=('blunt', 'point'), tl=(None, 20))
        o.cut([tuple(b), tuple(b - u*50 - n*58)], w=0.62, ends=('blunt', 'point'), tl=(None, 20))
o.build(fit=92, ws=1.0)
if V == 'A':
    # cream inner tongue in the big flame, as Zuendt cuts it
    o.carve((402, 170), (412, -40), w0=1.6, w1=0.3)
if V == 'B':
    # the shaft's passage through the heart shown as a cream cut
    A0 = np.array([-60., 700.]); u = np.array([900., -580.]); u /= np.linalg.norm(u)
    o.carve(tuple(A0 + u*262), tuple(A0 + u*330), w0=0.6, w1=0.6)
svg = o.svg(); open(f'variants/confession-heart-{V}.svg', 'w').write(svg)
