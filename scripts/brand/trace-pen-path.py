"""Pen paths for the loading write-on, from the compact mark PNG (white on black), in the same coordinates as
src/ds/brand/arabicMarkProvisional.ts. Provisional, like the mark itself (Phase 1, D10).
Reads the skeleton of the shape, then cuts it into strokes in writing order, right to left:
the loop, then the baseline and each upstroke of the teeth, then the tall stem, then the last letter with its tail.
Usage: python3 scripts/brand/trace-pen-path.py MASAR_Variant_E_Compact_Mark.png  (prints the TypeScript for PEN)"""
import sys, numpy as np, networkx as nx
from PIL import Image, ImageFilter
from skimage.morphology import skeletonize
S = 4
im = Image.open(sys.argv[1]).convert('L')
big = im.resize((im.width * S, im.height * S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4))
a = np.array(big) > 127
ys, xs = np.where(a); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
pad = 8 * S
a = a[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1]   # same crop as the traced outline, so units match
small = np.array(Image.fromarray((a * 255).astype('uint8')).resize((a.shape[1] // S, a.shape[0] // S), Image.LANCZOS)) > 127
sk = skeletonize(small)
pts = set(zip(*np.where(sk)))
G = nx.Graph()
for (y, x) in pts:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and (y + dy, x + dx) in pts: G.add_edge((y, x), (y + dy, x + dx), weight=(dy * dy + dx * dx) ** 0.5)
nodes = np.array(list(G.nodes()))  # (y, x)
def near(x, y):
    d = (nodes[:, 1] - x) ** 2 + (nodes[:, 0] - y) ** 2
    return tuple(nodes[d.argmin()])
ends = [p for p, d in dict(G.degree()).items() if d == 1]
def path(*ps):
    out = []
    for p, q in zip(ps, ps[1:]):
        seg = nx.shortest_path(G, p, q, weight='weight')
        out += seg if not out else seg[1:]
    return out
H, W = small.shape
print('size', W, H, 'endpoints (x,y)', sorted((int(x), int(y)) for y, x in ends), file=sys.stderr)
np.save('/tmp/claude-0/trace/pen_small.npy', small)

import cv2, json
MASK_W = 46
tip = lambda x, y: min(ends, key=lambda e: (e[1] - x) ** 2 + (e[0] - y) ** 2)
U, T = near(594, 330), near(559, 271)
Lb, Rb = near(517, 560), near(594, 560)
B3, B2, B1, A = near(445, 560), near(373, 560), near(301, 560), near(222, 560)
strokes = [
    path(U, T, Lb, Rb, U),            # the loop of the first letter
    path(Lb, B3), path(B3, tip(460, 270)),
    path(B3, B2), path(B2, tip(388, 267)),
    path(B2, B1), path(B1, tip(316, 267)),
    path(B1, A), path(A, tip(236, 11)),
    path(tip(164, 242), near(148, 560), tip(8, 665)),  # the last letter, top to tail
]
def smooth(pl, k=4):
    pl = np.array(pl, float)
    if len(pl) < 2 * k + 1: return pl
    out = pl.copy()
    for i in range(k, len(pl) - k): out[i] = pl[i - k:i + k + 1].mean(0)
    return out
sm = [smooth(st)[::4] for st in strokes]
sm = [np.vstack([a_, np.array(st[-1], float)[None]]) for a_, st in zip(sm, strokes)]
lens = [float(np.sum(np.hypot(*np.diff(p_, axis=0).T))) for p_ in sm]
tot = sum(lens); acc = 0; pen = []
for p_, L in zip(sm, lens):
    d = 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for y, x in p_)
    pen.append({'d': d, 'share': round(L / tot, 4), 'at': round(acc / tot, 4)}); acc += L
canvas = np.zeros(small.shape, np.uint8)
for p_ in sm: cv2.polylines(canvas, [np.array([[x, y] for y, x in p_], np.int32)], False, 255, MASK_W, cv2.LINE_AA)
unc = int((small & (canvas < 128)).sum())
print('strokes', len(pen), 'total px', int(tot), 'glyph pixels not covered by the pen mask:', unc, 'of', int(small.sum()), file=sys.stderr)
print('export const MARK_PEN = ' + json.dumps({'maskWidth': MASK_W, 'strokes': pen}, separators=(',', ':')) + ' as const;')
