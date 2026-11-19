"""The Stromata publisher's mark, round 3: E, the print master cut as a woodcut in the hand of the
genre ornaments, on round 2 D's composition (upright in front of the S at every crossing, the S in
front of the arms). Coordinates are pixels of Keith's sketch crop.

Changes from D: a taller head (a Latin cross, not near-Greek), a smaller boss and narrower arm roots
so the S's upper bowl has room; the cross and the S opened up into cut contours (seeded swell and
thin, heavier on the down-right shadow side), hatch cuts down the shadow side of the post, under
the arms and on the head; the boss solid with a crescent cut; a few short cross-cuts on the S.
The small cut stays a solid, merged, cross-first silhouette on the same skeleton.

    python3 mark3.py      # writes mark-E-print.svg, mark-E-small.svg
"""
import json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely.validation import make_valid
from shapely.geometry.polygon import orient
import markkit as mk
from markkit import *
from lib import resample, normals, wobble, catmull, SHADOW
import mark2 as m2

TOP, FOOT = -190, 1196
mk.SK_CX, mk.SK_CY, mk.SK_S = 488.0, (TOP+FOOT)/2, 93.0/(FOOT-TOP)
BOSS_C, BOSS_R = (488, 362), 108
m2.BOSS_C, m2.BOSS_R = BOSS_C, BOSS_R

def yinterp(t):
    ys, ws = zip(*t); return lambda y: np.interp(y, ys, ws)

UP_PTS = [(476, TOP), (480, 100), (484, 400), (490, 760), (498, 1000), (502, FOOT)]
def upright(small):
    if small:
        prof = yinterp([(TOP, 214), (TOP+40, 168), (TOP+110, 150), (220, 150), (300, 168), (700, 168),
                        (1100, 160), (1150, 190), (FOOT, 240)])
    else:
        prof = yinterp([(TOP, 190), (TOP+36, 140), (TOP+110, 118), (230, 118), (300, 136), (600, 144),
                        (1000, 136), (1128, 130), (1160, 156), (FOOT, 214)])
    return stroke(UP_PTS, lambda u: px(prof(TOP+u*(FOOT-TOP))), ends=('join', 'join'),
                  centres=(300, 700), shade=0.25, amp=0.05, seed=11)

def arms(small):
    h_in, h_out = (66, 136) if small else (50, 124)
    cy = 362; xl, xr = 34, 942
    L = m2.sagged([(xl, cy-h_out), (470, cy-h_in), (470, cy+h_in), (xl, cy+h_out)], [0.035, 0, 0.035, 0.07])
    R = m2.sagged([(506, cy-h_in), (xr, cy-h_out), (xr, cy+h_out), (506, cy+h_in)], [0.035, 0.07, 0.035, 0])
    return poly(L), poly(R)

def boss(small):
    return m2.boss(small)

S_PTS = m2.S_PTS

def the_s(k=1.0, add=0):
    # round 2's S, but with no stroke shading: the cut contour carries the shadow weight in E, and the
    # stroke's sliding shade centre left a step in the lower-left of the bowl
    body = stroke(S_PTS, lambda u: m2.s_width(u, k, add), ends=('join', 'point'), centres=None,
                  shade=0, amp=0.06, seed=7, tl=(None, 5.0), slant=(1, -1))
    return body.difference(poly([(600, 498), (800, 512), (800, 600), (600, 600)]))

