"""The Stromata publisher's mark, round 2 (on round 1's B: the upright passes in front of the S at
every crossing). Coordinates are pixels of Keith's sketch crop (sketch/keith-sketch-ink.png).

C = B + a real cross (long pattee arms reaching well past the S, a big round boss) + no bar below
    (the shaft stops just under the S with its flared foot).
D = C + period weights: the cross solid and heavy, the S a lighter band cut as two outlines with the
    cream between them (as Holbein's Numeri XXI serpent).
The S is a letterform: no head, eye or scales; the lower-left end is a pointed, chiselled terminal.

    python3 mark2.py      # writes mark-{C,D}-{print,small}.svg
"""
import json, sys
import numpy as np
from shapely.geometry import box, Point, Polygon
from shapely.ops import unary_union
import markkit as mk
from markkit import *

# new framing: the long arms widen the mark; fit the whole cross+S into the 100 box
mk.SK_CX, mk.SK_CY, mk.SK_S = 488.0, 598.0, 93.0/1200.0

def yinterp(table):
    ys, ws = zip(*table); return lambda y: np.interp(y, ys, ws)

# ------------------------------------------------------------------ cross
TOP, FOOT = 0, 1196
def upright(small):
    pts = [(482, TOP), (484, 400), (490, 760), (498, 1000), (502, FOOT)]
    if small:
        prof = yinterp([(TOP, 196), (40, 156), (90, 140), (220, 140), (300, 160), (700, 160),
                        (1100, 152), (1150, 184), (FOOT, 236)])
    else:
        prof = yinterp([(TOP, 172), (34, 126), (90, 106), (220, 106), (300, 128), (600, 138),
                        (1000, 130), (1128, 124), (1160, 150), (FOOT, 208)])
    return stroke(pts, lambda u: px(prof(TOP+u*(FOOT-TOP))), ends=('join', 'join'),
                  centres=(300, 700), shade=0.25, amp=0.05, seed=11)

BOSS_C, BOSS_R = (488, 362), 136
def boss(small):
    r = BOSS_R + (10 if small else 0)
    # a round boss, a little irregular, as cut
    rng = np.random.default_rng(5)
    a = np.linspace(0, 2*np.pi, 28, endpoint=False)
    rr = r*(1+0.015*np.sin(3*a+1.0)+0.01*rng.standard_normal(len(a)))
    return poly([(BOSS_C[0]+q*np.cos(t), BOSS_C[1]+q*np.sin(t)) for q, t in zip(rr, a)], smooth=True)

def sagged(corners, sag, n=12):
    out = []; C = np.array(corners, float); cen = C.mean(0)
    for i in range(4):
        a, b = C[i], C[(i+1) % 4]; m = (a+b)/2; L = np.linalg.norm(b-a)
        dirn = (cen-m)/np.linalg.norm(cen-m)
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(a+(b-a)*t+dirn*sag[i]*L*4*t*(1-t))
    return out

def arms(small):
    """pattee arms: narrow where they leave the boss, flaring to concave ends. They run in under
    the boss, so the beam is one piece that the S crosses in front of."""
    h_in, h_out = (78, 142) if small else (64, 128)   # half-heights at the inner and outer ends
    cy = 362; xl, xr = 34, 942
    L = sagged([(xl, cy-h_out), (470, cy-h_in), (470, cy+h_in), (xl, cy+h_out)], [0.035, 0, 0.035, 0.07])
    R = sagged([(506, cy-h_in), (xr, cy-h_out), (xr, cy+h_out), (506, cy+h_in)], [0.035, 0.07, 0.035, 0])
    return poly(L), poly(R)

# ------------------------------------------------------------------ the S (round 1's path)
S_PTS = [(716, 540), (714, 440), (708, 380), (694, 300), (656, 220), (592, 170), (502, 150), (416, 156),
         (336, 188), (282, 246), (262, 326), (264, 404), (286, 460), (334, 504), (418, 550), (528, 606),
         (640, 672), (736, 768), (768, 878), (752, 988), (692, 1064), (602, 1100), (500, 1108), (420, 1094),
         (350, 1052), (282, 996), (222, 950), (166, 908)]

