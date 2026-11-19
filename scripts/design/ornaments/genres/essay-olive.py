"""Essay: an olive sprig. Traced from the olive tree of Ortus sanitatis (1499), cap. cccxxi
(Oleum oliuarum), IA n246: its right-hand branch -- a rising twig with lens leaves cut in outline
round a midrib, and round olives each marked with a crescent cut. Kept: the rising twig, the
lens leaf with its central cut, the crescent in the fruit. Simplified: the crowded crown becomes one
sprig of six leaves and three olives; the leaves are slimmed toward the true olive leaf."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extra import *
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
rng = np.random.default_rng(3)
o = Orn(seed=11)
stem = [(170,560),(225,480),(300,400),(370,320),(430,240),(500,160)]
o.cut(stem, w=0.95, ends=('chisel','point'), out=-1, shade=0.35, tl=(None,30))
C = catmull(stem); d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C,axis=0),axis=1))]
def at(f):
    i = min(np.searchsorted(d, f*d[-1]), len(C)-2); t = C[i+1]-C[i]; t /= np.linalg.norm(t)
    return C[i], t
mids = []
# leaves: (position along stem, side, angle off stem, length, width)
for f, side, ang, L, wd in [(0.18,-1,58,175,54),(0.40,-1,52,170,52),(0.56,1,50,165,50),
                            (0.72,-1,46,150,46),(0.86,1,42,135,42),(1.0,0,0,130,40)]:
    p, t = at(f)
    a = np.radians(ang*side); R = np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])
    u = R @ t
    base = p + u*6; tip = base + u*L
    leaf(o, base, tip, wd, bulge=0.42, rng=rng)
    mids.append((base + u*L*0.12, base + u*L*0.78))
# olives: three, on short stalks below the twig (the shadow side)
fruits = []
for f, dx, dy, r in [(0.24, 70, 62, 40), (0.40, 92, 22, 37), (0.10, 46, 104, 37)]:
    p, t = at(f)
    c = (p[0]+dx, p[1]+dy)
    o.cut([tuple(p), ((p[0]+c[0])/2+4, (p[1]+c[1])/2-6), (c[0]-r*0.3, c[1]-r*0.8)], w=0.5, ends=('join','join'))
    o.blob(ellipse(c, r*1.08, r, rot=-35, n=40))
    fruits.append((c, r))
o.build(fit=92, ws=1.0)
for a, b in mids: o.carve(tuple(a), tuple(b), w0=1.0, w1=0.25)
for c, r in fruits: crescent(o, c, r*0.58, 195, 290, r*0.3)
svg = o.svg(); open(f'{OUT}/essay-olive.svg', 'w').write(svg)
print('coverage', round(coverage(svg), 3))
if len(sys.argv) > 2: preview(svg, sys.argv[2], src=os.path.join(os.path.dirname(__file__), '../essay-olive-woodcut.png'))
