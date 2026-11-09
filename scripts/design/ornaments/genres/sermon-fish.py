import sys; sys.path.insert(0,'.')
from lib import *
V = 1.3
def v(pts):
    if isinstance(pts[0],(int,float)): return (pts[0], 140+(pts[1]-140)*V)
    return [(x, 140 + (y-140)*V) for x,y in pts]
o = Orn(seed=7)
# back: thinner, lit
o.cut(v([(122,121),(170,104),(230,86),(300,68),(380,60),(460,63),(530,77),(595,99),(645,127),(686,158)]),
      w=0.82, out=-1, shade=0.45, ends=('join','chisel'), slant=(1,-1))
# belly + snout: heavier, shadow side
o.cut(v([(690,158),(660,170),(640,176),(570,182),(490,179),(400,174),(310,167),(220,158),(165,149),(122,141)]),
      w=0.92, out=-1, shade=0.45, ends=('chisel','join'))
# mouth nick
o.wedge(v((690,160)), v((652,166)), w=0.5)
# forked tail: gouged lobes, cut off square-ish at the tips
o.cut(v([(126,124),(96,98),(62,70),(28,44)]), w=1.05, swell=0.55, ends=('join','chisel'), tl=(None,6), amp=0.14)
o.cut(v([(126,141),(96,170),(62,204),(26,240)]), w=1.2, swell=0.6, ends=('join','chisel'), tl=(None,6), amp=0.14, slant=(1,-1))
# dorsal fin: two short cuts rising off the back
o.wedge(v((318,70)), v((352,44)), w=0.62)
o.wedge(v((350,64)), v((392,42)), w=0.55)
# gill
o.cut(v([(528,80),(500,100),(489,130),(497,156),(520,178)]), w=0.85, ends=('point','chisel'), out=1, shade=0.6)
# eye: an angular cut lozenge
ex, ey = 562, 140+(128-140)*V
o.blob([(ex-14,ey+3),(ex-3,ey-11),(ex+14,ey-4),(ex+5,ey+11)])
# pectoral fin: two lobes hanging below the belly
o.cut(v([(476,182),(462,204),(444,226)]), w=0.95, ends=('join','chisel'), swell=0.3)
o.cut(v([(496,181),(494,206),(486,228)]), w=0.75, ends=('join','point'))
# flank hatching: parallel cuts off the belly, heavy at the belly, running out up-right
for x in (262,318,374,430):
    yb = 166 - (430-x)*0.07
    o.wedge(v((x,yb-14)), v((x+34,yb-62)), w=0.58, bend=0.04)
o.build(fit=94, ws=1.05)
svg = o.svg(); open('sermon-fish.svg','w').write(svg)
preview(svg,'work/fish_prev.png', src='../sources/sermon-fish-woodcut.png')
