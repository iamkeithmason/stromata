"""Woodcut 'cut' stroke builder.

Every mark is an explicit filled polygon (never a buffered line), so there are no round caps:
- width varies along the stroke: a slow irregular wobble (seeded), plus extra weight on the side of
  the form that faces away from the light (light from upper left, shadow toward lower right);
- the extra weight sits on the *outer* side of the contour (the knife cut away more there);
- ends finish 'blunt' (flat, a little narrower), 'chisel' (short taper, cut off at an angle) or
  'point' (long taper to a sliver, cut off at an angle) -- the shapes a knife leaves;
- 'wedge' hatching: short straight cuts, heavy at the contour and running out to a point.
Elements are authored in source-image coords; fit() maps them into the 100-unit box and widths are
applied in final units.
"""
import numpy as np, io
from shapely.geometry import Polygon, MultiPolygon, LineString
from shapely.ops import unary_union
from shapely.validation import make_valid

W = 5.0
SHADOW = np.array([0.55, 0.835])          # unit-ish vector toward the shadow (down, a little right)
SHADOW = SHADOW / np.linalg.norm(SHADOW)

def catmull(pts, closed=False, n=40, alpha=0.5):
    P = [np.array(p, float) for p in pts]
    if closed: P = [P[-1]] + P + [P[0], P[1]]
    else: P = [2*P[0]-P[1]] + P + [2*P[-1]-P[-2]]
    out = []
    for i in range(1, len(P)-2):
        p0,p1,p2,p3 = P[i-1],P[i],P[i+1],P[i+2]
        def tj(ti, a, b): return ti + max(np.linalg.norm(b-a),1e-6)**alpha
        t0=0; t1=tj(t0,p0,p1); t2=tj(t1,p1,p2); t3=tj(t2,p2,p3)
        for t in np.linspace(t1,t2,n,endpoint=False):
            A1=(t1-t)/(t1-t0)*p0+(t-t0)/(t1-t0)*p1
            A2=(t2-t)/(t2-t1)*p1+(t-t1)/(t2-t1)*p2
            A3=(t3-t)/(t3-t2)*p2+(t-t2)/(t3-t2)*p3
            B1=(t2-t)/(t2-t0)*A1+(t-t0)/(t2-t0)*A2
            B2=(t3-t)/(t3-t1)*A2+(t-t1)/(t3-t1)*A3
            out.append((t2-t)/(t2-t1)*B1+(t-t1)/(t2-t1)*B2)
    if not closed: out.append(P[-2])
    return np.array(out)

def resample(c, step=0.3, closed=False):
    if closed: c = np.r_[c, c[:1]]
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c,axis=0),axis=1))]
    L = d[-1]; m = max(3, int(L/step)+1)
    s = np.linspace(0, L, m)
    r = np.c_[np.interp(s,d,c[:,0]), np.interp(s,d,c[:,1])]
    if closed: r, s = r[:-1], s[:-1]
    return r, s, L

