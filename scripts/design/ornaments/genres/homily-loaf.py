"""Homily: loaf. Traced from Albrecht Duerer, The Last Supper (woodcut, 1523), Met 388129: the front
loaf in the bread basket at the foot of the table -- an oblong 'Wecken', domed, its near end cleft,
short cracks in the crust, its far side modelled in curved hatching. Only the top of the loaf shows
above the basket rim in the cut, so the underside is completed as a flat-bottomed loaf, and the
crust cracks are lengthened into scores so the form reads as bread at 30 px.
Coordinates from work/loaf_g.png (800 px across)."""
import sys; sys.path.insert(0,'.')
from lib import *
o = Orn(seed=113)
cen = (400, 300)
# crown: from the cleft end over the top, down the far end
o.cut([(150,300),(170,236),(236,170),(320,126),(420,108),(520,118),(600,160),(652,226),(672,300),(664,372)],
      w=1.2, ends=('chisel','join'), out=cen, shade=0.55, amp=0.13)
# base: flat, a little rounded at the ends
o.cut([(664,372),(620,410),(520,424),(400,428),(280,422),(190,404),(150,370),(146,330)], w=1.25,
      ends=('join','chisel'), out=cen, shade=0.55)
# the cleft at the near end
o.cut([(142,318),(196,312),(244,300)], w=0.8, ends=('blunt','point'), tl=(None,40))
# scores across the crown (Duerer's crust cracks, lengthened)
for p0,p1 in [((262,232),(330,150)),((362,214),(430,132)),((462,214),(526,140)),((560,232),(610,176))]:
    o.cut([p0,((p0[0]+p1[0])/2+6,(p0[1]+p1[1])/2+4),p1], w=0.7, ends=('point','chisel'), tl=(26,None))
# curved hatching on the shadow side: heavy at the base, running out upward
for x0 in (420,480,540,600):
    o.wedge((x0,418-(x0-420)*0.1),(x0-22,352-(x0-420)*0.14), w=0.5, bend=0.05)
o.build(fit=94, rot=-6, ws=1.0)
svg = o.svg(); open('homily-loaf.svg','w').write(svg)
preview(svg, 'work/loaf_prev.png', sizes=(30,40,64,160), src='sources/homily-loaf-durer.png')
