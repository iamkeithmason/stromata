"""Additions for the publisher's mark, on top of an unchanged copy of the ornament lib.py.

- stroke(): a lib-style cut (swell, wobble, shadow weight, chiselled ends) whose width follows an
  explicit profile along its length, so a flared head, a neck and a tapering shaft can be one stroke.
- Bezier fitting (Schneider, Graphics Gems 1990) of the final shapely outline into cubic C segments,
  with corners kept where the outline turns sharply (chiselled ends, gap edges).
- render helpers for the sheet.
"""
import io, numpy as np
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid
from lib import catmull, resample, normals, wobble, end_profile, W, SHADOW

# ---------------------------------------------------------------- mapping (sketch px -> 0..100)
SK_CX, SK_CY, SK_S = 470.0, 688.0, 94.0/1250.0
def T(p):
    p = np.asarray(p, float)
    return np.c_[(p[..., 0]-SK_CX)*SK_S+50, (p[..., 1]-SK_CY)*SK_S+50] if p.ndim > 1 else \
        np.array([(p[0]-SK_CX)*SK_S+50, (p[1]-SK_CY)*SK_S+50])
def px(v): return v*SK_S          # a sketch-px length in final units

# ---------------------------------------------------------------- profiled cut
def stroke(pts, width, ends=('chisel', 'chisel'), centres=None, shade=0.4, amp=0.10, seed=1,
           slant=(1, 1), tl=(None, None), smooth=True):
    """pts in sketch px; width: final units, a number or a function of u in [0,1] (arc fraction).
    centres: a point (sketch px) or a function u -> point; the side of the stroke facing away from it
    is the 'outer' side and carries the shadow weight when it faces down-right."""
    rng = np.random.default_rng(seed)
    c = T(catmull(pts) if (smooth and len(pts) > 2) else np.array(pts, float))
    if len(c) == 2: c = np.linspace(c[0], c[1], 20)
    c, s, L = resample(c, step=0.25)
    n, t = normals(c)
    u = s/L
    base = np.array([width(x) for x in u]) if callable(width) else np.full(len(u), float(width))
    wid = base*wobble(s, L, rng, amp)
    wid *= end_profile(s, L, ends[0], tl[0], True)*end_profile(s, L, ends[1], tl[1], False)
    hl = wid/2; hr = wid/2
    if centres is not None and shade:
        cen = np.array([T(centres(x)) for x in u]) if callable(centres) else np.tile(T(centres), (len(u), 1))
        sg = np.sign(np.sum(n*(c-cen), 1)); sg[sg == 0] = 1
        f = np.sum(n*sg[:, None]*SHADOW, 1)
        mult = np.clip(1+shade*f, 0.6, 1.5); extra = wid*(mult-1)
        hl = np.maximum(hl+extra*np.where(sg > 0, .8, .2), .3); hr = np.maximum(hr+extra*np.where(sg > 0, .2, .8), .3)
    left = c+n*hl[:, None]; right = c-n*hr[:, None]
    def trim(kind, w_end):
        if kind == 'chisel': return int(min(len(c)//5, 0.9*w_end/0.25))
        if kind == 'point': return int(min(len(c)//5, 2.0*np.median(base)/0.25))
        return 0
    a = trim(ends[0], wid[0]); b = trim(ends[1], wid[-1]); sa, sb = slant
    Ls, Le = (a if sa > 0 else 0), (b if sb > 0 else 0)
    Rs, Re = (0 if sa > 0 else a), (0 if sb > 0 else b)
    left = left[Ls:len(left)-Le if Le else None]; right = right[Rs:len(right)-Re if Re else None]
    return make_valid(Polygon(np.r_[left, right[::-1]])).buffer(0)

def poly(pts, smooth=False, closed=True):
    P = catmull(pts, closed=True, n=16) if smooth else np.array(pts, float)
    return Polygon(T(P)).buffer(0)

def wedge(p0, p1, w0, bend=0.0):
    """cream hatch cut (to subtract): w0 units at p0, running to a point at p1 (sketch px)"""
    a, b = T(p0), T(p1)
    u = (b-a)/np.linalg.norm(b-a); n = np.array([-u[1], u[0]])
    m = (a+b)/2+n*bend
    ts = np.linspace(0, 1, 14)
    cen = np.array([(1-t)**2*a+2*(1-t)*t*m+t*t*b for t in ts])
    wd = w0*(1-0.92*ts**1.3)
    return Polygon(np.r_[cen+n*wd[:, None]/2, (cen-n*wd[:, None]/2)[::-1]]).buffer(0)

def cutline(pts, w0, w1, seed=3):
    """a cream cut line along a curve (sketch px), tapering w0 -> w1, pointed ends"""
    c = T(catmull(pts)); c, s, L = resample(c, 0.2); n, _ = normals(c); u = s/L
    wd = (w0+(w1-w0)*u)*np.minimum(1, np.minimum(u, 1-u)/0.12)**0.7
    return Polygon(np.r_[c+n*wd[:, None]/2, (c-n*wd[:, None]/2)[::-1]]).buffer(0)

def clean(g, close=0.3, simp=0.03, min_area=0.4, min_hole=0.25):
    if close: g = g.buffer(close, join_style=2, mitre_limit=3).buffer(-close, join_style=2, mitre_limit=3)
    g = g.simplify(simp)
    ps = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    ps = [Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area > min_hole]) for p in ps if p.area > min_area]
    return unary_union(ps)

# ---------------------------------------------------------------- Schneider cubic fitting
def _bez(ctrl, t):
    t = np.asarray(t)[:, None]; mt = 1-t
    return mt**3*ctrl[0]+3*mt**2*t*ctrl[1]+3*mt*t**2*ctrl[2]+t**3*ctrl[3]
def _bez1(ctrl, t):
    t = np.asarray(t)[:, None]; mt = 1-t
    return 3*mt**2*(ctrl[1]-ctrl[0])+6*mt*t*(ctrl[2]-ctrl[1])+3*t**2*(ctrl[3]-ctrl[2])
def _bez2(ctrl, t):
    t = np.asarray(t)[:, None]
    return 6*(1-t)*(ctrl[2]-2*ctrl[1]+ctrl[0])+6*t*(ctrl[3]-2*ctrl[2]+ctrl[1])

def _gen(P, u, t1, t2):
    A1 = (3*(1-u)**2*u)[:, None]*t1; A2 = (3*(1-u)*u**2)[:, None]*t2
    C = np.array([[np.sum(A1*A1), np.sum(A1*A2)], [np.sum(A1*A2), np.sum(A2*A2)]])
    tmp = P-_bez(np.array([P[0], P[0], P[-1], P[-1]]), u)
    X = np.array([np.sum(A1*tmp), np.sum(A2*tmp)])
    det = C[0, 0]*C[1, 1]-C[0, 1]*C[1, 0]
    seg = np.linalg.norm(P[-1]-P[0])
    if abs(det) > 1e-12:
        a1 = (X[0]*C[1, 1]-C[0, 1]*X[1])/det; a2 = (C[0, 0]*X[1]-X[0]*C[1, 0])/det
    else: a1 = a2 = seg/3
    eps = 1e-6*seg
    if a1 < eps or a2 < eps: a1 = a2 = seg/3
    # a near-degenerate run can ask for huge handles; cap them (the error check then splits the run)
    a1 = min(a1, 1.5*seg); a2 = min(a2, 1.5*seg)
    return np.array([P[0], P[0]+t1*a1, P[-1]+t2*a2, P[-1]])

def _maxerr(P, ctrl, u):
    d = np.linalg.norm(_bez(ctrl, u)-P, axis=1); i = int(np.argmax(d)); return d[i], i

def _repar(P, ctrl, u):
    q = _bez(ctrl, u)-P; d1 = _bez1(ctrl, u); d2 = _bez2(ctrl, u)
    num = np.sum(q*d1, 1); den = np.sum(d1*d1, 1)+np.sum(q*d2, 1)
    un = u-np.where(abs(den) > 1e-12, num/np.where(abs(den) > 1e-12, den, 1), 0)
    un = np.clip(un, 0, 1); un[0] = 0; un[-1] = 1
    return un if np.all(np.diff(un) >= 0) else u

def fit_cubic(P, t1, t2, err):
    if len(P) == 2:
        d = np.linalg.norm(P[1]-P[0])/3; return [np.array([P[0], P[0]+t1*d, P[1]+t2*d, P[1]])]
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]; u = d/d[-1]
    ctrl = _gen(P, u, t1, t2); e, i = _maxerr(P, ctrl, u)
    if e < err: return [ctrl]
    if e < err*4:
        for _ in range(20):
            u = _repar(P, ctrl, u); ctrl = _gen(P, u, t1, t2); e, i = _maxerr(P, ctrl, u)
            if e < err: return [ctrl]
    i = min(max(i, 1), len(P)-2)
    tc = P[i-1]-P[i+1]; tc = tc/(np.linalg.norm(tc)+1e-12)
    return fit_cubic(P[:i+1], t1, tc, err)+fit_cubic(P[i:], -tc, t2, err)

def _densify(P, step=0.2):
    out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        k = int(np.ceil(np.linalg.norm(b-a)/step))
        for j in range(1, k+1): out.append(a+(b-a)*j/k)
    return np.array(out)

def _tan(P, i, sign, reach=0.5):
    """unit tangent at P[i] looking forward (sign=+1) or back (-1) along up to `reach` units"""
    n = len(P); acc = 0; j = i
    while acc < reach:
        k = j+sign
        if k < 0 or k >= n: break
        acc += np.linalg.norm(P[k]-P[j]); j = k
    v = P[j]-P[i]; return v/(np.linalg.norm(v)+1e-12)

def ring_to_cubics(ring, err=0.05, corner_deg=38, reach=0.45):
    P = np.array(ring.coords)[:-1]
    n = len(P)
    # turning angle at each vertex, measured over `reach` either side
    Pc = np.r_[P, P, P]
    turn = np.zeros(n)
    for i in range(n):
        tb = _tan(Pc, i+n, -1, reach); tf = _tan(Pc, i+n, +1, reach)
        turn[i] = 180-np.degrees(np.arccos(np.clip(np.dot(tb, tf), -1, 1)))
    # corners: local maxima of turning above the threshold
    cs = [i for i in range(n) if turn[i] > corner_deg and turn[i] >= turn[(i-1) % n] and turn[i] >= turn[(i+1) % n]
          and not (turn[i] == turn[(i-1) % n] and turn[(i-1) % n] > corner_deg)]
    if n <= 6: cs = list(range(n))          # a small cut shape: every vertex is a corner
    if len(cs) == 1:                        # one corner: split the ring again at its far side
        far = int(np.argmax(np.linalg.norm(P-P[cs[0]], axis=1))); cs = sorted([cs[0], far])
    segs = []
    if not cs:
        start = 0; Q = _densify(np.r_[P, P[:1]])
        tc = Q[1]-Q[-2]; tc = tc/np.linalg.norm(tc)
        return Q[0], fit_cubic(Q, tc, -tc, err)
    for k, ci in enumerate(cs):
        cj = cs[(k+1) % len(cs)]
        idx = list(range(ci, cj+1)) if cj > ci else list(range(ci, n))+list(range(0, cj+1))
        Q = P[idx]
        Q = _densify(Q)
        if len(Q) < 2: continue
        t1 = _tan(Q, 0, +1, reach); t2 = _tan(Q, len(Q)-1, -1, reach)
        if len(Q) <= 3 or np.linalg.norm(Q[-1]-Q[0]) < 1e-6:
            segs += fit_cubic(np.array([Q[0], Q[-1]]), t1, t2, err)
        else:
            segs += fit_cubic(Q, t1, t2, err)
    return P[cs[0]], segs

def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    if s.startswith('0.'): s = s[1:]
    elif s.startswith('-0.'): s = '-'+s[2:]
    return '0' if s in ('', '-0', '-') else s

def path_d(geom, err=0.05):
    polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    out = []
    def pair(p): return fmt(p[0])+(' ' if not fmt(p[1]).startswith('-') else '')+fmt(p[1])
    for p in polys:
        for r in [p.exterior]+list(p.interiors):
            start, segs = ring_to_cubics(r, err)
            cur = segs[0][0] if segs else start
            s = 'M'+pair(cur)
            for c in segs:
                # straight segments (control points on the chord) as L
                a, b1, b2, b = c
                ch = b-a; L = np.linalg.norm(ch)
                def off(q): v = q-a; return abs(ch[0]*v[1]-ch[1]*v[0])/L if L > 1e-9 else 0
                if L > 1e-9 and off(b1) < 0.01 and off(b2) < 0.01:
                    s += 'L'+pair(b)
                else:
                    s += 'C'+pair(b1)+' '+pair(b2)+' '+pair(b)
            out.append(s+'Z')
    return ''.join(out)

def svg_of(d):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" '
            f'fill-rule="evenodd"><path d="{d}"/></svg>\n')

# ---------------------------------------------------------------- rendering
MAROON = (0x5A, 0x2A, 0x27); CREAM_BG = (0xF5, 0xF0, 0xE6); SOFT = (232, 223, 207)
def render(svg, px, fg=(0, 0, 0), bg=CREAM_BG, alpha=1.0):
    import cairosvg
    from PIL import Image
    s = svg.replace('fill="currentColor"', f'fill="rgb{tuple(fg)}" fill-opacity="{alpha}"')
    png = cairosvg.svg2png(bytestring=s.encode(), output_width=px, output_height=px)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    b = Image.new('RGBA', im.size, tuple(bg)+(255,)); b.alpha_composite(im); return b.convert('RGB')
