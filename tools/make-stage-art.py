#!/usr/bin/env python3
# make-stage-art.py -- the title's backdrop, a pixel-art painting made from a picture: the puma
# on stage from behind, bass slung, facing a crowd of animals and their lights. Writes into web/art/:
#
#   stage.png        the painting without its crowd: 64 colours, ordered dither, a third of the
#                    picture's size, with a third more painted in on the left (the arena going on:
#                    ceiling, truss, lights, stands, haze, stage), where the title's menu stands, so
#                    the puma can stand clear of it
#   stage-crowd.png  the crowd, a row of animals to a strip (cats, foxes, bears, mice, rabbits, dogs,
#                    deer, owls), backlit, some holding up a phone or a lighter
#   stage-crowd.json where each strip goes, and where the phones and lighters are
#   stage-front.png  the stage floor and the monitors, drawn back over the crowd
#   stage-puma*.png  the puma in parts, drawn last: its legs, its body (with the bass), its head
#   stage-puma.json  the line its tail hangs along, the page drawing the tail itself, so it can swing
#   stage-haze.png   a strip of stage haze, tiling across, that drifts along the front
#
# The picture's own crowd (arms up) is painted out. web/js/painting.js draws them all, and plays
# them. Needs Pillow and numpy.
#
#   python3 tools/make-stage-art.py <picture.png>
import sys, os, json, warnings
from collections import deque
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SCALE = 3          # picture pixels to a painting pixel
L = 134            # painting pixels painted in on the left
COLOURS = 64
SPREAD = 22        # how hard the ordered dither pushes between colours
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 - 0.5
FLOOR = 253        # the stage floor's top edge: the crowd stands beyond it
CLEAN = 166        # from here down to the floor the picture's crowd is painted out
# The stage's monitors (x0, x1, y0), standing in front of the crowd.
MONITORS = [(30, 82, 241), (134, 182, 237), (387, 437, 244), (515, 550, 239)]

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = os.path.join(root, 'web', 'art')
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(11)
lum = lambda c: c @ np.array([0.299, 0.587, 0.114])
smooth = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
lerp = lambda a, b, t: a + (b - a) * t

im = Image.open(sys.argv[1]).convert('RGB')
im = ImageEnhance.Contrast(im).enhance(1.12)
im = ImageEnhance.Color(im).enhance(1.25)
im = im.filter(ImageFilter.UnsharpMask(radius=3, percent=80, threshold=2))
W0, H = im.width // SCALE, round(im.height / SCALE)
orig = np.asarray(im.resize((W0, H), Image.LANCZOS)).astype(float)
W = L + W0
yy, xx = np.mgrid[0:H, 0:W]

