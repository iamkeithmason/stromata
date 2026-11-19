"""Additions on top of the accepted woodcut lib (lib.py is a verbatim copy of woodcut/lib.py)."""
import numpy as np
from shapely.geometry import Polygon
from lib import *

def leaf(o, base, tip, w, bulge=0.45, sh=1.15, n=30, rng=None):
    """solid lens leaf in source coords: pointed tip, short-tapered base; the half toward the
    shadow (down-right) is cut a little fuller."""
    B, T = np.array(base, float), np.array(tip, float)
    L = np.linalg.norm(T-B); u = (T-B)/L; p = np.array([-u[1], u[0]])
    ts = np.linspace(0, 1, n)
    prof = np.sin(np.pi*ts)**0.85 * (1 + (bulge-0.5)*(1-2*ts))   # bulge<0.5 -> widest toward tip
    j = 1 + (0.05*np.sin(ts*11 + (rng.uniform(0,6) if rng is not None else 0)))
    side = 1 if np.dot(p, SHADOW) > 0 else -1          # which half faces the shadow
    hl = w/2*prof*j*(sh if side > 0 else 1/sh**0.5)
    hr = w/2*prof*j*(sh if side < 0 else 1/sh**0.5)
    left = [B+u*L*t+p*h for t, h in zip(ts, hl)]
    right = [B+u*L*t-p*h for t, h in zip(ts, hr)]
    o.poly([tuple(q) for q in left + right[::-1]])

def carve_poly(o, pts):
    """cut an arbitrary cream shape (source coords) out of the ink after build()"""
    P = o._map(np.array(pts, float))
    o.geom = o.geom.difference(Polygon(P).buffer(0))
    return o

def crescent(o, c, r, a0, a1, w, n=24):
    """cream crescent cut inside a round fruit: an arc band, tapering to points at both ends"""
    a = np.radians(np.linspace(a0, a1, n)); tw = np.sin(np.linspace(0, np.pi, n))**0.7
    outer = [(c[0]+(r+w*t/2)*np.cos(x), c[1]+(r+w*t/2)*np.sin(x)) for x, t in zip(a, tw)]
    inner = [(c[0]+(r-w*t/2)*np.cos(x), c[1]+(r-w*t/2)*np.sin(x)) for x, t in zip(a, tw)]
    return carve_poly(o, outer + inner[::-1])

def ellipse(c, rx, ry, rot=0, n=28, jit=0.0, rng=None):
    a = np.linspace(0, 2*np.pi, n, endpoint=False)
    r = 1 + (jit*rng.standard_normal(n) if rng is not None else 0)
    x = rx*np.cos(a)*r; y = ry*np.sin(a)*r
    t = np.radians(rot)
    return [(c[0]+x_*np.cos(t)-y_*np.sin(t), c[1]+x_*np.sin(t)+y_*np.cos(t)) for x_, y_ in zip(x, y)]

def coverage(svg, px=400):
    import numpy as np
    im = np.asarray(render(svg, px).convert('L'), float)
    return float((im < 200).mean())
