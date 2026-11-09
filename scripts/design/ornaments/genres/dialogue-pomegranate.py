"""Dialogue: a pomegranate (many seeds, one fruit). Traced from Ortus sanitatis (1499), cap. ccxxii
(Granatum), IA n172: round fruits with a pointed calyx crown, curved rib cuts on the rind, one fruit
burst to show its seeds, on a twig of lens leaves cut round a midrib. Kept: the crowned fruit, the
rib cuts, the burst showing seeds, two lens leaves. Changed: the cut's fruits hang crown-down; here one
fruit stands crown-up on its twig (the usual emblem), and the burst is made larger so the seeds read."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extra import *
from shapely.geometry import Polygon
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
rng = np.random.default_rng(5)
o = Orn(seed=41)
C = np.array([400., 560.]); RX, RY = 190, 178
# rind: an outline ring, as the cut draws it, heavier on the shadow side
body = []
for a in np.linspace(0, 2*np.pi, 18, endpoint=False):
    k = 1 + 0.03*np.cos(a - np.radians(55)) + 0.015*rng.standard_normal()
    body.append((C[0] + RX*k*np.cos(a), C[1] + RY*k*np.sin(a)))
o.ring(body, w=0.9, shade=0.4, amp=0.06)
# a meridian rib on the lit side, running from the crown round the belly
o.cut([(362,425),(305,480),(285,565),(302,645),(345,700)], w=0.55, ends=('chisel','point'), out=(400,560), shade=0.3)
# the burst: two lips opening on the right front, the seeds standing between them
o.cut([(430,418),(500,450),(535,520),(535,600),(492,672)], w=0.6, ends=('chisel','point'), out=(400,560), shade=0.2)
o.cut([(430,418),(410,500),(418,590),(492,672)], w=0.55, ends=('chisel','point'))
# seeds: small faceted grains packed in the burst
for (x, y, r) in [(452,470,15),(482,500,15),(452,515,15),(498,548,14),(468,555,15),(440,560,13),
                  (488,598,14),(458,605,14),(478,640,12)]:
    o.blob(ellipse((x, y), r*1.05, r*0.85, rot=-60, n=6, rng=rng, jit=0.07))
# crown: a short neck and five sepal points (three in front)
o.poly([(352,412),(346,356),(326,326),(298,300),(306,296),(346,318),(356,322),(360,282),(366,262),
        (372,266),(390,316),(398,272),(404,250),(410,254),(416,312),(432,280),(446,266),(450,272),
        (446,322),(458,318),(494,302),(500,308),(470,334),(456,356),(452,412)])
# twig under the fruit, with two leaves
o.cut([(392,720),(370,790),(330,860)], w=1.0, ends=('join','chisel'), out=-1, shade=0.3)
leaf(o, (372,790), (165,750), 82, bulge=0.45, rng=rng)
leaf(o, (360,815), (585,860), 76, bulge=0.45, rng=rng)
o.build(fit=92, ws=1.0)
# leaf midribs
o.carve((350,788), (205,756), w0=1.1, w1=0.25)
o.carve((385,815), (548,852), w0=1.1, w1=0.25)
svg = o.svg(); open(f'{OUT}/dialogue-pomegranate.svg', 'w').write(svg)
print('coverage', round(coverage(svg), 3))
if len(sys.argv) > 2: preview(svg, sys.argv[2], src=os.path.join(os.path.dirname(__file__), '../dialogue-pomegranate-woodcut.png'))