def vnoise(cell, seed):
    """Smooth noise in [0, 1] over the painting."""
    g = np.random.default_rng(seed).random((H // cell + 3, W // cell + 3))
    img = Image.fromarray((g * 255).astype(np.uint8)).resize(((W // cell + 3) * cell, (H // cell + 3) * cell), Image.BICUBIC)
    return np.asarray(img)[:H, :W].astype(float) / 255

def disc(img, x, y, r, col, k=1.0):
    """A soft round light added onto img."""
    x0, x1, y0, y1 = int(x - r - 2), int(x + r + 3), int(y - r - 2), int(y + r + 3)
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if x0 >= x1 or y0 >= y1: return
    d = np.hypot(xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y)
    img[y0:y1, x0:x1] += np.clip(1.15 - d / r, 0, 1)[:, :, None] * np.asarray(col, float) * k

# ---- the left third, painted in: the arena going on past the picture's edge ----
# each row's ground from the picture's left edge, its lamps' glow and its lights left out, smoothed
rowbase = np.percentile(orig[:, :30], 30, axis=1)
k = np.exp(-np.arange(-9, 10) ** 2 / 30); k /= k.sum()
rowbase = np.stack([np.convolve(np.pad(rowbase[:, c], 9, mode='edge'), k, 'valid') for c in range(3)], 1)
P = np.repeat(rowbase[:, None, :], W, axis=1) * lerp(0.62, 1, np.clip(xx / L, 0, 1))[:, :, None] * (0.8 + 0.4 * vnoise(28, 1))[:, :, None]
# the lights in the stands: colours from the picture's own, thicker and nearer further down
bright = orig[70:185, :170].reshape(-1, 3)
lights = bright[lum(bright) > 175]
for y in range(60, CLEAN + 40):
    dens = np.clip((y - 60) / 110, 0, 1) ** 1.2 * 0.045
    for x in np.nonzero(rng.random(L + 20) < dens)[0]:
        disc(P, x, y, lerp(1.0, 2.7, np.clip((y - 60) / 120, 0, 1)) * rng.uniform(0.7, 1.25), lights[rng.integers(len(lights))] * 0.8)
# the ceiling: a truss across, and two lamps on it, each with its beam down towards the stage
truss = (np.abs(yy - 13) < 1) | (np.abs(yy - 20) < 1) | ((np.abs(((xx + yy) % 14) - 7) < 1) & (yy > 13) & (yy < 20))
P[truss & (xx < L + 12)] = [46, 48, 66]
beams = np.zeros_like(P)
for (lx, ly, col, tx, ty) in [(26, 22, (215, 110, 235), 170, 230), (92, 21, (140, 195, 255), 250, 240)]:
    ang = np.arctan2(yy - ly, xx - lx) - np.arctan2(ty - ly, tx - lx)
    dist = np.hypot(xx - lx, yy - ly)
    k = np.exp(-(ang / 0.13) ** 2) * np.exp(-dist / 150) * (dist > 2)
    beams += k[:, :, None] * np.array(col) * 0.55
    disc(beams, lx, ly, 9, np.array(col) * 0.35)
    disc(beams, lx, ly, 2.4, (255, 255, 255))
P += beams
# the haze rolling in low down, as pink as the picture's
sm = orig[195:250, :40].reshape(-1, 3)
smoke = np.median(sm[(lum(sm) > 80) & (lum(sm) < 160)], axis=0)
dens = np.clip((0.55 * vnoise(22, 3) + 0.45 * vnoise(9, 4) - 0.42) * 2.6, 0, 1) * smooth(180, 235, yy) * (1 - smooth(262, 277, yy))
P = lerp(P, smoke * (0.75 + 0.5 * vnoise(6, 5))[:, :, None], (dens * 0.85)[:, :, None])
# the stage: its floor as the picture's, with a glint or two, and a monitor
floorrow = np.median(orig[:, 60:130], axis=1)
P[FLOOR:] = floorrow[FLOOR:, None, :] * lerp(0.7, 1, np.clip(xx[FLOOR:] / L, 0, 1))[:, :, None]
for _ in range(14):
    gx, gy = rng.integers(0, L), rng.integers(FLOOR + 2, H)
    P[gy, gx:gx + rng.integers(3, 9)] += 45
mx0, mx1, my = MONITORS[0][:3]
P[my:, mx0:mx1] = [14, 11, 20]
P[my:my + 2, mx0:mx1] = [120, 82, 102]
P[my, mx0 + 2:mx0 + 10] = [190, 150, 170]

wide = np.concatenate([np.zeros((H, L, 3)), orig], axis=1)
blend = np.clip((xx - L) / 16, 0, 1)[:, :, None]
blend[(yy >= 236) & (xx >= L)] = 1                                        # the monitor's edge stays sharp
wide = lerp(P, wide, blend)
pre = np.clip(wide, 0, 255)

# ---- the picture's crowd painted out: the stands carry on down, darkening into the crowd ----
# each column's stands, lights and the puma's dark left out, the gaps filled from either side
st = pre[148:CLEAN].copy()
st[lum(st) < 40] = np.nan
with warnings.catch_warnings():
    warnings.simplefilter('ignore', RuntimeWarning)                       # columns all puma: filled below
    colbase = np.nanmedian(st, axis=0)
ok = ~np.isnan(colbase[:, 0])
colbase = np.stack([np.interp(np.arange(W), np.nonzero(ok)[0], colbase[ok, c]) for c in range(3)], 1)
clean = np.repeat(colbase[None], H, axis=0) * lerp(1, 0.18, smooth(CLEAN, 215, yy))[:, :, None]
for y in range(CLEAN, CLEAN + 36):
    for x in np.nonzero(rng.random(W) < 0.05 * (1 - (y - CLEAN) / 36))[0]:
        disc(clean, x, y, rng.uniform(1.4, 2.3), lights[rng.integers(len(lights))] * 0.9)
monitors = np.zeros((H, W), bool)
for x0, x1, y0 in MONITORS: monitors |= (xx >= x0) & (xx < x1) & (yy >= y0)
band = (yy >= CLEAN) & (yy < FLOOR) & ~monitors
keep_smoke = smooth(90, 125, lum(pre)) * (1 - smooth(140, 165, lum(pre))) * smooth(CLEAN + 22, CLEAN + 40, yy)
cleaned = np.where(band[:, :, None], lerp(clean, pre, keep_smoke[:, :, None]), pre)
cleaned[CLEAN:CLEAN + 8] = lerp(pre[CLEAN:CLEAN + 8], cleaned[CLEAN:CLEAN + 8], (np.arange(8) / 8)[:, None, None])
cleaned = np.clip(cleaned, 0, 255)

# ---- the crowd: rows of animals, back to front, backlit by the stands behind them ----
ROWS = [(190, 8), (198, 10), (208, 12), (219, 15), (232, 18), (247, 22)]   # (head's middle, head's width)
HAZE = [0.62, 0.48, 0.35, 0.22, 0.1, 0.0]                                  # how far each row is lost in the light
KINDS = ['cat', 'fox', 'bear', 'mouse', 'rabbit', 'dog', 'deer', 'owl']

def tri(px, py, a, b, c):
    d = lambda p, q: (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1])
    s1, s2, s3 = d(a, b), d(b, c), d(c, a)
    return ~(((s1 < 0) | (s2 < 0) | (s3 < 0)) & ((s1 > 0) | (s2 > 0) | (s3 > 0)))
def seg(px, py, a, b, t):
    ab = np.subtract(b, a); u = np.clip(((px - a[0]) * ab[0] + (py - a[1]) * ab[1]) / (ab @ ab), 0, 1)
    return np.hypot(px - a[0] - u * ab[0], py - a[1] - u * ab[1]) <= t
def ell(px, py, cx, cy, rx, ry): return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1

def animal(px, py, cx, cy, r, kind, arm):
    """The animal's shape, and the part of it the light behind catches (head, ears, hand)."""
    m = ell(px, py, cx, cy, r * (1.15 if kind == 'owl' else 1), r * 1.05)                       # head
    for s in (-1, 1):
        if kind in ('cat', 'fox'):
            h = 1.5 if kind == 'cat' else 1.85
            m |= tri(px, py, (cx + s * 0.12 * r, cy - 0.7 * r), (cx + s * 0.98 * r, cy - 0.35 * r), (cx + s * 0.58 * r, cy - h * r))
        elif kind == 'bear': m |= ell(px, py, cx + s * 0.72 * r, cy - 0.72 * r, 0.36 * r, 0.36 * r)
        elif kind == 'mouse': m |= ell(px, py, cx + s * 0.88 * r, cy - 0.78 * r, 0.52 * r, 0.52 * r)
        elif kind == 'rabbit': m |= ell(px, py, cx + s * 0.36 * r, cy - 1.55 * r, 0.24 * r, 0.8 * r)
        elif kind == 'dog': m |= ell(px, py, cx + s * 0.98 * r, cy - 0.05 * r, 0.32 * r, 0.62 * r)
        elif kind == 'owl': m |= tri(px, py, (cx + s * 0.3 * r, cy - 0.85 * r), (cx + s * 0.95 * r, cy - 0.6 * r), (cx + s * 0.8 * r, cy - 1.35 * r))
        elif kind == 'deer':
            t = max(0.5, 0.16 * r)
            m |= seg(px, py, (cx + s * 0.4 * r, cy - 0.85 * r), (cx + s * 0.95 * r, cy - 2.0 * r), t)
            m |= seg(px, py, (cx + s * 0.62 * r, cy - 1.35 * r), (cx + s * 1.25 * r, cy - 1.6 * r), t)
            m |= seg(px, py, (cx + s * 0.8 * r, cy - 1.75 * r), (cx + s * 0.6 * r, cy - 2.25 * r), t)
            m |= ell(px, py, cx + s * 1.05 * r, cy - 0.45 * r, 0.42 * r, 0.2 * r)
    lit = m.copy()
    m |= (np.abs(px - cx) < r * 0.4) & (py > cy) & (py < cy + 1.5 * r)                          # neck
    m |= ell(px, py, cx, cy + 2.15 * r, 1.35 * r, 1.05 * r)                                     # shoulders
    m |= (np.abs(px - cx) < 1.3 * r) & (py > cy + 2.15 * r)                                     # body
    hand = None
    if arm:
        s = arm
        sh, el = (cx + s * 0.95 * r, cy + 1.6 * r), (cx + s * 1.6 * r, cy + 0.45 * r)
        hand = (cx + s * 1.25 * r, cy - (0.9 + 0.4 * rng.random()) * r)
        t = max(0.6, 0.3 * r)
        m |= seg(px, py, sh, el, t) | seg(px, py, el, hand, t)
        lit |= seg(px, py, el, hand, t) & (py < cy)
    return m, lit, hand

base_img = cleaned.copy()
rows, phones = [], []
for ri, (cy0, s) in enumerate(ROWS):
    r = s / 2
    top = int(cy0 - 2.6 * r - 3)
    layer = np.zeros((H, W, 3)); alpha = np.zeros((H, W), bool)
    x = -s + rng.random() * s
    while x < W + s:
        cx, cy = x, cy0 + rng.uniform(-0.25, 0.25) * s
        kind = KINDS[rng.integers(len(KINDS))]
        roll = rng.random()
        arm = (1 if rng.random() < 0.5 else -1) if roll < 0.22 else 0
        y0, y1 = max(int(cy - 2.6 * r - 2), 0), FLOOR + 3
        x0, x1 = max(int(cx - 2 * r - 2), 0), min(int(cx + 2 * r + 3), W)
        if x0 < x1:
            px, py = xx[y0:y1, x0:x1] + 0.5, yy[y0:y1, x0:x1] + 0.5
            m, lit, hand = animal(px, py, cx, cy, r, kind, arm)
            bg = np.median(cleaned[max(top - 6, 0):max(top - 1, 1), x0:x1].reshape(-1, 3), axis=0)
            body = lerp(lerp(bg * 0.1, np.array([8, 6, 14]), 0.6), bg * 0.72, HAZE[ri])
            rim = lerp(body, np.clip(bg * 1.5 + 40, 0, 255), 0.5 + 0.07 * ri)
            up = np.zeros_like(m); up[1:] = m[:-1]
            top_edge = lit & ~up
            col = np.where(top_edge[:, :, None], rim, body)
            lay, al = layer[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
            lay[m] = col[m]; al |= m
            if hand and 2 <= hand[0] < W - 2 and hand[1] > 4:
                hx, hy = int(hand[0]), int(hand[1])
                if roll < 0.16:                                                            # a phone, its torch on
                    w_, h_ = max(1, round(0.15 * s)), max(2, round(0.24 * s))
                    ys, xs = slice(max(hy - h_, 0), hy), slice(max(hx - w_ // 2, 0), max(hx - w_ // 2, 0) + w_)
                    layer[ys, xs] = [235, 242, 255]; alpha[ys, xs] = True
                    phones.append({'x': hx, 'y': hy - h_ // 2 - 1, 'row': ri, 'kind': 'phone'})
                else:                                                                      # a lighter's flame
                    layer[max(hy - 2, 0), hx] = [255, 240, 190]; layer[max(hy - 1, 0), hx] = [255, 170, 70]
                    alpha[max(hy - 2, 0):hy, hx] = True
                    phones.append({'x': hx, 'y': hy - 2, 'row': ri, 'kind': 'lighter'})
        x += s * rng.uniform(1.35, 1.9)
    layer = lerp(layer, cleaned, (keep_smoke * 0.45)[:, :, None])                  # the haze in front of them
    rows.append((top, layer, alpha))
    base_img = np.where(alpha[:, :, None], layer, base_img)

# ---- the palette, from the whole scene; every layer painted to it ----
pal_img = Image.fromarray(np.clip(base_img, 0, 255).astype(np.uint8)).quantize(colors=COLOURS, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
pal = np.array(pal_img.getpalette()[:COLOURS * 3]).reshape(-1, 3).astype(float)
def paint(x, spread=SPREAD):
    d = x + np.tile(BAYER, (H // 4 + 1, W // 4 + 1))[:H, :W, None] * spread
    return pal[((d[:, :, None, :] - pal[None, None]) ** 2).sum(-1).argmin(-1)].astype(np.uint8)
# ---- the puma: the dark shape grown out from the middle of its back, plus the bass's neck ----
full = paint(pre)
dark = lum(pre) < 34
seed = (round(400 / SCALE), round(610 / SCALE) + L)
mask = np.zeros((H, W), bool); mask[seed] = True
q = deque([seed])
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and not mask[ny, nx] and dark[ny, nx]:
            mask[ny, nx] = True; q.append((ny, nx))
box = (yy >= round(350 / SCALE)) & (yy < round(500 / SCALE)) & (xx >= round(340 / SCALE) + L) & (xx < round(535 / SCALE) + L)
line = np.abs((yy - 375 / SCALE) - (xx - (350 / SCALE + L)) * ((490 - 375) / (530 - 350))) < 12 / SCALE
def poly(pts):
    inside = np.zeros((H, W), bool)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        cross = ((y0 > yy + 0.5) != (y1 > yy + 0.5)) & (xx + 0.5 < (x1 - x0) * (yy + 0.5 - y0) / (y1 - y0 + 1e-9) + x0)
        inside ^= cross
    return inside
# and all of the bass beyond the fist, the headstock and its pegs too: whatever is darker than the
# lit haze behind it, inside the shape they make
headstock = poly([(246, 123), (252, 114), (278, 115), (302, 134), (302, 158), (284, 154), (262, 140), (246, 133)]) & (lum(pre) < 145)
puma = mask | (box & line & (lum(pre) < 150)) | headstock
def grow(m, r):
    g = m.copy()
    for _ in range(r):
        n = g.copy(); n[1:] |= g[:-1]; n[:-1] |= g[1:]; n[:, 1:] |= g[:, :-1]; n[:, :-1] |= g[:, 1:]; g = n
    return g
# and the sliver of the bass's body that shows through the gap between the right arm and the body:
# part of the silhouette, in its dark
gap = poly([(358, 132), (373, 132), (384, 176), (356, 176)]) & (yy < 172)
sliver = gap & (lum(pre) < 120)
# with the hairline of haze between it and the body closed up, so it's one shape with them
closed = ~grow(~grow(puma | sliver, 2), 2)
sliver = (sliver | (closed & ~puma)) & gap
full[sliver] = np.median(full[mask & ~grow(~mask, 2)], axis=0)
puma |= sliver

# ---- what stands behind the puma, painted in, so it can move: filled in from all round it ----
hole = grow(puma, 3)
plate = cleaned.copy()
known = (~hole).astype(float)
val = plate * known[:, :, None]
for _ in range(400):                                               # each pass carries the edge a pixel in
    def blur(a):
        b = a.copy()
        b[1:] += a[:-1]; b[:-1] += a[1:]; b[:, 1:] += a[:, :-1]; b[:, :-1] += a[:, 1:]
        return b
    k, v = blur(known), blur(val)
    fill = hole & (k > 0)
    val[fill] = v[fill] / k[fill][:, None]
    known = np.where(fill, 1.0, known)
plate[hole] = val[hole]
for y in range(96, CLEAN):                                         # and the stands' lights behind it
    for x in np.nonzero(hole[y] & (rng.random(W) < 0.02))[0]:
        disc(plate, x, y, rng.uniform(1.0, 2.2), lights[rng.integers(len(lights))] * 0.8)
plate = np.clip(plate, 0, 255)

art = paint(plate)
Image.fromarray(art).save(os.path.join(out, 'stage.png'), optimize=True)

sheet, meta, sy = [], [], 0
for top, layer, alpha in rows:
    p = paint(layer, 0)                                                               # flat, as silhouettes are
    strip = np.dstack([p * alpha[:, :, None], alpha * 255]).astype(np.uint8)[top:FLOOR + 3]
    sheet.append(strip); meta.append({'y': top, 'h': strip.shape[0], 'sy': sy}); sy += strip.shape[0]
Image.fromarray(np.concatenate(sheet)).save(os.path.join(out, 'stage-crowd.png'), optimize=True)
with open(os.path.join(out, 'stage-crowd.json'), 'w') as f:
    json.dump({'rows': meta, 'lights': phones}, f, separators=(',', ':'))

# ---- in front of the crowd: the stage floor and its monitors, and the pink smoke rolling off the
# stage at either side (the picture's, which the crowd now stands in front of), its edge dithered ----
front = (yy >= FLOOR) | monitors
side = np.clip(1 - (xx - 150) / 90, 0, 1) + np.clip((xx - 425) / 80, 0, 1)
dens = np.clip((0.6 * vnoise(18, 21) + 0.4 * vnoise(8, 22) - 0.42) * 2.4, 0, 1) * smooth(200, 248, yy) * side
lev = np.floor(dens * 3 + np.tile(BAYER, (H // 4 + 1, W // 4 + 1))[:H, :W] + 0.5) / 3 * 0.8
puff = paint(smoke * (0.8 + 0.45 * vnoise(5, 23))[:, :, None], 0).astype(float)
rgb = np.where(front[:, :, None], lerp(art.astype(float), puff, (lev * 0.55)[:, :, None]), puff)
a_ = np.where(front, 255, lev * 200)
Image.fromarray(np.dstack([rgb * (a_ > 0)[:, :, None], a_]).astype(np.uint8)).save(os.path.join(out, 'stage-front.png'), optimize=True)

# ---- the puma in parts, to move: its legs stand still; its body (with the bass) bobs on the beat
# from the waist up; its head nods from the neck up; its tail, nearest the camera, swings, drawn
# by the page along this line (painting.js). The tail here is taken out of the legs, except where
# it crosses in front of a leg: the leg goes on behind it. ----
NECK, WAIST = 99, 212
TAIL = [(333, 210), (333, 225), (333, 240), (331, 252), (326, 262), (318, 268), (305, 272), (292, 272), (283, 268), (279, 261), (280, 253)]
TAIL_W = [6.5] * len(TAIL)                                       # half its width: a puma's tail is thick to the end, and round there
near = np.zeros((H, W), bool)
for (x0, y0), (x1, y1), w in zip(TAIL, TAIL[1:], TAIL_W):
    near |= seg(xx + 0.5, yy + 0.5, (x0, y0), (x1, y1), w + 1.5)
legs_in = poly([(300, 212), (327, 212), (326, 219), (320, 231), (315, 243), (309, 255), (307, 261), (307, 277), (286, 277), (287, 270), (288, 261), (292, 250), (296, 240), (298, 231)]) \
    | poly([(341, 212), (390, 212), (381, 219), (377, 240), (380, 255), (384, 277), (362, 277), (360, 252), (355, 240), (349, 225)])
tail = near & ~legs_in & (yy >= WAIST)
head = puma & (yy < NECK)
parts = {'stage-puma.png': puma & (yy >= WAIST) & ~tail, 'stage-puma-body.png': puma & (yy < WAIST) & ~head, 'stage-puma-head.png': head}
for name, m in parts.items():
    Image.fromarray(np.dstack([full * m[:, :, None], m * 255]).astype(np.uint8)).save(os.path.join(out, name), optimize=True)
colour = np.median(full[puma & ~grow(~puma, 2)], axis=0).astype(int)
with open(os.path.join(out, 'stage-puma.json'), 'w') as f:
    json.dump({'tail': TAIL, 'width': TAIL_W, 'colour': '#%02x%02x%02x' % tuple(colour)}, f, separators=(',', ':'))

# ---- the haze: soft lilac noise, tiling across, thickest at the bottom, its edge dithered ----
HH = 72
def tnoise(cells):
    g = rng.random((HH // cells + 2, W // cells + 1))
    g = np.concatenate([g, g[:, :1]], axis=1)                                       # wraps across
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((W + cells, HH + 2 * cells), Image.BICUBIC)
    return np.asarray(img)[:HH, :W].astype(float) / 255
n = 0.55 * tnoise(24) + 0.3 * tnoise(12) + 0.15 * tnoise(6)
dens = np.clip((n - 0.38) * 2.2, 0, 1) * np.linspace(0, 1, HH)[:, None] ** 1.3
lev = np.floor(dens * 4 + np.tile(BAYER, (HH // 4 + 1, W // 4 + 1))[:HH, :W] + 0.5) / 4
col = np.array([150, 110, 170]) * (0.7 + 0.3 * n[:, :, None])
Image.fromarray(np.dstack([col.clip(0, 255), np.clip(lev, 0, 1) * 150]).astype(np.uint8)).save(os.path.join(out, 'stage-haze.png'), optimize=True)
print(f'stage {W}x{H}: {len(rows)} rows of crowd, {len(phones)} lights')