def s_width(u, k=1.0, add=0):
    table = [(0, 120), (0.04, 106), (0.15, 92), (0.25, 96), (0.32, 106), (0.42, 110), (0.52, 108),
             (0.62, 104), (0.71, 94), (0.79, 88), (0.87, 92), (0.93, 72), (1.0, 32)]
    us, ws = zip(*table); return px(np.interp(u, us, ws)*k+add)

def s_centre(u):
    k = np.clip((u-0.36)/0.14, 0, 1)
    return tuple(np.array((470, 330))*(1-k)+np.array((600, 890))*k)

def the_s(k=1.0, add=0, pts=S_PTS):
    body = stroke(pts, lambda u: s_width(u, k, add), ends=('join', 'point'), centres=s_centre,
                  shade=0.35, amp=0.06, seed=7, tl=(None, 5.0), slant=(1, -1))
    return body.difference(poly([(600, 498), (800, 512), (800, 600), (600, 600)]))  # knife-cut top end

# ------------------------------------------------------------------ hatching on the cross (shadow side)
def cross_hatches():
    h = []
    h.append(cutline([(536, 770), (540, 900), (544, 1030)], 0.62, 0.32))        # shaft, right edge
    h.append(cutline([(526, 30), (522, 90), (520, 140)], 0.5, 0.25))             # head, right edge
    # boss: a crescent cut round its lower right, as the pomegranate
    c, r = BOSS_C, BOSS_R*0.74
    h.append(cutline([(c[0]+r*np.cos(t), c[1]+r*np.sin(t)) for t in np.radians([-25, 15, 50, 85])], 0.75, 0.3))
    # arms: a cut line just inside each lower (shadow) edge, heavy at the flared end, running out inward
    h.append(cutline([(52, 466), (120, 448), (196, 430)], 0.7, 0.25))
    h.append(cutline([(924, 466), (856, 448), (780, 430)], 0.7, 0.25))
    # and one short wedge up from the outer end of the right arm (the shadow end)
    h.append(wedge((930, 470), (918, 430), 0.6))
    return h

# ------------------------------------------------------------------ assembly
def make(variant='C', small=False, gap=None):
    g = gap if gap is not None else (0.0 if small else 1.0)
    up = upright(small); bs = boss(small); al, ar = arms(small)
    if variant == 'D' and not small:
        S = the_s(k=0.96)
        band = S.difference(S.buffer(-px(30), join_style=2))     # two outlines, cream between
        S_draw = band
    elif variant == 'D':
        # the outlined S cannot hold below ~40px (each outline is ~0.3px at 14px), so D's small cut
        # uses a solid S and is the same as C's
        S = the_s(k=1.0, add=14); S_draw = S
    else:
        S = the_s(k=1.0, add=(14 if small else 0)); S_draw = S
    beam = unary_union([al, ar])
    if g > 0:
        # upright (and boss) in front of the S at every crossing; the S in front of the beam
        S2 = S_draw.difference(up.buffer(g, join_style=2))      # the upright is always in front
        beam2 = beam.difference(S.buffer(g, join_style=2))
        bs2 = bs.difference(S.buffer(g, join_style=2))
        geom = unary_union([up, bs2, beam2, S2])
    else:
        geom = unary_union([up, bs, beam, S_draw])
    if not small:
        geom = geom.difference(unary_union(cross_hatches()))
        geom = clean(geom, close=0.25, simp=0.02, min_area=0.6, min_hole=0.15)
    else:
        geom = clean(geom, close=0.5, simp=0.05, min_area=2.0, min_hole=0.8)
    return geom

def write(name, gm, err):
    d = path_d(gm, err=err); open(name, 'w').write(svg_of(d))
    return dict(bytes=len(d), C=d.count('C'), L=d.count('L'), subpaths=d.count('M'))

if __name__ == '__main__':
    st = {}
    for v in 'CD':
        st[f'{v}-print'] = write(f'mark-{v}-print.svg', make(v, False), 0.05)
        st[f'{v}-small'] = write(f'mark-{v}-small.svg', make(v, True), 0.08)
    print(json.dumps(st))
