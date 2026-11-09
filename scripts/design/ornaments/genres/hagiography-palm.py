"""Hagiography: the martyr's palm (pass 4). Traced from Martin Schongauer, Saint Agnes (engraving,
1470-91; Met 367023, isPublicDomain true): the palm she holds up beside her, a long frond whose rachis
rises from the fist and curves over to a fine tip, its narrow leaflets lying close along it, pointed and
angled toward the tip. Coordinates are pixels of sources/hagiography-palm-schongauer-agnes.png
(440 px across).
Kept: the long, gently curving rachis carried on the diagonal, the bare stalk below the fist, the
narrow pointed leaflets set at an acute angle, the whole frond tapering to a point.
Changed: Schongauer shows the leaflets mostly on the upper side (the frond is seen edge-on); here they
are set on both sides as a herringbone so the frond reads as a leaf-shaped palm at 30 px.
Variants: A herringbone, leaflets straight, both sides; B the same with leaflets bowed outward and a
cream cut down the rachis; C after the engraving more literally, long leaflets on the upper side, short
ones below."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
ROT = float(sys.argv[2]) if len(sys.argv) > 2 else -6
o = Orn(seed=83)
rng = np.random.default_rng({'A': 3, 'B': 5, 'C': 7}[V])
# the engraving's frond turned to lie on the diagonal of the square (composition space ~900 px)
RA = [(70,920),(110,800),(170,670),(250,540),(350,420),(470,310),(600,220),(740,160),(880,140)]
o.cut(RA, w=0.9, ends=('chisel','point'), tl=(None,120), swell=0.25, out=-1, shade=0.4, amp=0.08)
cR = catmull(RA); d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(cR, axis=0), axis=1))]
def at(f):
    i = min(np.searchsorted(d, f*d[-1]), len(cR)-3); t = cR[i+2]-cR[i]; t /= np.linalg.norm(t)
    if t[1] > 0: t = -t
    return cR[i], t
def rot(v, deg):
    a = np.radians(deg); return np.array([v[0]*np.cos(a)-v[1]*np.sin(a), v[0]*np.sin(a)+v[1]*np.cos(a)])
F0, F1 = 0.27, 0.985
def env(f):            # the frond's leaf shape: full a third of the way up, running out to the tip
    x = (f - F0)/(F1 - F0)
    return np.clip(np.sin(np.pi*np.clip(x, 0, 1)**0.75)**0.9, 0, 1)*0.92 + 0.08*(1-x)
N = {'A': 10, 'B': 9, 'C': 10}[V]
LMAX = {'A': 330, 'B': 350, 'C': 360}[V]
carve_axis = []
for side in (+1, -1):          # +1: upper-left side, -1: lower-right
    for k in range(N):
        f = F0 + (F1 - F0)*(k + (0.5 if side < 0 else 0) + rng.normal(0, 0.12))/N
        if f > 0.955: continue
        p, t = at(f)
        x_ = (f - F0)/(F1 - F0)
        ang = (52 - 26*x_)*(1.0 if side > 0 else 0.92) + rng.normal(0, 3)
        u = rot(t, -ang*side)             # leaflet direction: off the rachis, toward the tip
        L = LMAX*env(f)*rng.uniform(0.88, 1.08)
        if V == 'C' and side < 0: L *= 0.55
        if L < 22: continue
        nrm = np.array([-u[1], u[0]])
        bow = {'A': 0.06, 'B': 0.16, 'C': 0.10}[V]*L*side
        pts = [p + u*3, p + u*L*0.5 + nrm*(-bow), p + u*L]
        w = (0.6 if side > 0 else 0.64)*(0.7 + 0.3*env(f))
        o.cut([tuple(q) for q in pts], w=w, ends=('blunt', 'point'), tl=(None, L*0.55), swell=0.35, amp=0.15,
              out=side, shade=0.3)
o.build(fit=95, ws=1.0, rot=ROT)
if V == 'B':
    # a cream cut along the rachis where it catches the light
    a, _ = at(0.30); b, _ = at(0.80)
    o.carve(tuple(a + np.array([-3, 0])), tuple(b + np.array([-1, -2])), w0=0.7, w1=0.25)
# where the fist held it: a cut across the stalk
o.carve((60, 846), (104, 864), w0=0.8, w1=0.4)
svg = o.svg(); open(f'variants/hagiography-palm-S{V}.svg', 'w').write(svg)
