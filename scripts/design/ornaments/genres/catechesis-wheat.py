"""Wheat, pass 4: slender ear of alternating cut kernels (stepped edge), splayed awns, gentle lean."""
import sys; sys.path.insert(0,'.')
from lib import *
import numpy as np
V = sys.argv[1] if len(sys.argv)>1 else 'A'
cfg = dict(
  A=dict(rot=18, n=5, leaf=False, awns='five', kw=62, notch=True, gap=False),
  B=dict(rot=12, n=5, leaf=True,  awns='three', kw=62, notch=True, gap=False),
  C=dict(rot=13, n=6, leaf=True,  awns='five',  kw=56, notch=True, gap=False),
)[V]
o = Orn(seed=21)
rng = np.random.default_rng(4)

def kernel(base, tip, wmax, side, notch):
    """a cut kernel: flat (chisel) base, swelling body, sharp tip; heavier on the shadow (right) half"""
    B, T = np.array(base,float), np.array(tip,float)
    L = np.linalg.norm(T-B); u = (T-B)/L; p = np.array([-u[1], u[0]])
    ts = np.linspace(0.0, 1.0, 26)
    h = wmax * np.sin(np.pi*np.clip(ts*0.92+0.08,0,1))**0.75 * (1-0.25*ts)
    h *= 1 + 0.06*np.sin(ts*9 + rng.uniform(0,6))
    hr = h*(1.12 if side>0 else 0.95); hl = h*(0.95 if side>0 else 1.12)
    left = [B + u*L*t + p*w for t,w in zip(ts, hl)]
    right = [B + u*L*t - p*w for t,w in zip(ts, hr)]
    pts = left + right[::-1]
    o.poly([tuple(q) for q in pts])
    if notch:   # a white cut down the kernel: done later by subtracting, recorded here
        cuts.append((B + u*L*0.28 + p*side*-0.15*wmax, B + u*L*0.8 + p*side*-0.05*wmax))
cuts = []
# rachis
o.cut([(0,360),(0,220),(1,60)], w=0.5, ends=('join','chisel'))
# kernels: alternating, overlapping, leaning outward so their tips step the outline
ys = np.linspace(336, 96, cfg['n']*2)
for i,y in enumerate(ys):
    side = 1 if i%2==0 else -1
    taper = 1 - 0.35*(330-y)/260            # ear narrows toward the top
    kw = cfg['kw']*taper
    if cfg['gap']:
        base = (side*9, y); tip = (side*(34*taper+12), y-70*(0.8+0.2*taper))
    else:
        base = (side*3, y); tip = (side*(48*taper+14), y-82*(0.8+0.2*taper))
    kernel(base, tip, kw/2, side, cfg['notch'])
# top kernel
kernel((0,96),(1,10), cfg['kw']*0.5*0.62, 1, False)
# awns: long, few, splayed
if cfg['awns']=='three':
    A = [((1,20),(4,-92)), ((-26,44),(-104,-50)), ((28,40),(108,-44))]
else:
    A = [((1,20),(2,-96)), ((-18,34),(-58,-80)), ((20,30),(66,-74)), ((-34,74),(-126,0)), ((36,68),(132,8))]
for (x0,y0),(x1,y1) in A:
    o.cut([(x0,y0),((x0+x1)/2+(x1-x0)*0.02,(y0+y1)/2),(x1,y1)], w=0.34, ends=('blunt','point'), tl=(None,70), amp=0.06)
# stem
o.cut([(0,350),(-1,380),(-3,404)], w=0.85, ends=('join','chisel'), out=-1, shade=0.3)
if cfg['leaf']:
    o.cut([(-1,392),(-44,356),(-96,296),(-136,214)], w=0.62, swell=0.65, ends=('join','point'), tl=(None,70), out=(-40,340))
    for t in (0.3,0.48):
        x = -1 - t*135; y = 392 - t*178
        o.wedge((x-12,y+2),(x+2,y-16), w=0.4)
o.build(fit=94, rot=cfg['rot'], ws=1.0)
for p0,p1 in cuts: o.carve(tuple(p0), tuple(p1), w0=1.2, w1=0.3)
svg = o.svg(); open(f'wheat-{V}.svg','w').write(svg)
preview(svg, f'work/wheat{V}_prev.png', src='../sources/catechesis-wheat-woodcut.png')
