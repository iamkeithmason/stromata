"""Commentary: a vine with grapes ('I am the vine'). Traced from Ortus sanitatis (1499), cap. ccccxxiiii
(Vitis), IA n391: a scrolling cane carrying toothed, lobed leaves with cut veins, curling tendrils and a
cluster of round grapes. Kept: the curving cane, one toothed lobed leaf with its veins cut through,
the hanging cluster, one tendril curl. Simplified: four leaves and five tendrils become one leaf
and one curl; the cluster keeps its triangular hang but fewer berries."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extra import *
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
rng = np.random.default_rng(7)
o = Orn(seed=31)
# cane: rises from lower left, bows right, ends at the leaf
cane = [(290,1150),(262,1050),(270,940),(318,830),(352,720),(392,620),(450,548)]
o.cut(cane, w=1.25, ends=('chisel','join'), out=-1, shade=0.4, swell=0.15)
# leaf: the source's centre leaf -- cordate, three main lobes and two small basal ones, saw-toothed.
# Outline authored in a local frame (base at 0,0, axis straight up, length 1), then placed.
LB = np.array([450,548.]); LSIZE = 300; LROT = 38          # degrees clockwise from vertical
HALF = [(0,0.02),(0.14,0.09),(0.32,0.06),(0.47,-0.08),(0.40,-0.20),(0.33,-0.27),(0.52,-0.36),
        (0.66,-0.50),(0.56,-0.58),(0.40,-0.58),(0.27,-0.55),(0.30,-0.70),(0.22,-0.88),(0.04,-1.02)]
TIPS = [(0,-1.0),(0.64,-0.50),(-0.64,-0.50),(0.45,-0.09),(-0.45,-0.09)]
def place(p):
    a = np.radians(LROT); x, y = p
    return LB + LSIZE*np.array([x*np.cos(a) - y*np.sin(a), x*np.sin(a) + y*np.cos(a)])
def leaf_outline():
    half = HALF + [(0,-1.06)]
    full = half + [(-x, y) for x, y in reversed(HALF)]
    c, s_, L = resample(catmull(full, closed=True, n=12), step=0.007, closed=True)
    n_, t_ = normals(c, closed=True)
    if np.mean(np.sum((c - c.mean(0))*n_, 1)) < 0: n_ = -n_
    saw = (s_/0.09) % 1.0                                 # saw teeth leaning toward the lobe tips
    amp = 0.065*np.clip(-c[:,1]*6, 0, 1)                   # no teeth right at the petiole
    c = c + n_*(amp*saw)[:,None]
    return [tuple(place(p)) for p in c]
o.poly(leaf_outline())
# grapes: hang from a stalk off the cane, a triangle of berries pointing down-right
o.cut([(335,790),(400,775),(470,790),(520,820)], w=0.6, ends=('join','join'))
berries = []
rows = [4, 3, 3, 2, 1]
R = 31
for j, n in enumerate(rows):
    for i in range(n):
        cx = 545 + (i - (n-1)/2)*R*1.95 + j*8
        cy = 840 + j*R*1.7
        berries.append((cx, cy))
for c in berries:
    o.blob(ellipse(c, R*0.98, R*0.98, n=24))
# tendril: a curl off the cane on the left
t = np.linspace(0, 2.4*np.pi, 60); rad = 80*np.exp(-0.30*t)
curl = [(250 + rad_*np.cos(t_), 640 - rad_*np.sin(t_)) for t_, rad_ in zip(t, rad)]
o.cut([(345,725),(320,690)] + curl[::3], w=0.62, ends=('join','point'), tl=(None,60))
o.build(fit=92, ws=1.0)
C_ = catmull(cane)                                   # bark: short cream nicks into the cane's right side
for f in (0.14, 0.26, 0.38):
    i = int(f*len(C_)); p = C_[i]; tt = C_[i+2]-C_[i-2]; tt /= np.linalg.norm(tt); nr = np.array([-tt[1], tt[0]])
    if nr[0] < 0: nr = -nr
    o.carve(tuple(p + nr*40 + tt*4), tuple(p + nr*2 - tt*20), w0=1.0, w1=0.2)
# cut the veins through the leaf (cream), from the base toward each lobe
for k, tp in enumerate(TIPS):
    a0 = place((tp[0]*0.06, tp[1]*0.06 - 0.06)); a1 = place((tp[0]*0.8, tp[1]*0.8 - 0.02))
    o.carve(tuple(a0), tuple(a1), w0=1.7 if k < 3 else 1.2, w1=0.3)
# side veins: short cuts off the three main veins, angled toward the lobe edge
for tp in TIPS[:3]:
    for f in (0.36, 0.58):
        b = np.array(tp)*f; tdir = np.array(tp)/np.linalg.norm(tp); nrm = np.array([-tdir[1], tdir[0]])
        for sgn in (1, -1):
            e = b + 0.17*(tdir*0.75 + sgn*nrm)
            o.carve(tuple(place(b)), tuple(place(e)), w0=0.9, w1=0.2)
for c in berries: crescent(o, c, R*0.55, 195, 285, R*0.3)
svg = o.svg(); open(f'{OUT}/commentary-vine.svg', 'w').write(svg)
print('coverage', round(coverage(svg), 3))
if len(sys.argv) > 2: preview(svg, sys.argv[2], src=os.path.join(os.path.dirname(__file__), '../commentary-vine-woodcut.png'))
