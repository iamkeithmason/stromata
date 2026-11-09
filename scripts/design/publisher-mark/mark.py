"""The Stromata publisher's mark, round 4: F, a polish of E (round 3).

- The cross is cut as separate knife strokes, one per edge between corners, overshooting a little at
  the outer corners as the accepted tower's lines do; heavier than E, and twice as heavy again on
  the edges that face the down-right shadow. Denser hatching down the post's shadow side.
- The beam between the S and the boss is one solid cut beam, not two rails.
- The boss is solid with two short arc cuts on its shadow side (no crescent).
- The S's shading cuts start pointed, so no tab where it comes out from behind the post.
- The small cut follows the heavier cross; still solid and cross-first.

    python3 mark4.py      # writes mark-F-print.svg, mark-F-small.svg
"""
import json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.ops import unary_union
from shapely.validation import make_valid
from shapely.geometry.polygon import orient
import markkit as mk
from markkit import *
from lib import resample, normals, wobble, catmull, SHADOW
import mark2 as m2
import mark3 as m3          # E: composition, contour(), the S, upright/arm/boss shapes and mapping

def the_s(k=1.0, add=0):
    # E's S; the knife cut that squares off the upper terminal is now kept clear of the spine (in E
    # its lower corner nicked the spine's top edge, which showed as a tab where the S leaves the post)
    body = stroke(m3.S_PTS, lambda u: m2.s_width(u, k, add), ends=('join', 'point'), centres=None,
                  shade=0, amp=0.06, seed=7, tl=(None, 5.0), slant=(1, -1))
    return body.difference(poly([(640, 498), (800, 512), (800, 578), (640, 578)]))
m3.the_s = the_s

inv = lambda q: ((q[0]-50)/mk.SK_S+mk.SK_CX, (q[1]-50)/mk.SK_S+mk.SK_CY)
yint = m3.yinterp

# ------------------------------------------------------------------ the cross, heavier
PROF = yint([(m3.TOP, 200), (m3.TOP+36, 150), (m3.TOP+110, 128), (230, 128), (300, 146), (600, 154),
             (1000, 146), (1128, 140), (1160, 166), (m3.FOOT, 224)])
def upright():
    return stroke(m3.UP_PTS, lambda u: px(PROF(m3.TOP+u*(m3.FOOT-m3.TOP))), ends=('join', 'join'),
                  centres=None, shade=0, amp=0.05, seed=11)

def arms():
    h_in, h_out = 56, 128
    cy = 362; xl, xr = 34, 942
    L = m2.sagged([(xl, cy-h_out), (470, cy-h_in), (470, cy+h_in), (xl, cy+h_out)], [0.035, 0, 0.035, 0.07])
    R = m2.sagged([(506, cy-h_in), (xr, cy-h_out), (xr, cy+h_out), (506, cy+h_in)], [0.035, 0.07, 0.035, 0])
    return poly(L), poly(R)

# ------------------------------------------------------------------ knife strokes along the edges
def _turns(c, reach=0.6):
    n = len(c); C = np.r_[c, c, c]; out = np.zeros(n)
    def tan(i, sg):
        acc = 0; j = i
        while acc < reach:
            k = j+sg; acc += np.linalg.norm(C[k]-C[j]); j = k
        v = C[j]-C[i]; return v/np.linalg.norm(v)
    for i in range(n):
        tb, tf = tan(i+n, -1), tan(i+n, 1)
        out[i] = 180-np.degrees(np.arccos(np.clip(np.dot(tb, tf), -1, 1)))
    return out

