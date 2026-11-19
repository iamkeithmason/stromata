import sys; sys.path.insert(0,'.')
from lib import *
import numpy as np
def lobes(cx, cy, rx, ry, radii, depth=0.13, rot=-np.pi/2):
    n=len(radii); pts=[]
    for i,r in enumerate(radii):
        a = rot + 2*np.pi*i/n
        pts.append((cx+rx*r*np.cos(a), cy+ry*r*np.sin(a)))
        a2 = rot + 2*np.pi*(i+0.5)/n
        r2 = (r+radii[(i+1)%n])/2*(1-depth)
        pts.append((cx+rx*r2*np.cos(a2), cy+ry*r2*np.sin(a2)))
    return pts
def teeth(o, edge, tip, n, side, length=22, w=0.85):
    """serration: short cuts leaning toward the leaf tip, off one edge"""
    c = catmull(edge); d = np.r_[0,np.cumsum(np.linalg.norm(np.diff(c,axis=0),axis=1))]
    for f in np.linspace(0.22, 0.86, n):
        i = np.searchsorted(d, f*d[-1]); p = c[i]
        t = c[min(i+3,len(c)-1)] - c[max(i-3,0)]; t /= np.linalg.norm(t)
        nn = np.array([-t[1], t[0]])*side
        q = p + nn*length*0.55 + t*length*0.9
        o.wedge(tuple(p - nn*4), tuple(q), w=w)
o = Orn(seed=5)
# bloom: ruffled ring, heavier on the shadow side
o.ring(lobes(135,120,102,94,[1.0,0.97,1.03,0.98,1.02,0.96,1.0]), w=0.95, shade=0.4)
# inner petals: five overlapping petal arcs wrapped round the heart (pass-2 layout, finer cut)
for k in range(5):
    t0 = -np.pi/2 + k*2*np.pi/5 + 0.25
    ts = np.linspace(t0-1.0, t0+0.95, 7)
    ccx, ccy = 135+20*np.cos(t0), 114+18*np.sin(t0)
    o.cut([(ccx+30*np.cos(t), ccy+28*np.sin(t)) for t in ts], w=0.55, ends=('point','chisel'), out=(135,114), shade=0.35)
o.blob([(127,117),(132,106),(143,111),(139,123)])
# hatching: lower right of the bloom, between the heart and the rim
for ang in (112,134,156):
    a = np.radians(ang); r = 86
    p = (135+r*np.cos(a)*1.0, 120+r*np.sin(a)*0.92)
    o.wedge((p[0]-4,p[1]+4), (p[0]+24, p[1]-22), w=0.58)
# stem
o.cut([(168,212),(188,272),(210,350),(230,452)], w=0.95, ends=('join','chisel'), out=-1, shade=0.3)
# bud stalk, sepals and bud
o.cut([(212,352),(238,308),(264,268)], w=0.85, ends=('join','join'))
o.cut([(266,262),(246,226),(256,186),(292,154),(340,128)], w=0.85, out=(300,200), ends=('join','point'))
o.cut([(266,262),(312,250),(340,214),(348,170),(340,128)], w=0.95, out=(300,200), ends=('join','point'))
o.cut([(262,262),(242,240),(236,212)], w=0.72, ends=('join','point'))     # sepal
o.cut([(270,264),(310,262),(338,246)], w=0.72, ends=('join','point'))     # sepal
o.wedge((322,232),(300,196), w=0.5); o.wedge((336,210),(314,170), w=0.5)  # shade on the bud
# left leaf
L_up = [(196,302),(160,272),(110,262),(46,282)]
o.cut(L_up, w=0.85, ends=('join','chisel'), out=(120,290))
o.cut([(196,302),(150,322),(98,320),(46,282)], w=0.95, ends=('join','chisel'), out=(120,290), slant=(1,-1))
o.cut([(188,298),(136,292),(84,288)], w=0.5, ends=('chisel','point'))
teeth(o, L_up, None, 3, side=1)
# right leaf, with hatching on its lower half
R_up = [(222,414),(268,352),(330,320),(416,314)]
o.cut(R_up, w=0.85, ends=('join','chisel'), out=(320,370))
o.cut([(222,414),(300,414),(372,372),(416,314)], w=0.95, ends=('join','chisel'), out=(320,370))
o.cut([(232,406),(304,370),(368,338)], w=0.5, ends=('chisel','point'))
teeth(o, R_up, None, 4, side=-1)
for x in (268,300,332):
    y0 = 412 - (x-222)*0.33
    o.wedge((x+4, y0), (x+22, y0-26), w=0.5)
o.build(fit=92, ws=0.95)
svg = o.svg(); open('poem-rose.svg','w').write(svg)
preview(svg,'work/rose_prev.png', src='../sources/poem-rose-woodcut.png')
