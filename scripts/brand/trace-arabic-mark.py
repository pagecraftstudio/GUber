"""Provisional cleaner trace of the Arabic mark: upscale 4x, blur, threshold, potrace (pip install potracer).
Not the approved vector master (Phase 1, D10): a designer redraw is still required.
Usage: python3 scripts/brand/trace-arabic-mark.py MASAR_Variant_E_Compact_Mark.png"""
import numpy as np, potrace, sys
from PIL import Image
import sys
SRC=sys.argv[1]  # the white-on-black compact mark PNG (MASAR_Variant_E_Compact_Mark.png)
S=4
im=Image.open(SRC).convert('L')
big=im.resize((im.width*S,im.height*S),Image.LANCZOS)
from PIL import ImageFilter
big=big.filter(ImageFilter.GaussianBlur(4))
a=np.array(big)>127           # white mark on black
ys,xs=np.where(a); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
pad=8*S
a=a[max(0,y0-pad):y1+pad+1, max(0,x0-pad):x1+pad+1]
bm=potrace.Bitmap(~a)
pl=bm.trace(turdsize=40,turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,alphamax=1.1,opticurve=True,opttolerance=1.0)
H,W=a.shape
f=lambda p:f"{p.x/S:.1f},{p.y/S:.1f}"
d=[];nodes=0
for c in pl:
    d.append('M'+f(c.start_point))
    for s in c.segments:
        nodes+=1
        if s.is_corner: d.append('L'+f(s.c)+'L'+f(s.end_point))
        else: d.append('C'+f(s.c1)+' '+f(s.c2)+' '+f(s.end_point))
    d.append('Z')
path=''.join(d)
w,h=W/S,H/S
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" role="img" aria-label="MASAR (Arabic)"><!-- PROVISIONAL: cleaned trace of an AI raster (variant E). Not the approved vector master (Phase 1, D10). Arabic spelling not yet reviewed (O1). --><path fill="currentColor" fill-rule="evenodd" d="{path}"/></svg>\n'
open('public/brand/svg/arabic-mark-clean.svg','w').write(svg)
print('curves',len(pl),'segments',nodes,'bytes',len(svg),'viewBox',w,h)