# ------------------------------------------------------------------ the cut contour
def contour(sil, w, shade=0.6, amp=0.22, seed=1, step=0.25):
    """open a solid silhouette into a cut outline: a band inside its edge whose width swells and
    thins (seeded, as lib's wobble) and is heavier where the edge faces the down-right shadow.
    The band is the union of small quads laid inward along the edge, so concave corners cannot
    fold it. Returns (outline, core)."""
    rng = np.random.default_rng(seed)
    polys = list(sil.geoms) if isinstance(sil, MultiPolygon) else [sil]
    bands = []
    for p in polys:
        c = np.array(p.exterior.coords)[:-1]
        c, s, L = resample(c, step=step, closed=True)
        n, t = normals(c, closed=True)
        test = c + n*0.05
        if np.mean([p.contains(Point(q)) for q in test[::5]]) < 0.5: n = -n
        wid = w*wobble(s, L, rng, amp, closed=True)
        f = np.sum(-n*SHADOW, 1)
        wid = wid*np.clip(1+shade*f, 0.45, 1.8)
        q = c + n*wid[:, None]
        k = len(c)
        for i in range(k):
            j = (i+1) % k
            bands.append(Polygon([c[i], c[j], q[j], q[i]]).buffer(0.02))
    band = unary_union(bands).intersection(sil)
    return band, sil.difference(band)

from shapely.geometry import Point

def hatch_line(pts, w, ends=('blunt', 'point'), seed=1):
    return stroke(pts, w, ends=ends, amp=0.10, seed=seed, tl=(None, 1e9) if ends[1] == 'point' else (None, None))

def s_frame(u):
    """centre, unit tangent and left normal (final units) of the S centreline at arc fraction u"""
    c = T(catmull(S_PTS)); c, s, L = resample(c, 0.2); n, t = normals(c)
    i = int(np.clip(u, 0, 1)*(len(c)-1)); return c[i], t[i], n[i]

# ------------------------------------------------------------------ hatching
def cross_hatches(prof_r):
    """dark cuts inside the cross, on its shadow side (sketch coords)"""
    H = []
    # the post below the boss: vertical cuts down its right half, the nearest the edge longest
    for k, (off, y0, y1, w) in enumerate([(44, 500, 1150, 1.35), (70, 540, 1090, 1.2), (94, 610, 1010, 1.0),
                                          (116, 700, 920, 0.8)]):
        xs = lambda y: np.interp(y, [p[1] for p in UP_PTS], [p[0] for p in UP_PTS]) + prof_r(y) - off
        H.append(hatch_line([(xs(y), y) for y in np.linspace(y0, y1, 6)], w, ('point', 'point'), seed=40+k))
    # the head above the crossing
    for k, (off, y0, y1, w) in enumerate([(42, TOP+70, 215, 1.2), (66, TOP+110, 160, 1.0), (88, TOP+160, 80, 0.8)]):
        xs = lambda y: np.interp(y, [p[1] for p in UP_PTS], [p[0] for p in UP_PTS]) + prof_r(y) - off
        H.append(hatch_line([(xs(y), y) for y in np.linspace(y0, y1, 5)], w, ('point', 'point'), seed=50+k))
    # under the arms: cuts along the lower edge, heavy at the flared end, running out inward
    for k, (dy, x1, w) in enumerate([(34, 250, 1.2), (60, 185, 1.0), (84, 125, 0.8)]):
        yl = lambda x: 362+124-(x-34)*(124-50)/(470-34)-dy
        H.append(hatch_line([(46+k*6, yl(46+k*6)), (x1, yl(x1))], w, ('blunt', 'point'), seed=60+k))
        yr = lambda x: 362+124-(942-x)*(124-50)/(942-506)-dy
        H.append(hatch_line([(930-k*6, yr(930-k*6)), (976-x1, yr(976-x1))], w, ('blunt', 'point'), seed=70+k))
    return H

def s_cuts():
    """shading cuts along the S where it turns behind the shaft: short lines running with the band
    on its shadow side, heavy where they leave the shaft and running out to a point"""
    inv = lambda q: ((q[0]-50)/mk.SK_S+mk.SK_CX, (q[1]-50)/mk.SK_S+mk.SK_CY)
    H = []
    for k, (u0, u1, side, f, w) in enumerate([(0.56, 0.645, +1, 0.30, 0.9), (0.568, 0.615, +1, -0.02, 0.7),
                                              (0.83, 0.765, -1, 0.30, 1.0), (0.82, 0.785, -1, -0.02, 0.8),
                                              (0.205, 0.255, -1, 0.28, 0.8)]):
        pts = []
        for u in np.linspace(u0, u1, 6):
            c, t, n = s_frame(u); hw = m2.s_width(u)*1.04/2
            pts.append(inv(c+n*side*hw*f))
        H.append(hatch_line(pts, w, ('blunt', 'point'), seed=80+k))
    return H

