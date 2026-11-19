import sys; sys.path.insert(0,'.')
from lib import *
o = Orn(seed=11)
C = (170,170)   # trumpet centre
# the two upright petals, each running on down its side of the tube
o.cut([(176,100),(168,78),(156,50),(126,32),(90,22),(94,72),(106,128),(124,182),(146,236),(166,282)], w=0.8, out=C, shade=0.35, ends=('point','join'))
o.cut([(176,100),(180,56),(204,14),(222,42),(226,84),(222,122),(208,178),(190,232),(170,282)], w=0.85, out=C, shade=0.35, ends=('point','join'))
# central rib, a short cut down the throat
# recurved side petals
o.cut([(108,134),(80,100),(46,90),(16,92),(14,120),(50,144),(94,142)], w=0.8, out=(52,118), ends=('join','chisel'), slant=(1,-1))
o.cut([(220,126),(250,84),(290,74),(318,100),(320,144),(298,166),(272,150),(250,136)], w=0.8, out=(290,118), ends=('join','chisel'))
# hatching: shaded right side of the trumpet, cut in from the right contour
for y,ln in ((140,50),(166,46),(192,40),(218,32)):
    xr = 224 - (y-122)*0.32
    o.wedge((xr-11, y-8), (xr-11-ln*0.8, y-8+ln*0.6), w=0.5)
# and the underside of the right recurved petal
for x in (282,302):
    o.wedge((x+2, 160-(x-282)*0.15), (x-8, 128), w=0.5)
# left upright petal: two cuts on its inner (shaded) face
# calyx: a short cross-cut where the tube meets the stem
o.cut([(150,284),(168,290),(188,284)], w=0.9, ends=('chisel','chisel'), slant=(1,-1))
# stem
o.cut([(168,290),(168,330),(166,386)], w=0.85, ends=('join','chisel'))
# leaves as gouges
o.cut([(169,332),(196,302),(230,284)], w=0.85, ends=('join','point'), swell=0.55, out=(200,320))
o.cut([(167,356),(134,338),(98,332)], w=0.85, ends=('join','point'), swell=0.55, out=(134,360))
o.build(fit=92, ws=1.15)
svg = o.svg(); open('meditation-lily.svg','w').write(svg)
preview(svg,'work/lily_prev.png', src='../sources/meditation-lily-woodcut.png')
