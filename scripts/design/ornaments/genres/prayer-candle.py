"""Prayer: candle. Traced from Matthias Zuendt, Candlestick with Lighted Candle (1551), Met 406041:
a thick wax candle with wax run down over the rim, a flame with a forked, flickering tip and a cream
inner tongue, a broad drip-pan. The ornate stem is
reduced to one knop and a foot. Coordinates from work/candle_g.png (600 px across, source y offset 150);
the flame is shortened (FY) so candle and flame share the square."""
import sys; sys.path.insert(0,'.')
from lib import *
o = Orn(seed=71)
FY = lambda y: 724 - (724-y)*0.62
def F(pts): return [(x, FY(y)) for x,y in pts]
# flame
o.blob(F([(200,726),(140,690),(116,600),(128,480),(158,380),(170,300),(150,226),(196,286),
          (214,236),(226,160),(252,250),(272,340),(284,450),(288,560),(270,660),(236,712)]))
# (Zuendt's radiance is left out: as cut rays it read as a modern 'lit' icon)
# candle body
o.cut([(104,738),(104,1118)], w=1.05, ends=('join','join'))
o.cut([(298,738),(298,1118)], w=1.25, ends=('join','join'), out=1, shade=0.45)
o.cut([(100,740),(200,748),(302,738)], w=1.0, ends=('chisel','chisel'))
# wax run down over the rim
o.cut([(104,742),(88,800),(92,880),(84,960)], w=1.15, ends=('join','chisel'), swell=0.3)
o.cut([(298,746),(312,806),(310,860)], w=1.05, ends=('join','chisel'), swell=0.35)
# shadow side of the candle: wedges heavy at the right edge
for y in (800,870,940,1010,1080):
    o.wedge((292,y),(236,y+6), w=0.52)
# drip-pan
o.cut([(20,1124),(200,1130),(380,1124)], w=1.3, ends=('chisel','chisel'), out=1, shade=0.4)
o.cut([(50,1134),(126,1170),(200,1178),(274,1170),(350,1134)], w=1.0, ends=('point','point'), out=1, shade=0.45)
# knop and foot
o.blob([(170,1176),(230,1176),(250,1214),(230,1252),(170,1252),(150,1214)])
o.cut([(200,1248),(200,1300)], w=1.3, ends=('join','join'))
o.cut([(80,1336),(150,1308),(200,1300),(250,1308),(320,1336)], w=1.35, ends=('chisel','chisel'), out=1, shade=0.4)
o.build(fit=95, ws=1.0)
o.carve((206,FY(690)),(208,FY(400)), w0=3.0, w1=0.5)
svg = o.svg(); open('prayer-candle.svg','w').write(svg)
preview(svg, 'work/candle_prev.png', sizes=(30,40,64,160), src='sources/prayer-candle-zundt.png')
