"""Letter: a quill pen, after the scribe's-instruments plate in Giovanni Battista Palatino, Libro nel qual
s'insegna a scrivere ogni sorte lettera (Rome, 1548; Internet Archive bub_gb_TM7Y4eNQfcMC, leaf n115;
Public Domain Mark). As in set 2, two objects on the plate are combined: the feathered quill standing
in the inkwell (sources/letter-quill-ink.png: the bowed shaft, the vane carried mostly on the upper
side, barbs swept to the tip) and the large cut pen (sources/letter-quill-nib.png: the long nib with
the scooped cut and the slit). Composition space 0..800, nib lower left, tip upper right.
Set 3: the vane is no longer a solid mass. It is cut as an outline, broken into three runs where the
barbs split, with barb cuts running in from the edge; only the low, full part of the vane next to the
barrel keeps a solid wedge of ink. Variant B adds the rim of Palatino's inkwell under the nib."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
o = Orn(seed=51)
S = [(70,742),(170,640),(300,500),(430,350),(560,210),(670,96),(752,22)]
o.cut(S, w=0.9, out=(300,380), shade=0.4, ends=('join','point'), tl=(None,120))
# nib: the cut point with the scoop under it
o.cut([(176,634),(120,690),(72,742),(34,786)], w=1.25, swell=0.25, ends=('join','point'), tl=(None,50), slant=(1,-1))
UV = [(222,566),(190,470),(220,360),(306,250),(430,140),(580,52),(752,22)]
LV = [(392,392),(470,384),(560,296),(646,190),(712,96),(752,22)]
cS = catmull(S); cU = catmull(UV); cL = catmull(LV)
def sub(c, f0, f1):
    n = len(c); return [tuple(p) for p in c[int(f0*(n-1)):int(f1*(n-1))+1]]
# upper vane edge: three runs, the splits angled in toward the rachis
runs = [(0.0, 0.30), (0.335, 0.62), (0.655, 1.0)]
for i, (a, b) in enumerate(runs):
    seg = sub(cU, a, b)[::3]
    if len(seg) < 3: continue
    o.cut(seg, w=0.72, out=(470,330), shade=0.5, ends=('chisel' if i == 0 else 'point', 'point'), tl=(30, 40))
# lower vane edge: two runs
for a, b in ((0.04, 0.5), (0.54, 1.0)):
    o.cut(sub(cL, a, b)[::3], w=0.5, out=(470,330), shade=0.5, ends=('point', 'point'), tl=(30, 40))
# the full low part of the vane: a solid wedge between barrel and edge (lets the vane read as a vane)
dS = np.r_[0, np.cumsum(np.linalg.norm(np.diff(cS, axis=0), axis=1))]
def at(f):
    i = min(np.searchsorted(dS, f*dS[-1]), len(cS)-2); t = cS[i+1]-cS[i]; return cS[i], t/np.linalg.norm(t)
# a dark inner band of vane along the upper side of the rachis, from the low full part toward the tip
fs = np.linspace(0.25, 0.80, 40)
inner, edge = [], []
for f in fs:
    p, t = at(f); nU = np.array([t[1], -t[0]])          # toward the upper vane
    if nU[1] > 0: nU = -nU
    wdt = 70*np.sin(np.pi*(f-0.25)/0.55)**0.6 + 6
    inner.append(tuple(p)); edge.append(tuple(p + nU*wdt))
o.poly(edge + inner[::-1])
# barbs: cuts heavy at the edge, running in toward the rachis, swept toward the tip
def edge_hit(p, u, curve):
    q = p + u*np.linspace(0, 300, 600)[:, None]
    dd = np.min(np.linalg.norm(q[:, None, :]-curve[None, :, :], axis=2), axis=1)
    ok = np.nonzero(dd < 4)[0]
    return None if not len(ok) else q[ok[0]]
def barbs(fs, side, curve, ang, w, reach=0.62):
    for f in fs:
        p, t = at(f); a = np.radians(ang)*side
        u = np.array([t[0]*np.cos(a)-t[1]*np.sin(a), t[0]*np.sin(a)+t[1]*np.cos(a)])
        e = edge_hit(p, u, curve)
        if e is None: continue
        o.wedge(tuple(e - u*4), tuple(e + (p - e)*reach), w=w)
barbs(np.linspace(0.32, 0.86, 9), -1, cU, 32, 0.5, reach=0.55)
barbs(np.linspace(0.56, 0.84, 3), +1, cL, 30, 0.4)
if V == 'B':   # the rim of the inkwell the pen stands in
    o.cut([(0,792),(60,770),(150,764),(232,780)], w=1.1, ends=('chisel','chisel'), out=1, shade=0.4)
    o.cut([(10,800),(14,860)], w=0.9, ends=('join','chisel'))
    o.cut([(222,786),(218,860)], w=1.05, ends=('join','chisel'), out=1, shade=0.4)
o.build(fit=94, ws=1.0)
# cream barb cuts through the solid low part
for f in (0.36, 0.46, 0.56, 0.66):
    p, t = at(f); a = np.radians(-34)
    u = np.array([t[0]*np.cos(a)-t[1]*np.sin(a), t[0]*np.sin(a)+t[1]*np.cos(a)])
    e = edge_hit(p, u, cU)
    if e is not None: o.carve(tuple(p + u*8), tuple(p + (e-p)*0.5), w0=0.3, w1=1.3)
o.carve((40,780),(92,724), w0=1.0, w1=0.2)          # the nib slit
svg = o.svg(); open(f'variants/letter-quill-{V}.svg', 'w').write(svg)
