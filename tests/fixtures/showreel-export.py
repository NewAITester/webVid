"""
15s motion-graphics showreel. Requirements: pip install numpy pillow  +  ffmpeg on PATH
Run:   python showreel.py          -> 1080p60-ish quality (1920x1080, 30fps, 2x supersampled)
       python showreel.py --fast   -> quick 960x540 preview
"""
import math, random, subprocess, sys
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR, SS = 1920, 1080, 30, 15.0, 2
if "--fast" in sys.argv: W, H, SS = 960, 540, 1
OUT = "showreel.mp4"
RW, RH = W * SS, H * SS
K = RW / 1920                     # design space is 1920x1080
BG = (8, 8, 16)
PAL = [(255, 56, 112), (255, 186, 0), (0, 226, 255), (128, 80, 255), (0, 255, 160)]
random.seed(7)

# ---------- easing / math ----------
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def prog(t, a, b): return clamp((t - a) / (b - a))
def lerp(a, b, x): return a + (b - a) * x
def lerpc(c1, c2, x): return tuple(int(lerp(a, b, x)) for a, b in zip(c1, c2))
def eo_expo(x): return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)
def eio_cubic(x): return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def eo_back(x, s=1.9): x -= 1; return 1 + (s + 1) * x ** 3 + s * x ** 2
def eo_elastic(x):
    if x <= 0 or x >= 1: return clamp(x)
    return 2 ** (-10 * x) * math.sin((x * 10 - .75) * (2 * math.pi / 3)) + 1
def P(x, y): return (x * K, y * K)
def pal(i): return PAL[int(i) % len(PAL)]
def rgba(c, a): return (*c, int(clamp(a) * 255))

@lru_cache(None)
def font(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "arialbd.ttf"]:
        try: return ImageFont.truetype(p, max(1, int(size * K)))
        except OSError: pass
    return ImageFont.load_default(size=max(1, int(size * K)))

def text_c(d, xy, s, size, fill, anchor="mm"):
    d.text(P(*xy), s, font=font(size), fill=fill, anchor=anchor)

def poly_rot(cx, cy, r, n, ang):
    return [P(cx + r * math.cos(ang + i * 2 * math.pi / n), cy + r * math.sin(ang + i * 2 * math.pi / n)) for i in range(n)]

# ---------- scenes (t is local time) ----------
PARTS = [(random.uniform(0, 2 * math.pi), random.uniform(250, 1100), random.uniform(2, 9), random.randrange(5)) for _ in range(260)]

def s_bigbang(img, d, t):              # 0.0 - 2.6
    cx, cy = 960, 540
    for ang, dist, sz, ci in PARTS:    # particle explosion with streaks
        p = eo_expo(prog(t, .15, 1.9)); r = dist * p; r0 = dist * eo_expo(prog(t, .05, 1.7))
        a = 1 - prog(t, 1.4, 2.4)
        if a <= 0 or r < 1: continue
        x, y = cx + math.cos(ang) * r, cy + math.sin(ang) * r
        x0, y0 = cx + math.cos(ang) * r0 * .82, cy + math.sin(ang) * r0 * .82
        d.line([P(x0, y0), P(x, y)], fill=rgba(pal(ci), a * .6), width=int(sz * .5 * K) + 1)
        d.ellipse([P(x - sz, y - sz), P(x + sz, y + sz)], fill=rgba(pal(ci), a))
    for i in range(3):                 # shockwave rings
        p = eo_expo(prog(t, .1 + i * .12, 1.6 + i * .12)); r = 40 + p * (700 + i * 200)
        a = 1 - p
        if a > 0: d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], outline=rgba(pal(i + 2), a), width=int((14 - i * 4) * K * a) + 1)
    s = eo_back(prog(t, .35, 1.1))     # pop-in title
    if s > 0:
        text_c(d, (cx + 8, cy + 8), "HELLO.", 260 * s, rgba(PAL[0], .9))
        text_c(d, (cx, cy), "HELLO.", 260 * s, (255, 255, 255))
    sub = eo_expo(prog(t, 1.0, 1.8))
    if sub > 0: text_c(d, (cx, cy + 170 + 40 * (1 - sub)), "I  MAKE  THINGS  MOVE", 44, rgba((200, 200, 230), sub))