def knife_outline(sil, base, shade=0.75, amp=0.16, ov=0.55, seed=1, corner_deg=40):
    """one knife stroke per edge between corners, its outer side on the silhouette's edge, width
    swelling and thinning (seeded) and heavier where the edge faces the shadow; each stroke runs on
    past a convex corner by `ov` units and is cut off on the slant there."""
    rng = np.random.default_rng(seed)
    polys = list(sil.geoms) if isinstance(sil, MultiPolygon) else [sil]
    strokes = []
    for p in polys:
        c = np.array(orient(p, 1.0).exterior.coords)[:-1]
        c, s, L = resample(c, step=0.2, closed=True)
        n, t = normals(c, closed=True)
        if np.mean([p.contains(Point(q)) for q in (c+n*0.05)[::5]]) < 0.5: n = -n
        tu = _turns(c)
        k = len(c)
        cs = [i for i in range(k) if tu[i] > corner_deg and tu[i] >= tu[(i-1) % k] and tu[i] >= tu[(i+1) % k]]
        # merge corners closer than 0.6 units
        cs2 = []
        for i in cs:
            if not cs2 or (i-cs2[-1]) > 3: cs2.append(i)
        cs = cs2
        def convex(i):
            a, b = c[(i-3) % k], c[(i+3) % k]
            return p.contains(Point((a+b)/2))
        for j, i0 in enumerate(cs):
            i1 = cs[(j+1) % len(cs)]
            idx = list(range(i0, i1+1)) if i1 > i0 else list(range(i0, k))+list(range(0, i1+1))
            if len(idx) < 4: continue
            P = c[idx]; N = n[idx]
            # edge normal for the whole stroke (smoothed), and its shadow factor
            f = np.convolve(np.sum(-N*SHADOW, 1), np.ones(9)/9, mode='same')
            w = base*np.clip(1+shade*f, 0.55, 1.9)
            # overshoot past convex corners, along the edge's own direction
            t0 = P[1]-P[0]; t0 /= np.linalg.norm(t0); t1 = P[-1]-P[-2]; t1 /= np.linalg.norm(t1)
            pre = [P[0]-t0*ov*q for q in (1.0, 0.5)] if convex(i0) else []
            post = [P[-1]+t1*ov*q for q in (0.5, 1.0)] if convex(i1) else []
            P2 = np.r_[np.array(pre).reshape(-1, 2), P, np.array(post).reshape(-1, 2)]
            N2 = np.r_[np.repeat(N[:1], len(pre), 0), N, np.repeat(N[-1:], len(post), 0)]
            W2 = np.r_[np.repeat(w[:1], len(pre)), w, np.repeat(w[-1:], len(post))]
            Ls = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P2, axis=0), axis=1))]
            W2 = W2*wobble(Ls, Ls[-1], rng, amp)
            # chiselled ends: a short taper, then cut off on the slant (one side shorter)
            tl = min(1.2, Ls[-1]/3)
            W2 = W2*np.minimum(1, 0.55+0.45*np.clip(np.minimum(Ls, Ls[-1]-Ls)/tl, 0, 1))
            outer = P2 - N2*0.15*W2[:, None]               # a hair outside the edge: the knife's lip
            inner = P2 + N2*0.85*W2[:, None]
            cut = 2
            ring = np.r_[outer[cut:], inner[::-1][cut:]] if len(P2) > 8 else np.r_[outer, inner[::-1]]
            strokes.append(make_valid(Polygon(ring)).buffer(0))
    return unary_union(strokes)

# ------------------------------------------------------------------ hatching
def cross_hatches():
    H = []
    ux = lambda y: np.interp(y, [p[1] for p in m3.UP_PTS], [p[0] for p in m3.UP_PTS])
    pr = lambda y: PROF(y)/2
    # the post: five cuts down its shadow (right) half, nearest the edge longest and heaviest
    for k, (off, y0, y1, w) in enumerate([(54, 470, 1150, 1.25), (78, 500, 1110, 1.1), (101, 560, 1040, 0.95),
                                          (123, 640, 960, 0.8), (144, 730, 880, 0.65)]):
        H.append(m3.hatch_line([(ux(y)+pr(y)-off, y) for y in np.linspace(y0, y1, 6)], w, ('point', 'point'), seed=40+k))
    # the head
    for k, (off, y0, y1, w) in enumerate([(52, m3.TOP+60, 222, 1.15), (76, m3.TOP+90, 180, 1.0), (99, m3.TOP+140, 110, 0.85),
                                          (120, m3.TOP+200, 40, 0.7)]):
        H.append(m3.hatch_line([(ux(y)+pr(y)-off, y) for y in np.linspace(y0, y1, 5)], w, ('point', 'point'), seed=50+k))
    # under the arms, running in from the flared end
    for k, (dy, x1, w) in enumerate([(40, 250, 1.35), (64, 190, 1.1), (86, 130, 0.9)]):
        yl = lambda x: 362+128-(x-34)*(128-56)/(470-34)-dy
        H.append(m3.hatch_line([(54+k*6, yl(54+k*6)), (x1, yl(x1))], w, ('blunt', 'point'), seed=60+k))
        yr = lambda x: 362+128-(942-x)*(128-56)/(942-506)-dy
        H.append(m3.hatch_line([(922-k*6, yr(922-k*6)), (976-x1, yr(976-x1))], w, ('blunt', 'point'), seed=70+k))
    return H

def boss_cuts():
    """two short arc cuts inside the boss on its shadow (lower-right) side"""
    cx, cy = m3.BOSS_C; R = m3.BOSS_R
    arc = lambda r, a0, a1: [(cx+r*np.cos(a), cy+r*np.sin(a)) for a in np.radians(np.linspace(a0, a1, 7))]
    return [cutline(arc(R*0.70, -5, 80), 0.85, 0.35), cutline(arc(R*0.45, 15, 65), 0.65, 0.3)]