def normals(c, closed=False):
    if closed: t = np.roll(c,-1,0) - np.roll(c,1,0)
    else: t = np.gradient(c, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    return np.c_[-t[:,1], t[:,0]], t     # left normal (in y-down coords this is visually 'right'), tangent

def wobble(s, L, rng, amp, closed=False):
    """slow irregular width variation; periodic if closed"""
    v = np.zeros_like(s)
    for k in range(3):
        if closed:
            f = rng.integers(2, 5) * (k+1)
            v += np.sin(2*np.pi*f*s/L + rng.uniform(0, 2*np.pi)) / (1.8**k)
        else:
            wl = rng.uniform(22, 40) / (1.7**k)
            v += np.sin(2*np.pi*s/wl + rng.uniform(0, 2*np.pi)) / (1.8**k)
    return 1 + amp * v / 1.6

def end_profile(s, L, kind, tl, at_start):
    d = s if at_start else L - s
    if kind == 'blunt':  lo, tl = 0.78, min(tl or 3, L/3)
    elif kind == 'chisel': lo, tl = 0.42, min(tl or 4.5, L/2.5)
    elif kind == 'point': lo, tl = 0.12, min(tl or 9, L/1.6)
    else: return np.ones_like(s)            # 'join': full width
    return np.minimum(1, lo + (1-lo) * np.clip(d/tl, 0, 1)**0.8)

class Orn:
    def __init__(self, seed=1):
        self.items = []; self.rng = np.random.default_rng(seed)
    def cut(self, pts, w=1.0, ends=('chisel','chisel'), out=None, shade=0.4, amp=0.12,
            tl=(None,None), swell=0.0, slant=(1,1)):
        """out: +1 if the form's outside lies on the stroke's left normal, -1 right, None = no shading.
        slant: which way the angled end is cut (+1/-1)."""
        self.items.append(dict(k='cut', pts=pts, w=w, ends=ends, out=out, shade=shade, amp=amp,
                               tl=tl, swell=swell, slant=slant, seed=self.rng.integers(1<<30)))
        return self
    def ring(self, pts, w=1.0, shade=0.4, amp=0.12):
        self.items.append(dict(k='ring', pts=pts, w=w, shade=shade, amp=amp, seed=self.rng.integers(1<<30))); return self
    def wedge(self, p0, p1, w=0.62, bend=0.0, tip='point'):
        """hatch cut: heavy at p0, running out toward p1"""
        p0, p1 = np.array(p0, float), np.array(p1, float)
        m = (p0+p1)/2 + bend*np.array([-(p1-p0)[1], (p1-p0)[0]])
        self.items.append(dict(k='cut', pts=[tuple(p0), tuple(m), tuple(p1)], w=w, ends=('blunt', tip),
                               out=None, shade=0, amp=0.08, tl=(None, 1e9), swell=0, slant=(1,1),
                               seed=self.rng.integers(1<<30), wedge=True))
        return self
    def blob(self, pts):
        self.items.append(dict(k='blob', pts=pts)); return self
    def poly(self, pts):
        """raw polygon in source coords, no smoothing (keeps cut corners)"""
        self.items.append(dict(k='poly', pts=pts)); return self

    def _cut_poly(self, it, c):
        rng = np.random.default_rng(it['seed'])
        c, s, L = resample(c)
        n, t = normals(c)
        base = W * it['w'] * self.ws
        wid = base * wobble(s, L, rng, it['amp'])
        if it['swell']: wid *= 1 + it['swell']*np.sin(np.pi*s/L)
        if it.get('wedge'):
            wid = base * (1 - 0.78*(s/L)**1.5) * wobble(s, L, rng, 0.06)
        wid *= end_profile(s, L, it['ends'][0], it['tl'][0], True)
        if not it.get('wedge'):
            wid *= end_profile(s, L, it['ends'][1], it['tl'][1], False)
        # split into left/right half widths; shadow weight goes to the outer side
        hl = wid/2; hr = wid/2
        if it['out'] is not None and it['shade']:
            if isinstance(it['out'], (tuple, list, np.ndarray)):
                cen = np.asarray(it['_cen'])
                sg = np.sign(np.sum(n*(c-cen),1)); sg[sg==0] = 1     # +1 where left normal points away from form centre
            else:
                sg = np.full(len(c), float(it['out']))
            nout = n * sg[:,None]
            f = np.sum(nout*SHADOW, 1)                # +1 where the outer side faces the shadow
            mult = np.clip(1 + it['shade']*f, 0.6, 1.5)
            extra = wid*(mult-1)
            hl = hl + extra*np.where(sg>0, 0.8, 0.2); hr = hr + extra*np.where(sg>0, 0.2, 0.8)
            hl = np.maximum(hl, 0.35); hr = np.maximum(hr, 0.35)
        left = c + n*hl[:,None]; right = c - n*hr[:,None]
        # angled cuts: drop a few points from one side at each angled end
        def trim(kind, w_end):
            if kind == 'chisel': return int(min(len(c)//4, 0.9*w_end/0.3))
            if kind == 'point':  return int(min(len(c)//4, 2.2*base/0.3))
            return 0
        a = trim(it['ends'][0], wid[0]); b = trim(it['ends'][1], wid[-1])
        sa, sb = it['slant']
        Ls, Le = (a if sa>0 else 0), (b if sb>0 else 0)
        Rs, Re = (0 if sa>0 else a), (0 if sb>0 else b)
        left = left[Ls:len(left)-Le if Le else None]
        right = right[Rs:len(right)-Re if Re else None]
        poly = Polygon(np.r_[left, right[::-1]])
        return make_valid(poly).buffer(0)

    def _ring_poly(self, it, c):
        rng = np.random.default_rng(it['seed'])
        c, s, L = resample(c, closed=True)
        n, t = normals(c, closed=True)
        # orientation: make n point outward
        area = 0.5*np.sum(c[:,0]*np.roll(c[:,1],-1) - np.roll(c[:,0],-1)*c[:,1])
        if area > 0: n = -n
        # check: in y-down coords a positive shoelace is clockwise visually; verify with centroid
        cen = c.mean(0)
        if np.mean(np.sum((c-cen)*n,1)) < 0: n = -n
        base = W*it['w']*self.ws
        wid = base * wobble(s, L, rng, it['amp'], closed=True)
        f = n @ SHADOW
        mult = np.clip(1 + it['shade']*f, 0.6, 1.5)
        outer = c + n*(wid/2 + wid*(mult-1)*0.8)[:,None]
        inner = c - n*(wid/2 + wid*(mult-1)*0.2)[:,None]
        return make_valid(Polygon(outer, [inner])).buffer(0)

    def build(self, fit=92, cx=50, cy=50, scale=None, rot=0.0, close=0.35, ws=1.0):
        self.ws = ws
        curves = []
        for it in self.items:
            if it['k']=='ring': curves.append(catmull(it['pts'], closed=True))
            elif it['k']=='blob': curves.append(catmull(it['pts'], closed=True))
            elif it['k']=='poly': curves.append(np.array(it['pts'], float))
            else: curves.append(catmull(it['pts']) if len(it['pts'])>2 else np.array(it['pts'],float))
        if rot:
            a=np.radians(rot); R=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])
            curves=[c@R.T for c in curves]
        allp = np.vstack(curves)
        x0,y0 = allp.min(0); x1,y1 = allp.max(0)
        s = scale or (fit - W) / max(x1-x0, y1-y0)
        ox = cx - s*(x0+x1)/2; oy = cy - s*(y0+y1)/2
        T = lambda c: np.c_[c[:,0]*s+ox, c[:,1]*s+oy]
        self._map = (lambda c: T(c @ R.T)) if rot else T
        geoms = []
        for it, c in zip(self.items, curves):
            c = T(c)
            if it['k']=='cut':
                if isinstance(it['out'], (tuple, list)):
                    o_ = np.array(it['out'], float)
                    if rot: o_ = o_ @ R.T
                    it['_cen'] = T(o_[None])[0]
                if len(c)==2: c = np.linspace(c[0], c[1], 20)
                geoms.append(self._cut_poly(it, c))
            elif it['k']=='ring': geoms.append(self._ring_poly(it, c))
            elif it['k'] in ('blob','poly'): geoms.append(Polygon(c).buffer(0))
        g = unary_union(geoms)
        # fill hairline notches at joins with mitred (not rounded) closing
        if close: g = g.buffer(close, join_style=2, mitre_limit=3).buffer(-close, join_style=2, mitre_limit=3)
        g = g.simplify(0.04)
        polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        polys = [Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area > 2.0]) for p in polys if p.area > 0.6]
        self.geom = unary_union(polys)
        self.scale = s
        return self

    def carve(self, p0, p1, w0=1.1, w1=0.25):
        """cut a tapering cream line out of the ink (source coords), after build()"""
        a, b = self._map(np.array([p0, p1], float))
        u = (b-a)/np.linalg.norm(b-a); n = np.array([-u[1], u[0]])
        poly = Polygon([a+n*w0/2, b+n*w1/2, b-n*w1/2, a-n*w0/2])
        self.geom = self.geom.difference(poly)
        return self

    def svg(self):
        g = self.geom
        polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        d = []
        def ring(r):
            pts = list(r.coords)[:-1]
            return 'M' + 'L'.join(f'{x:.2f} {y:.2f}'.replace('.00','') for x,y in pts) + 'Z'
        for p in polys:
            d.append(ring(p.exterior))
            for i in p.interiors: d.append(ring(i))
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" fill-rule="evenodd">'
                f'<path d="{"".join(d)}"/></svg>\n')

GOLD='#8A5F1E'; CREAM=(0xF5,0xF0,0xE6)
def render(svg, px):
    import cairosvg
    from PIL import Image
    s = svg.replace('fill="currentColor"', f'fill="{GOLD}"')
    png = cairosvg.svg2png(bytestring=s.encode(), output_width=px, output_height=px)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    bg = Image.new('RGBA', im.size, CREAM+(255,)); bg.alpha_composite(im); return bg.convert('RGB')

def preview(svg, path, sizes=(30,40,64,160,400), src=None):
    from PIL import Image
    ims = [render(svg,p) for p in sizes]
    if src:
        im = Image.open(src).convert('RGB'); im.thumbnail((400,400)); ims = [im] + ims
    W_ = sum(i.width for i in ims) + 20*(len(ims)+1); H_ = max(i.height for i in ims)+40
    sh = Image.new('RGB',(W_,H_),CREAM); x=20
    for i in ims: sh.paste(i,(x,20)); x+=i.width+20
    sh.save(path)
