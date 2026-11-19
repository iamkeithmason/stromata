"""Exegesis: key. Traced from Hans Baldung Grien, St Peter (1519), Met 416871: oval bow pointed toward
a collared shank, a long flat bit with cut wards. Coordinates: key laid horizontal, bow at left, in
units of the source grid (work/key_g.png, 1000 px across) with the shank on y=0; build() turns it
down-right on the diagonal."""
import sys; sys.path.insert(0,'.')
from lib import *
o = Orn(seed=31)
# bow: an almond loop, narrowing into the collar
o.ring([(6,0),(24,-60),(90,-84),(162,-56),(196,-8),(162,48),(90,80),(24,58)], w=1.0, shade=0.55, amp=0.14)
# collar: two raised bands
o.cut([(204,-24),(207,0),(204,24)], w=1.25, ends=('chisel','chisel'))
o.cut([(232,-19),(234,0),(232,19)], w=1.0, ends=('chisel','chisel'))
# shank
o.cut([(196,0),(420,1),(640,3),(870,5)], w=1.15, ends=('join','blunt'), out=1, shade=0.4, amp=0.08)
# bit: flat plate below the shank, wards cut in from its outer edge
o.poly([(640,3),(870,5),(870,122),(828,122),(828,66),(796,66),(796,122),(734,122),(734,66),(702,66),(702,122),(660,122),(640,100)])
# shadow hatching inside the bow (lower right), heavy at the ring, running out inward
for p0,p1 in [((150,40),(118,10)),((120,62),(98,26))]:
    o.wedge(p0,p1,w=0.5)
o.build(fit=96, rot=38, ws=1.0)
svg = o.svg(); open('exegesis-key.svg','w').write(svg)
preview(svg, 'work/key_prev.png', sizes=(30,40,64,160), src='sources/exegesis-key-baldung.png')