def s_cuts():
    H = []
    for k, (u0, u1, side, f, w) in enumerate([(0.572, 0.65, +1, 0.30, 0.9), (0.58, 0.62, +1, -0.02, 0.7),
                                              (0.815, 0.76, -1, 0.30, 0.95), (0.805, 0.78, -1, -0.02, 0.75),
                                              (0.205, 0.255, -1, 0.28, 0.8)]):
        pts = []
        for u in np.linspace(u0, u1, 6):
            c, t, n = m3.s_frame(u); hw = m2.s_width(u)*1.08/2
            pts.append(inv(c+n*side*hw*f))
        H.append(m3.hatch_line(pts, w, ('point', 'point'), seed=80+k))
    return H

# ------------------------------------------------------------------ assembly
def make_print(g=0.95, cw=3.6, sw=1.95):
    up = upright(); bs = m3.boss(False); al, ar = arms()
    S = m3.the_s(k=1.08)
    front = unary_union([up, bs])
    cross = unary_union([front, al, ar])
    beam = unary_union([al, ar])
    arms_only = beam.difference(front.buffer(0.3))
    # knife strokes, kept within a short overshoot of the silhouette (no stray lumps beyond it)
    c_out = knife_outline(cross, cw, seed=3).intersection(cross.buffer(0.6, join_style=2))
    s_out, _ = m3.contour(S, sw, shade=0.75, amp=0.25, seed=9)
    inside = cross.buffer(-0.4)
    H = unary_union(cross_hatches()).intersection(inside)
    # the beam between the S and the boss: one solid cut beam
    root = beam.intersection(box(*T((250, 250)), *T((726, 480)))).difference(front)
    boss_fill = bs.difference(unary_union(boss_cuts()))
    cross_ink = unary_union([c_out, H, root])
    # the boss sits in front of the beam: a cream ring parts them, so the boss stays round
    cross_ink = cross_ink.difference(bs.buffer(0.6).difference(bs).difference(up.buffer(-0.2)))
    cross_ink = unary_union([cross_ink.difference(bs), boss_fill])
    S_ink = unary_union([s_out, unary_union(s_cuts()).intersection(S)])
    S_ink = S_ink.difference(front.buffer(g, join_style=2))
    cross_ink = cross_ink.difference(S.buffer(g, join_style=2).intersection(arms_only.buffer(g+0.6)))
    geom = unary_union([cross_ink, S_ink])
    return clean(geom, close=0.2, simp=0.02, min_area=0.25, min_hole=0.12)

SPROF = yint([(m3.TOP, 230), (m3.TOP+40, 186), (m3.TOP+110, 168), (220, 168), (300, 186), (700, 186),
              (1100, 178), (1150, 206), (m3.FOOT, 254)])
def make_small():
    up = stroke(m3.UP_PTS, lambda u: px(SPROF(m3.TOP+u*(m3.FOOT-m3.TOP))), ends=('join', 'join'),
                centres=None, shade=0, amp=0.05, seed=11)
    bs = m3.boss(True)
    h_in, h_out, cy = 74, 146, 362
    L = poly(m2.sagged([(30, cy-h_out), (470, cy-h_in), (470, cy+h_in), (30, cy+h_out)], [0.035, 0, 0.035, 0.07]))
    R = poly(m2.sagged([(506, cy-h_in), (946, cy-h_out), (946, cy+h_out), (506, cy+h_in)], [0.035, 0.07, 0.035, 0]))
    S = m3.the_s(k=1.0, add=10)
    geom = unary_union([up, bs, L, R, S])
    return clean(geom, close=0.5, simp=0.05, min_area=2.0, min_hole=0.8)

if __name__ == '__main__':
    st = {}
    for name, gm, err in (('mark-F-print.svg', make_print(), 0.05), ('mark-F-small.svg', make_small(), 0.08)):
        d = path_d(gm, err=err); open(name, 'w').write(svg_of(d))
        ps = list(gm.geoms) if isinstance(gm, MultiPolygon) else [gm]
        raw = ''.join('M'+'L'.join(f'{x:.3f} {y:.3f}' for x, y in list(r.coords)[:-1])+'Z'
                      for p in ps for r in [p.exterior]+list(p.interiors))
        open('work/'+name.replace('.svg', '-poly.svg'), 'w').write(svg_of(raw))
        st[name] = dict(bytes=len(d), C=d.count('C'), L=d.count('L'), subpaths=d.count('M'))
    print(json.dumps(st))