def s_grid(img, d, t):                 # 2.6 - 5.2
    cols, rows, cell = 16, 9, 120
    for j in range(rows):
        for i in range(cols):
            cx, cy = i * cell + cell / 2, j * cell + cell / 2
            dist = math.hypot(i - 7.5, j - 4) / 8.5
            p = eio_cubic(prog(t, dist * .6, dist * .6 + .9))
            p2 = eio_cubic(prog(t, 1.3 + (1 - dist) * .5, 2.2 + (1 - dist) * .5))
            size = 46 * eo_back(prog(t, dist * .5, dist * .5 + .5)) * (1 - .55 * p2 + .35 * math.sin(t * 6 - dist * 9) * p)
            ang = math.pi / 4 + p * math.pi / 2 + p2 * math.pi
            col = lerpc(pal(dist * 6), pal(dist * 6 + 2), p2)
            if size > 1:
                nsides = 4 if (i + j) % 2 == 0 or p2 < .5 else 3
                d.polygon(poly_rot(cx, cy, size, nsides, ang + t), fill=col)
    a = prog(t, .8, 1.2) * (1 - prog(t, 2.2, 2.5))
    if a > 0:
        d.rectangle([P(560, 470), P(1360, 610)], fill=rgba(BG, a))
        text_c(d, (960, 540), "RHYTHM  //  SYSTEMS", 64, rgba((255, 255, 255), a))

WORDS = [("MOVE", PAL[0]), ("SHAPE", PAL[2]), ("TIME", PAL[1])]
def s_type(img, d, t):                 # 5.2 - 8.0
    seg = .93
    for k, (w, col) in enumerate(WORDS):
        lt = t - k * seg
        if lt < 0 or lt > seg + .25: continue
        bar = eo_expo(prog(lt, 0, .45)); out = eio_cubic(prog(lt, seg - .1, seg + .2))
        x0, x1 = lerp(-200, 0, bar) + out * 2100, lerp(0, 1920, bar) + out * 2100
        for b in range(5):             # staggered bars
            yy = 300 + b * 96; off = b * 60 * (1 - bar)
            d.rectangle([P(x0 - off, yy), P(x1 - off, yy + 84)], fill=lerpc(col, BG, b * .12))
        layer = Image.new("L", img.size, 0); ld = ImageDraw.Draw(layer)
        rise = (1 - eo_expo(prog(lt, .12, .6))) * 300
        ld.text(P(960 + out * 2100, 540 + rise), w, font=font(330), fill=255, anchor="mm")
        mask = Image.new("L", img.size, 0); ImageDraw.Draw(mask).rectangle([P(0, 290), P(1920, 790)], fill=255)
        img.paste((255, 255, 255), (0, 0), Image.fromarray(np.minimum(np.array(layer), np.array(mask))))
        text_c(d, (1700 + out * 2100, 840), f"0{k+1} / 03", 34, rgba((255, 255, 255), bar))

def s_waves(img, d, t):                # 8.0 - 11.0
    n = 14; intro = eo_expo(prog(t, 0, 1)); outro = 1 - eio_cubic(prog(t, 2.5, 3))
    for i in range(n):
        pts = []; col = lerpc(PAL[3], PAL[2], i / n) if t < 1.5 else lerpc(PAL[0], PAL[1], i / n)
        amp = (60 + i * 14) * intro * outro
        for xs in range(0, 1941, 20):
            x = xs - 10
            y = 540 + (i - n / 2) * 22 * outro + amp * math.sin(x * .006 + t * 3 + i * .35) * math.sin(x * .002 - t)
            pts.append(P(x, y))
        d.line(pts, fill=rgba(col, .35 + .65 * i / n), width=int(4 * K))
    for j in range(24):                # orbiting satellites with trails
        for tr in range(8):
            tt = t - tr * .025
            r = (180 + j * 14) * intro; ang = tt * (2.2 - j * .05) + j * 1.3
            x, y = 960 + math.cos(ang) * r * 1.6, 540 + math.sin(ang) * r * .55
            s = (10 - tr) * .9 * intro * outro
            if s > 0: d.ellipse([P(x - s, y - s), P(x + s, y + s)], fill=rgba(pal(j), (1 - tr / 8) * outro))
    text_c(d, (960, 120), "FLOW", 40, rgba((255, 255, 255), intro * outro))

def shape_pts(kind, n=180):
    out = []
    for i in range(n):
        a = i / n * 2 * math.pi
        if kind == 0: r = 1
        elif kind == 1: r = 1 / max(abs(math.cos(a)), abs(math.sin(a))) * .8
        elif kind == 2: r = .55 + .45 * (math.cos(5 * a) * .5 + .5) ** 3
        else: r = math.cos(math.pi / 3) / math.cos((a % (2 * math.pi / 3)) - math.pi / 3)
        out.append((math.cos(a - math.pi / 2) * r, math.sin(a - math.pi / 2) * r))
    return np.array(out)
SHAPES = [shape_pts(k) for k in range(4)]

