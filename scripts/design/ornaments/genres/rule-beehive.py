"""Rule: a straw skep. Traced from Marcus Gheeraerts the Elder, 'The Bear and the Bees', etching for
De warachtighe fabulen der dieren (Bruges: Pieter de Clerck, 1567), Rijksmuseum RP-P-1996-70 (Public
Domain Mark; IIIF iiif.micr.io/XDrVr). Coordinates are pixels of sources/rule-beehive-gheeraerts.png
(the upright skep on the shelf, 700 px across).
Kept: the bell profile (narrow domed crown, flanks swelling out to a wide foot, the left flank steeper),
the coils as sagging rounds that wrap the body, the dark arched flight-hole at the foot, the shelf.
Simplified: ~14 coils become 7 cut bands, broken where the straw turns into light; the swarm becomes
two bees, drawn as Weiditz draws them (Petrarca-Meister woodcut, Rijksmuseum RP-P-1874-11-4-3):
a body with two wings in a V."""
import sys; sys.path.insert(0, '.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv) > 1 else 'A'
o = Orn(seed=97)
C = (455, 360)
OUT = [(246,574),(258,520),(266,440),(282,340),(312,236),(358,150),(412,104),(462,94),(516,114),(566,170),(608,258),(636,362),(652,470),(670,574)]
o.cut(OUT, w=1.1, ends=('blunt','blunt'), out=C, shade=0.5, amp=0.14)
co = catmull(OUT)
def xs_at(y):
    """left and right x of the outline at height y"""
    l = co[co[:,0] < 460]; r = co[co[:,0] >= 460]
    xl = np.interp(y, l[::-1,1], l[::-1,0]) if True else 0
    xr = np.interp(y, r[:,1], r[:,0])
    return xl, xr
rng = np.random.default_rng(5)
ROWS = (170, 236, 302, 368, 432, 494) if V != 'B' else (178, 262, 346, 430, 510)
for k, y in enumerate(ROWS):
    xl, xr = xs_at(y)
    wd = xr - xl
    sag = 0.09*wd + 4                       # ellipse front: the coil hangs lower in the middle
    lift = 10 + k*1.5
    def P(f):
        x = xl + f*wd
        return (x, y + sag*np.sin(np.pi*f) - lift*(1 - np.sin(np.pi*f)) + rng.normal(0, 2))
    gap = rng.uniform(0.18, 0.34)          # a break where the straw catches the light, left of centre
    a = [P(f) for f in np.linspace(0.04, gap, 4)]
    b = [P(f) for f in np.linspace(gap + rng.uniform(0.05, 0.09), 0.97, 7)]
    w = 0.56 + 0.05*(k % 2)
    if len(a) and gap > 0.2: o.cut(a, w=w*0.8, ends=('point', 'chisel'), tl=(20, None))
    o.cut(b, w=w, ends=('chisel', 'join'), out=-1, shade=0.45, swell=0.2, amp=0.18)
    # binding stitches: short oblique nicks hanging off the right half of some coils
    if k % 2 == 1 and V != 'B':
        for f in (0.62, 0.84):
            p = np.array(P(f)); o.wedge(tuple(p), tuple(p + np.array([-9, 22])), w=0.42)
# flight-hole: a dark round-headed arch at the foot
o.blob([(408,574),(410,540),(424,516),(448,506),(472,516),(486,540),(488,574)])
# the shelf it stands on
o.cut([(214,586),(460,590),(712,584)], w=1.25, ends=('chisel','chisel'), out=1, shade=0.4, slant=(1,-1))
def bee(cx, cy, s=1.0, a=0.0):
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    T = lambda p: tuple(np.array([cx, cy]) + R @ (np.array(p)*s))
    o.blob([T(q) for q in [(-14,0),(-6,-7),(10,-6),(16,0),(10,6),(-6,7)]])          # body
    o.blob([T(q) for q in [(-4,-5),(-16,-16),(-18,-28),(-10,-30),(-2,-18)]])                   # wings, a V
    o.blob([T(q) for q in [(4,-5),(10,-20),(20,-28),(26,-22),(12,-6)]])
bee(690, 150, 2.2, -0.35)
if V != 'C': bee(600, 40, 1.7, 0.3)
o.build(fit=94, ws=1.0)
# a cream cut down the light (left) flank, as the etcher leaves it
o.carve((318, 250), (290, 430), w0=1.0, w1=0.3)
svg = o.svg(); open(f'variants/rule-beehive-{V}.svg', 'w').write(svg)