# ------------------------------------------------------------------ assembly
def make_print(g=0.95, ow=3.2):
    up = upright(False); bs = boss(False); al, ar = arms(False)
    S = the_s(k=1.08)
    front = unary_union([up, bs])                    # the post and its boss: in front of the S
    cross = unary_union([front, al, ar])
    arms_only = unary_union([al, ar]).difference(front.buffer(0.3))
    # cut contours
    c_out, c_core = contour(cross, ow, shade=0.7, amp=0.22, seed=3)
    s_out, s_core = contour(S, ow*0.62, shade=0.75, amp=0.25, seed=9)
    # boss: solid, with a cream crescent on its lit (upper-left) side and a ring cut round it
    prof = yinterp([(TOP, 190), (TOP+36, 140), (TOP+110, 118), (230, 118), (300, 136), (600, 144),
                    (1000, 136), (1128, 130), (1160, 156), (FOOT, 214)])
    pr = lambda y: prof(y)/2
    H = unary_union(cross_hatches(pr)).intersection(c_core.buffer(0.15))
    cx, cy = BOSS_C
    a = np.radians(np.linspace(140, 300, 30)); r0 = BOSS_R*0.62
    tw = np.sin(np.linspace(0, np.pi, 30))**0.7*px(34)
    outer = [(cx+r0*np.cos(q), cy+r0*np.sin(q)) for q in a]
    # build the crescent as a tapering band along the arc
    arc = T(np.array(outer)); nn = (arc - T(np.array(BOSS_C)))/np.linalg.norm(arc - T(np.array(BOSS_C)), axis=1)[:, None]
    crescent = Polygon(np.r_[arc+nn*(tw/2)[:, None], (arc-nn*(tw/2)[:, None])[::-1]]).buffer(0)
    boss_fill = bs.buffer(-px(14)).difference(crescent)
    cross_ink = unary_union([c_out, H, boss_fill])
    S_ink = unary_union([s_out, unary_union(s_cuts()).intersection(S)])
    # weave: the post and boss in front of the S; the S in front of the arms
    S_ink = S_ink.difference(front.buffer(g, join_style=2))
    cross_ink = cross_ink.difference(S.buffer(g, join_style=2).intersection(arms_only.buffer(g)))
    geom = unary_union([cross_ink, S_ink])
    return clean(geom, close=0.2, simp=0.02, min_area=0.25, min_hole=0.12)

def make_small():
    up = upright(True); bs = boss(True); al, ar = arms(True)
    S = the_s(k=1.0, add=14)
    geom = unary_union([up, bs, al, ar, S])
    return clean(geom, close=0.5, simp=0.05, min_area=2.0, min_hole=0.8)

if __name__ == '__main__':
    st = {}
    for name, gm, err in (('mark-E-print.svg', make_print(), 0.05), ('mark-E-small.svg', make_small(), 0.08)):
        d = path_d(gm, err=err); open(name, 'w').write(svg_of(d))
        ps = list(gm.geoms) if isinstance(gm, MultiPolygon) else [gm]
        raw = ''.join('M'+'L'.join(f'{x:.3f} {y:.3f}' for x, y in list(r.coords)[:-1])+'Z'
                      for p in ps for r in [p.exterior]+list(p.interiors))
        open('work/'+name.replace('.svg', '-poly.svg'), 'w').write(svg_of(raw))
        st[name] = dict(bytes=len(d), C=d.count('C'), L=d.count('L'), subpaths=d.count('M'))
    print(json.dumps(st))