def morph_at(t):
    seg = .55; k = int(t // seg); x = eio_cubic(clamp((t % seg) / seg * 1.6))
    return SHAPES[k % 4] * (1 - x) + SHAPES[(k + 1) % 4] * x

def s_morph(img, d, t):                # 11.0 - 13.4
    grow = eo_elastic(prog(t, 0, 1.0)); fade = 1 - prog(t, 2.0, 2.4)
    for e in range(9, -1, -1):         # echo trail = fake motion blur
        tt = max(0, t - e * .045); pts = morph_at(tt)
        rot = tt * 2.4; c, s = math.cos(rot), math.sin(rot)
        R = 330 * grow * (1 + e * .06)
        xy = [P(960 + (px * c - py * s) * R, 540 + (px * s + py * c) * R) for px, py in pts]
        if e == 0: d.polygon(xy, fill=rgba(pal(t * 3), fade))
        else: d.line(xy + [xy[0]], fill=rgba(pal(t * 3 + e * .4), (1 - e / 10) * .7 * fade), width=int(3 * K))
    for i in range(6):                 # corner brackets
        a = prog(t, .2 + i * .05, .6 + i * .05) * fade
        text_c(d, (180 + i * 312, 980), ["CIRCLE", "SQUARE", "STAR", "TRI", "LOOP", "REPEAT"][i], 26, rgba((255, 255, 255), a * .6))

def s_title(img, d, t):                # 13.4 - 15.0
    title = "SHOWREEL 2026"; fs = 150; total = len(title)
    widths = [font(fs).getlength(ch) / K for ch in title]; x = 960 - sum(widths) / 2
    for i, ch in enumerate(title):
        p = eo_back(prog(t, i * .035, i * .035 + .5))
        y = 500 + (1 - p) * -380
        glitch = 1 if (0.5 < t < .62 or 1.0 < t < 1.06) else 0
        if p > 0:
            for dx, col in ([(-10, PAL[0]), (10, PAL[2])] if glitch else []):
                d.text(P(x + dx, y), ch, font=font(fs), fill=rgba(col, .8), anchor="lm")
            d.text(P(x, y), ch, font=font(fs), fill=(255, 255, 255), anchor="lm")
        x += widths[i]
    ul = eo_expo(prog(t, .45, 1.0))
    for i, col in enumerate(PAL):
        d.rectangle([P(960 - 520 * ul, 610 + i * 9), P(960 - 520 * ul + 1040 * ul * (1 - i * .12), 614 + i * 9)], fill=col)
    a = prog(t, .7, 1.1)
    text_c(d, (960, 720), "motion  ·  type  ·  rhythm  ·  brain", 38, rgba((190, 190, 220), a))

SCENES = [(0, 2.6, s_bigbang), (2.6, 5.2, s_grid), (5.2, 8.0, s_type), (8.0, 11.0, s_waves), (11.0, 13.4, s_morph), (13.4, 15.0, s_title)]

def transition(d, t):                  # diagonal shutter wipe hides each cut
    for a, _, _ in SCENES[1:]:
        lt = t - (a - .28)
        if not 0 <= lt <= .56: continue
        for i in range(5):
            p = eio_cubic(clamp((lt - i * .03) / .45)); x = lerp(-900, 2800, p)
            w = 520
            d.polygon([P(x - w + i * 40, -50), P(x + w + i * 40, -50), P(x + w - 600 + i * 40, 1130), P(x - w - 600 + i * 40, 1130)], fill=pal(i))

# ---------- post ----------
yy, xx = np.mgrid[0:H, 0:W]
VIG = (1 - .55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.3).clip(.25, 1)[..., None].astype(np.float32)
rng = np.random.default_rng(1)

def frame(t):
    img = Image.new("RGB", (RW, RH), BG); d = ImageDraw.Draw(img, "RGBA")
    for a, b, fn in SCENES:
        if a <= t < b: fn(img, d, t - a)
    transition(d, t)
    if SS > 1: img = img.resize((W, H), Image.LANCZOS)
    f = np.asarray(img).astype(np.float32)
    f[..., 0] = np.roll(f[..., 0], 2, axis=1); f[..., 2] = np.roll(f[..., 2], -2, axis=1)  # subtle chromatic aberration
    f = f * VIG + rng.normal(0, 6, (H, W, 1)).astype(np.float32)                           # vignette + grain
    f *= clamp(t / .15) * clamp((DUR - t) / .25)                                            # fade in/out
    return f.clip(0, 255).astype(np.uint8)

if __name__ == "__main__":
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", OUT],
                          stdin=subprocess.PIPE)
    N = int(DUR * FPS)
    for n in range(N):
        ff.stdin.write(frame(n / FPS).tobytes())
        print(f"\rrendering {n+1}/{N}", end="", flush=True)
    ff.stdin.close(); ff.wait(); print(f"\ndone -> {OUT}")
