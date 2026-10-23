"""cappl-pals demo video: a real Claude Code session (frames from record.py) plus motion graphics.

Usage:
  .venv/bin/python compose.py video                # out/video.mp4 (no sound) + out/events.json
  .venv/bin/python compose.py stills 3.0 27.8 50   # PNGs of those moments
"""

import json
import math
import os
import random
import subprocess
import sys
from functools import lru_cache

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
RENDER = "/tmp/cappl-demo/render"
W, H, FPS = 1920, 1080, 30
TOTAL = 78.0

CREAM = (255, 243, 220)
PINK = (242, 114, 143)
TEAL = (74, 151, 155)
NAVY = (43, 74, 139)
BROWN = (156, 107, 66)
GOLD = (250, 204, 21)
SAND = (232, 201, 143)
INK = (14, 16, 32)
WHITE = (248, 250, 252)
MUTED = (203, 213, 225)
GRAY = (148, 163, 184)
RED = (229, 72, 77)

FONT_DIR = os.path.join(HERE, "assets", "fonts")
PRE = os.path.expanduser("~/.fonts/Pretendard-{}.otf")


@lru_cache(maxsize=None)
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    paths = {
        "pixel": os.path.join(FONT_DIR, "Galmuri11-Bold.ttf"),
        "xbold": PRE.format("ExtraBold"),
        "bold": PRE.format("Bold"),
        "semi": PRE.format("SemiBold"),
        "medium": PRE.format("Medium"),
        "mono": os.path.join(FONT_DIR, "D2Coding.ttf"),
        "monob": os.path.join(FONT_DIR, "D2CodingBold.ttf"),
    }
    return ImageFont.truetype(paths[name], size)


# ── Easing ─────────────────────────────────────────────────────────────────

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur)


def ease_out_cubic(x):
    return 1 - (1 - x) ** 3


def ease_in_out_cubic(x):
    return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out_back(x, s=1.70158):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def lerp(a, b, x):
    return a + (b - a) * x


def mixc(a, b, x):
    return tuple(int(lerp(a[i], b[i], x)) for i in range(3))


# ── Sprites ────────────────────────────────────────────────────────────────

POSES = json.load(open(os.path.join(HERE, "assets", "poses.json")))
PAL = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in POSES["palette"].items()}


@lru_cache(maxsize=512)
def sprite(key: str, scale: int) -> Image.Image:
    rows = POSES["frames"][key]
    h, w = len(rows), len(rows[0])
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    for y, line in enumerate(rows):
        for x, ch in enumerate(line):
            if ch in PAL:
                arr[y, x, :3] = PAL[ch]
                arr[y, x, 3] = 255
    return Image.fromarray(arr, "RGBA").resize((w * scale, h * scale), Image.NEAREST)


def pose(character, look, mood, t, fx=None):
    """A pose key at time t (8 ticks a second, like the mod's 250 ms frames doubled)."""
    if fx is not None:
        return f"{character}:{look}:fx-{fx}:{int(t * 8) % 8}"
    tick = int(t * 8) % 24
    if mood == "idle":
        tick = 23 if int(t * 10) % 37 == 0 else 0
    return f"{character}:{look}:{mood}:{tick}"


def paste_sprite(canvas, key, scale, cx, cy, sx=1.0, sy=1.0, alpha=1.0):
    img = sprite(key, scale)
    if sx != 1.0 or sy != 1.0:
        img = img.resize((max(1, int(img.width * sx)), max(1, int(img.height * sy))), Image.NEAREST)
    if alpha < 1.0:
        img = img.copy()
        img.putalpha(img.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


# ── Backgrounds and text ───────────────────────────────────────────────────

@lru_cache(maxsize=48)
def gradient(top: tuple, bottom: tuple) -> Image.Image:
    t = np.linspace(0, 1, H)[:, None]
    arr = (np.array(top)[None, None, :] * (1 - t[..., None]) + np.array(bottom)[None, None, :] * t[..., None])
    arr = np.repeat(arr, W, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


RNG = random.Random(7)
STARS = [(RNG.uniform(0, W), RNG.uniform(0, H * 0.75), RNG.choice([3, 3, 6, 6, 9]), RNG.uniform(0, 6.28), RNG.uniform(0.6, 2.2))
         for _ in range(140)]


def starfield(canvas, t, drift=10.0, color=CREAM, density=1.0):
    draw = ImageDraw.Draw(canvas)
    for i, (x, y, s, phase, speed) in enumerate(STARS):
        if i > len(STARS) * density:
            break
        a = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * speed + phase))
        xx = (x + t * drift * (s / 6)) % W
        c = mixc((30, 26, 60), color, a * (0.5 if s == 3 else 1.0))
        draw.rectangle([xx, y, xx + s - 1, y + s - 1], fill=c)
        if s == 9 and a > 0.8:
            draw.rectangle([xx - 6, y + 3, xx + 14, y + 5], fill=c)
            draw.rectangle([xx + 3, y - 6, xx + 5, y + 14], fill=c)


def mesas(canvas, t, color=(58, 34, 52), base=H, drift=6.0):
    """Flat-topped desert hills along the bottom, sliding slowly."""
    d = ImageDraw.Draw(canvas)
    rng = random.Random(4)
    x = -((t * drift) % 600) - 200
    while x < W + 200:
        w = rng.uniform(220, 420)
        h = rng.uniform(90, 200)
        d.polygon([(x, base), (x + w * 0.18, base - h), (x + w * 0.82, base - h), (x + w, base)], fill=color)
        x += w * rng.uniform(0.7, 1.1)


def plank(canvas, y, height=46):
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, y, W, y + height], fill=(185, 139, 94))
    d.rectangle([0, y + height, W, y + height + 12], fill=(139, 90, 43))
    for x in range(40, W, 260):
        d.rectangle([x, y + 12, x + 10, y + 22], fill=(139, 90, 43))


FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


@lru_cache(maxsize=None)
def cmap(path: str) -> frozenset:
    return frozenset(TTFont(path, lazy=True).getBestCmap().keys())


def runs(s, f):
    """Split a string into [(chars, font)], falling back for glyphs the font lacks."""
    have = cmap(f.path)
    alt = ImageFont.truetype(FALLBACK, int(f.size * 0.92))
    out = []
    for ch in s:
        use = f if (ord(ch) in have or ch == " ") else alt
        if out and out[-1][1] is use:
            out[-1] = (out[-1][0] + ch, use)
        else:
            out.append((ch, use))
    return out


def text_layer(s, f, fill, stroke=0, stroke_fill=INK, pad=16):
    parts = runs(s, f)
    ascent, descent = f.getmetrics()
    width = sum(font_.getlength(part) for part, font_ in parts) + stroke * 2
    img = Image.new("RGBA", (int(width) + pad * 2, ascent + descent + stroke * 2 + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = pad + stroke
    base = pad + stroke + ascent
    for part, font_ in parts:
        d.text((x, base), part, font=font_, fill=fill, anchor="ls", stroke_width=stroke, stroke_fill=stroke_fill)
        x += font_.getlength(part)
    return img


def rtext(canvas, xy, s, f, fill, anchor="la", stroke=0, stroke_fill=INK, pad=16):
    layer = text_layer(s, f, fill, stroke, stroke_fill, pad)
    w, h = layer.width - pad * 2, layer.height - pad * 2
    x, y = xy
    x -= {"l": 0, "m": w / 2, "r": w}[anchor[0]]
    y -= {"a": 0, "m": h / 2, "s": h}[anchor[1]]
    canvas.alpha_composite(layer, (int(x - pad), int(y - pad)))


def place(canvas, layer, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1.0:
        layer = layer.resize((max(1, int(layer.width * scale)), max(1, int(layer.height * scale))), Image.BICUBIC)
    if alpha < 1.0:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


def place_left(canvas, layer, x, cy, alpha=1.0):
    if alpha < 1.0:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer, (int(x), int(cy - layer.height / 2)))


def rounded(draw, box, r, fill, outline=None, width=0):
    draw.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)


def burst(canvas, cx, cy, p, n=18, radius=420, color=GOLD, seed=3):
    rng = random.Random(seed)
    d = ImageDraw.Draw(canvas)
    for i in range(n):
        ang = i / n * 6.28 + rng.uniform(-0.2, 0.2)
        r = radius * ease_out_cubic(p) * rng.uniform(0.6, 1.0)
        s = int(lerp(18, 4, p))
        x, y = cx + math.cos(ang) * r, cy + math.sin(ang) * r
        c = mixc(color, (255, 255, 255), rng.random() * 0.4)
        d.rectangle([x - s, y - s / 3, x + s, y + s / 3], fill=c + (int(255 * (1 - p)),))
        d.rectangle([x - s / 3, y - s, x + s / 3, y + s], fill=c + (int(255 * (1 - p)),))


DUSK = ((22, 18, 52), (112, 52, 92))


# ── Scene 1: intro ─────────────────────────────────────────────────────────

def scene_intro(t):
    c = gradient(*DUSK).copy()
    starfield(c, t)
    mesas(c, t, color=(64, 30, 60), base=H - 160)
    plank_y = 700
    d = ImageDraw.Draw(c)
    d.rectangle([0, plank_y + 58, W, H], fill=(48, 26, 40))
    plank(c, plank_y)
    # The pals pop up from behind the plank one after the other, paws landing on it.
    scale = 12
    h = 28 * scale
    for i, (who, x) in enumerate((("locki", W / 2 - 260), ("cappl", W / 2 + 260))):
        rise = ease_out_back(prog(t, 0.3 + i * 0.35, 0.7))
        if rise <= 0:
            continue
        mood = "happy" if t > 4.2 else "idle"
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cy = lerp(plank_y + h / 2 + 40, plank_y + 34 - h / 2, rise)
        paste_sprite(layer, pose(who, "lv1", mood, t), scale, x, cy)
        # Hide whatever is still below the plank's top.
        cut = Image.new("L", (W, H), 0)
        ImageDraw.Draw(cut).rectangle([0, 0, W, plank_y + 34], fill=255)
        layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (W, H), 0), cut))
        c.alpha_composite(layer)
    word = "cappl-pals"
    f = font("pixel", 118)
    total_w = sum(f.getlength(ch) for ch in word) + 6 * (len(word) - 1)
    x = W / 2 - total_w / 2
    for i, ch in enumerate(word):
        p = prog(t, 1.4 + i * 0.06, 0.35)
        if p > 0:
            col = PINK if i < 5 else TEAL if i > 5 else CREAM
            place(c, text_layer(ch, f, col, stroke=8), x + f.getlength(ch) / 2, 840 - 40 * (1 - ease_out_back(p)), ease_out_back(p), clamp(p * 2))
        x += f.getlength(ch) + 6
    p = prog(t, 2.1, 0.5)
    if p > 0:
        place(c, text_layer("LOCKI & CAPPL  ·  a Claude Code mod", font("bold", 50), WHITE, stroke=4), W / 2, 950, 0.92 + 0.08 * ease_out_back(p), p)
    p = prog(t, 2.7, 0.6)
    if p > 0:
        place(c, text_layer("Your cowboy-hat pals grow with checked results  ·  확인된 작업 결과로 함께 자라는 단짝", font("semi", 32), SAND),
              W / 2, 1022 + 16 * (1 - ease_out_cubic(p)), 1.0, p)
    return c


# ── Scene 2: the premise ───────────────────────────────────────────────────

NO_REWARD = ["Prompts", "Tokens", "Tool calls", "Lines of code"]
REWARD = [("Bullseye", "first pass after edits", "+5"), ("Showdown won", "fail → fix → pass", "+8"),
          ("Claim staked · Gold strike", "commit · merged PR", "+3–15"), ("Campfire rest", "work, then rest", "+2")]


def scene_premise(t):
    lt = t - 6.0
    c = gradient((20, 18, 46), (60, 40, 82)).copy()
    starfield(c, t + 6, density=0.5)
    p = prog(lt, 0.15, 0.5)
    place(c, text_layer("Rewards for results, not tokens", font("xbold", 72), WHITE), W / 2, 120 - 30 * (1 - ease_out_cubic(p)), 1, p)
    place(c, text_layer("토큰이 아니라 결과에 보상합니다", font("semi", 36), SAND), W / 2, 196, 1, p)
    for col, (title, items, x0, accent) in enumerate([("No reward", NO_REWARD, 160, GRAY), ("Rewards", REWARD, 1000, GOLD)]):
        p = prog(lt, 0.5 + col * 0.25, 0.45)
        if p <= 0:
            continue
        off = 40 * (1 - ease_out_cubic(p))
        card = Image.new("RGBA", (760, 560), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, [0, 0, 759, 559], 32, (20, 18, 44, 238), outline=accent + (255,), width=4)
        mark = "✕" if col == 0 else "✦"
        rtext(card, (48, 36), f"{mark} {title}", font("pixel", 52), accent)
        for i, item in enumerate(items):
            pi = prog(lt, 1.0 + col * 1.0 + i * 0.28, 0.3)
            if pi <= 0:
                continue
            y = 140 + i * 100
            a = int(255 * pi)
            if col == 0:
                rtext(card, (60 + 30 * (1 - pi), y + 8), item, font("semi", 46), GRAY + (a,))
                w = font("semi", 46).getlength(item)
                cd.rectangle([60, y + 38, 60 + w * ease_out_cubic(prog(lt, 1.2 + i * 0.28, 0.25)), y + 42], fill=RED + (a,))
            else:
                rounded(cd, [44, y - 6, 716, y + 84], 20, GOLD + (int(36 * pi),))
                rtext(card, (70 + 30 * (1 - pi), y), item[0], font("semi", 40), WHITE + (a,))
                rtext(card, (70 + 30 * (1 - pi), y + 46), item[1], font("medium", 28), MUTED + (a,))
                rtext(card, (690, y + 38), item[2], font("pixel", 42), GOLD + (a,), anchor="rm")
        place(c, card, x0 + 380, 580 + off, 1, clamp(p * 1.5))
    mood = "happy" if lt > 3.5 else "idle"
    paste_sprite(c, pose("locki", "lv5", mood, t), 5, W / 2 - 90, 990)
    paste_sprite(c, pose("cappl", "lv5", mood, t), 5, W / 2 + 90, 990)
    return c


# ── Scene 3: the real session ──────────────────────────────────────────────

TIMES = json.load(open(os.path.join(RENDER, "times.json")))
SW, SH = 3000, 1680
CW, CH = 20, 40
DIV = 109
WIN_W, WIN_H = 1520, 851
WIN_X, WIN_Y = (W - WIN_W) // 2, 34
BAR = 44
CAPTION_Y = 1006
D0, D1 = 12.0, 49.0

# (video start, video end, source start, source end); the source is take3's clock.
SEGMENTS = [
    (12.0, 14.0, 1.3, 1.3),
    (14.0, 15.6, 3.5, 5.4),
    (15.6, 18.6, 5.4, 8.4),
    (18.6, 22.6, 9.5, 18.3),
    (22.6, 23.6, 18.3, 19.3),
    (23.6, 27.4, 19.3, 24.9),
    (27.4, 30.4, 24.9, 26.4),
    (30.4, 33.2, 26.4, 31.9),
    (33.2, 37.0, 33.0, 36.4),
    (37.0, 41.6, 37.6, 41.4),
    (41.6, 43.0, 44.2, 45.7),
    (43.0, D1, 45.7, 45.7),
]


def src_time(t):
    for a, b, s0, s1 in SEGMENTS:
        if a <= t < b:
            return lerp(s0, s1, (t - a) / (b - a))
    return SEGMENTS[-1][3]


def video_time(st):
    """The first video moment that shows source time st."""
    for a, b, s0, s1 in SEGMENTS:
        if s0 <= st <= s1 and s1 > s0:
            return a + (st - s0) / (s1 - s0) * (b - a)
    return None


def frame_index(st):
    lo = 0
    for i, ft in enumerate(TIMES):
        if ft <= st:
            lo = i
    return lo


@lru_cache(maxsize=6)
def term_frame(i):
    return Image.open(os.path.join(RENDER, f"{i:04d}.png")).convert("RGB")


def view(cx, cy, zoom):
    w = SW / zoom
    h = w * WIN_H / WIN_W
    if h > SH:
        h = SH
        w = h * WIN_W / WIN_H
    x0 = clamp(cx - w / 2, 0, SW - w)
    y0 = clamp(cy - h / 2, 0, SH - h)
    return (x0, y0, min(SW, x0 + w), min(SH, y0 + h))


PANE_X = (DIV + 1) * CW
VIEWS = {
    "full": (SW / 2, SH / 2, 1.0),
    "picker": (PANE_X + 400, 420, 2.5),
    "sprite": (PANE_X + 400, 400, 2.4),
    "pane": (PANE_X + 400, 900, 2.3),
    "prompt": (1150, 1460, 1.35),
    "left": (1000, 700, 1.35),
    "rules": (1150, 1180, 1.45),
}
CAMERA = [
    (12.0, "full"), (14.0, "picker"), (15.8, "sprite"), (18.6, "prompt"), (22.6, "full"), (23.6, "left"),
    (27.2, "sprite"), (30.4, "pane"), (37.0, "picker"), (39.6, "sprite"), (41.6, "rules"), (47.6, "full"),
]
MOVE = 0.75
LEVEL_UP = video_time(25.53)


def camera(t):
    prev = VIEWS[CAMERA[0][1]]
    current = prev
    for start, name in CAMERA:
        if t < start:
            break
        p = ease_in_out_cubic(prog(t, start, MOVE))
        target = VIEWS[name]
        current = tuple(lerp(a, b, p) for a, b in zip(prev, target))
        prev = current if p < 1 else target
    box = view(*current)
    if LEVEL_UP <= t < LEVEL_UP + 0.6:
        k = (1 - prog(t, LEVEL_UP, 0.6)) * 18
        dx, dy = math.sin(t * 90) * k, math.cos(t * 77) * k
        dx = clamp(dx, -box[0], SW - box[2])
        dy = clamp(dy, -box[1], SH - box[3])
        box = (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)
    return box


def to_screen(sx, sy, box):
    x0, y0, x1, y1 = box
    return WIN_X + (sx - x0) / (x1 - x0) * WIN_W, WIN_Y + BAR + (sy - y0) / (y1 - y0) * WIN_H


@lru_cache(maxsize=1)
def window_shadow():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([WIN_X + 10, WIN_Y + 24, WIN_X + WIN_W - 10, WIN_Y + BAR + WIN_H + 30], 24, fill=(0, 0, 0, 170))
    return img.filter(ImageFilter.GaussianBlur(28))


CAPTIONS = [
    (14.2, 15.5, "Pick your pal: LOCKI or CAPPL", "함께할 친구를 고릅니다"),
    (15.7, 18.4, "CAPPL rides in: Lv14 Trail Rider, $642", "밴조($650)까지 딱 $8 모자란 상태"),
    (18.8, 22.4, "Ask Claude as usual", "평소처럼 일을 시킵니다: 테스트 → 수정 → 커밋"),
    (23.8, 27.2, "npm test → 1 failing, then a fix", "파이프로 종료 코드가 0이어도 요약 줄로 실패를 잡아냅니다"),
    (31.0, 33.0, "A commit stakes a claim", "테스트로 확인한 커밋 +5 · 작은 커밋 +2 덧보상"),
    (33.4, 36.8, "Gold buys gear, worn right away", "모은 골드로 밴조 구입 · 꾸밈 전용, 뽑기와 거래 없음"),
    (37.2, 41.4, "Switch pals any time", "캐릭터마다 옷장·효과음·반짝임이 따로 · 골드는 함께"),
    (43.0, 48.4, "The rules are out in the open: /cappl-rules", "프롬프트·토큰엔 0 · 같은 날 반복은 ½ → ⅕ · 하루는 새벽 5시에"),
]

# Reward text that pops from a spot on the source screen (pixels).
POPUPS = [
    (video_time(5.6), "Howdy, partner!", PANE_X + 400, 15 * CH, TEAL, "hello_cappl"),
    (video_time(18.55), "+$10 Saddled up", PANE_X + 330, 20.5 * CH, GOLD, "coin_cappl"),
    (video_time(25.55), "+5 Bullseye", PANE_X + 300, 21.5 * CH, GOLD, None),
    (video_time(25.55) + 0.3, "+8 Showdown won", PANE_X + 330, 22.5 * CH, GOLD, None),
    (video_time(30.0), "+10 Claim staked", PANE_X + 330, 23.5 * CH, GOLD, "coin_cappl"),
    (video_time(34.67), "−$650 Banjo!", PANE_X + 330, 18.5 * CH, (252, 165, 165), "buy_cappl"),
    (video_time(40.07), "Howdy! LOCKI's on duty", PANE_X + 400, 15 * CH, PINK, "hello_locki"),
]


def caption(canvas, t, start, end, title, sub):
    p_in = prog(t, start, 0.35)
    p_out = prog(t, end - 0.3, 0.3)
    if p_in <= 0 or p_out >= 1:
        return
    a = ease_out_cubic(p_in) * (1 - p_out)
    t1, t2 = text_layer(title, font("bold", 40), WHITE, pad=0), text_layer(sub, font("medium", 29), SAND, pad=0)
    w = max(t1.width, t2.width) + 110
    layer = Image.new("RGBA", (int(w), 122), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rounded(d, [0, 0, w - 1, 121], 26, (16, 14, 36, 238), outline=PINK + (200,), width=3)
    d.rectangle([26, 26, 33, 61], fill=PINK)
    d.rectangle([26, 61, 33, 96], fill=TEAL)
    layer.alpha_composite(t1, (58, 14))
    layer.alpha_composite(t2, (58, 68))
    place(canvas, layer, W / 2, CAPTION_Y + 18 * (1 - ease_out_cubic(p_in)), 1, a)


def popup(canvas, t, start, label, sx, sy, color, box):
    p = prog(t, start, 1.3)
    if p <= 0 or p >= 1:
        return
    x, y = to_screen(sx, sy, box)
    x = clamp(x, 260, W - 260)
    scale = ease_out_back(clamp(p * 4))
    alpha = 1 - clamp((p - 0.7) / 0.3)
    place(canvas, text_layer(label, font("pixel", 52), color, stroke=7), x, y - 90 * ease_out_cubic(p), scale, alpha)


def level_up(canvas, t):
    p = prog(t, LEVEL_UP, 2.2)
    if p <= 0 or p >= 1:
        return
    a = clamp(p * 8) * (1 - clamp((p - 0.82) / 0.18))
    cy = WIN_Y + BAR + WIN_H / 2
    canvas.alpha_composite(Image.new("RGBA", (W, H), (255, 244, 220, int(150 * (1 - clamp(p * 5))))))
    canvas.alpha_composite(Image.new("RGBA", (W, 300), (16, 14, 36, int(228 * a))), (0, int(cy - 165)))
    burst(canvas, W / 2, cy - 40, clamp(p * 1.6), n=22, radius=760, color=TEAL)
    burst(canvas, W / 2, cy - 40, clamp(p * 1.4), n=16, radius=640, color=GOLD, seed=8)
    place(canvas, text_layer("LEVEL UP!", font("pixel", 128), GOLD, stroke=10), W / 2, cy - 64, ease_out_back(clamp(p * 3.5)), a)
    place(canvas, text_layer("Lv15 · new rank: Wrangler  ·  새 계급: 카우보이", font("bold", 50), WHITE, stroke=4), W / 2, cy + 64,
          ease_out_back(clamp(p * 6 - 0.4)), a)


def keycaps(canvas, t, start, keys, x, y):
    p = prog(t, start, 1.6)
    if p <= 0 or p >= 1:
        return
    a = clamp(p * 5) * (1 - clamp((p - 0.8) / 0.2))
    f = font("monob", 40)
    cx = x
    for i, k in enumerate(keys):
        press = prog(t, start + 0.25 + i * 0.3, 0.18)
        down = 6 * math.sin(press * math.pi)
        w = f.getlength(k) + 44
        layer = Image.new("RGBA", (int(w) + 8, 86), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        rounded(d, [0, 10, w, 80], 14, (40, 46, 80, 255))
        rounded(d, [0, down, w, 70 + down], 14, (238, 242, 255, 255), outline=(148, 163, 184, 255), width=2)
        d.text((w / 2, 35 + down), k, font=f, fill=INK, anchor="mm")
        place(canvas, layer, cx + w / 2, y, 1, a)
        cx += w + 26
        if i < len(keys) - 1:
            rtext(canvas, (cx - 13, y), "→", font("bold", 40), (226, 232, 240, int(255 * a)), anchor="mm", pad=4)


KEYS = [(video_time(5.0) - 0.85, ["ctrl+x", "Tab", "2"]), (video_time(34.55) - 0.85, ["ctrl+x", "Tab", "5"]),
        (video_time(37.75) - 0.25, ["c"]), (video_time(40.0) - 0.25, ["1"])]

PROMPT = (
    "Run npm test. If it fails, fix src/trail.js and run the tests again. "
    "When they pass, commit with git commit -qam 'Pad minutes in ride time' and answer in one line."
)
TYPE_START, TYPE_END, SUBMIT = 9.6, 18.0, 18.37


def wrap(s, f, width):
    lines, line = [], ""
    for word in s.split(" "):
        trial = (line + " " + word).strip()
        if f.getlength(trial) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line]


def typing_bubble(canvas, t):
    if not (18.6 <= t < 23.4):
        return
    st = src_time(t)
    count = int(clamp((st - TYPE_START) / (TYPE_END - TYPE_START)) * len(PROMPT))
    typed = PROMPT[:count]
    a = ease_out_cubic(prog(t, 18.6, 0.35)) * (1 - prog(t, 22.9, 0.45))
    f = font("semi", 38)
    lines = wrap(typed, f, 1140) if typed else [""]
    h = 120 + 56 * len(lines)
    layer = Image.new("RGBA", (1280, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rounded(d, [0, 0, 1279, h - 1], 26, (16, 14, 36, 242), outline=PINK + (220,), width=3)
    rtext(layer, (44, 30), "Prompt", font("bold", 26), PINK, pad=4)
    sent = st >= SUBMIT
    if sent:
        rtext(layer, (1236, 30), "Enter ⏎ sent", font("bold", 26), (134, 239, 172), anchor="ra", pad=4)
    y = 78
    for i, line in enumerate(lines):
        rtext(layer, (44, y), ("❯ " if i == 0 else "   ") + line, f, WHITE, pad=4)
        if i == len(lines) - 1 and not sent and int(t * 2.5) % 2 == 0:
            x = 44 + f.getlength(("❯ " if i == 0 else "   ") + line) + 6
            d.rectangle([x, y + 6, x + 4, y + 46], fill=PINK)
        y += 56
    place(canvas, layer, W / 2, WIN_Y + BAR + 420, lerp(0.96, 1.0, ease_out_cubic(prog(t, 18.6, 0.35))), a)


def live_badge(chrome, t):
    d = ImageDraw.Draw(chrome)
    x = 120
    rounded(d, [x, 9, x + 470, 35], 13, (16, 14, 36, 255), outline=RED + (255,), width=2)
    if int(t * 2) % 2 == 0:
        d.ellipse([x + 12, 16, x + 24, 28], fill=RED)
    rtext(chrome, (x + 34, 22), "LIVE  real Claude Code session · Haiku 5.5", font("semi", 21), WHITE, anchor="lm", pad=4)


def scene_demo(t):
    c = gradient((18, 16, 40), (44, 30, 66)).copy()
    starfield(c, t, density=0.35)
    intro = ease_out_cubic(prog(t, D0, 0.7))
    c.alpha_composite(window_shadow())
    box = camera(t)
    frame = term_frame(frame_index(src_time(t)))
    shot = frame.resize((WIN_W, WIN_H), Image.LANCZOS, box=box).convert("RGBA")
    chrome = Image.new("RGBA", (WIN_W, WIN_H + BAR), (0, 0, 0, 0))
    d = ImageDraw.Draw(chrome)
    rounded(d, [0, 0, WIN_W - 1, WIN_H + BAR - 1], 18, (30, 32, 44, 255))
    for i, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([22 + i * 30, 15, 38 + i * 30, 31], fill=col)
    d.text((WIN_W / 2, 22), "claude — ~/trail", font=font("medium", 22), fill=(160, 166, 190), anchor="mm")
    live_badge(chrome, t)
    chrome.paste(shot, (0, BAR))
    mask = Image.new("L", chrome.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, WIN_W - 1, WIN_H + BAR - 1], 18, fill=255)
    chrome.putalpha(mask)
    if intro < 1:
        s = lerp(0.9, 1.0, intro)
        chrome = chrome.resize((int(chrome.width * s), int(chrome.height * s)), Image.BICUBIC)
        chrome.putalpha(chrome.getchannel("A").point(lambda v: int(v * intro)))
    c.alpha_composite(chrome, (int(W / 2 - chrome.width / 2), int(WIN_Y + (WIN_H + BAR) / 2 - chrome.height / 2)))
    typing_bubble(c, t)
    for start, end, title, sub in CAPTIONS:
        caption(c, t, start, end, title, sub)
    for start, label, sx, sy, color, _ in POPUPS:
        popup(c, t, start, label, sx, sy, color, box)
    for start, keys in KEYS:
        keycaps(c, t, start, keys, WIN_X + 40, WIN_Y + BAR + 80)
    level_up(c, t)
    return c


# ── Scene 4: the 1,000-hour trail ──────────────────────────────────────────

RANKS = [
    (1, "Greenhorn", "새내기", 0, "lv1", ((40, 30, 62), (226, 150, 120))),
    (5, "Stable Hand", "마구간지기", 11, "lv5", ((54, 28, 30), (170, 84, 62))),
    (10, "Trail Rider", "길잡이 기수", 44, "lv10", ((70, 36, 22), (214, 132, 60))),
    (15, "Wrangler", "카우보이", 99, "lv15", ((26, 48, 40), (96, 150, 92))),
    (20, "Rodeo Rookie", "로데오 신인", 173, "lv20", ((44, 20, 58), (150, 70, 130))),
    (25, "Deputy", "보안관 보좌관", 268, "lv20", ((16, 24, 64), (60, 90, 170))),
    (30, "Ranger", "레인저", 381, "lv30", ((14, 40, 44), (40, 120, 120))),
    (35, "Sheriff", "보안관", 513, "lv30", ((60, 30, 10), (200, 130, 40))),
    (40, "Marshal", "연방 보안관", 664, "lv40", ((14, 18, 54), (60, 70, 160))),
    (45, "Frontier Hero", "개척지 영웅", 832, "lv40", ((60, 18, 40), (230, 110, 80))),
    (50, "Legend of the West", "서부의 전설", 1019, "lv50", ((20, 14, 50), (120, 60, 130))),
]
FAME = {1: 0, 5: 271, 10: 1134, 15: 2538, 20: 4458, 25: 6881, 30: 9794, 35: 13189, 40: 17057, 45: 21392, 50: 26189}
J0 = 49.0
J_HEAD = 1.5
J_STEP = 1.25


def fans_of(fame):
    return int(fame * 3 + (fame / 40) ** 2)


def crowd(canvas, t, shade=(16, 12, 26)):
    d = ImageDraw.Draw(canvas)
    rng = random.Random(11)
    for i in range(30):
        x = i * 66 + rng.uniform(-10, 10)
        r = rng.uniform(20, 26)
        base = 1004 + rng.uniform(-12, 12)
        bob = abs(math.sin(t * 6 + i * 0.9)) * 12
        d.rounded_rectangle([x - r * 1.7, base - bob + r * 0.9, x + r * 1.7, H + 20], int(r), fill=shade)
        d.ellipse([x - r, base - bob - r, x + r, base - bob + r], fill=shade)
        # A cowboy hat on every head.
        d.rectangle([x - r * 1.6, base - bob - r * 0.9, x + r * 1.6, base - bob - r * 0.6], fill=shade)
        d.rounded_rectangle([x - r * 0.8, base - bob - r * 1.8, x + r * 0.8, base - bob - r * 0.7], 6, fill=shade)
        if i % 5 == 2:
            arm = base - bob - r * 3.0
            d.line([(x + r * 1.1, base - bob + r), (x + r * 1.6, arm)], fill=shade, width=12)
            d.rectangle([x + r * 1.6 - 5, arm - 24, x + r * 1.6 + 5, arm], fill=PINK if int(t * 4 + i) % 2 else TEAL)


def scene_journey(t):
    lt = t - J0
    idx = int(clamp((lt - J_HEAD) / J_STEP, 0, len(RANKS) - 1)) if lt >= J_HEAD else 0
    level, name, name_ko, hours, look, (top, bottom) = RANKS[idx]
    since = lt - J_HEAD - idx * J_STEP if lt >= J_HEAD else 0
    if idx > 0 and since < 0.35:
        prev = RANKS[idx - 1][5]
        k = since / 0.35
        top, bottom = mixc(prev[0], top, k), mixc(prev[1], bottom, k)
    c = gradient(top, bottom).copy()
    starfield(c, t, drift=24 + idx * 6, density=0.5 if level < 40 else 0.9)
    mesas(c, t, color=mixc(top, (0, 0, 0), 0.45), base=H, drift=20 + idx * 4)
    if level >= 25:
        for side in (0, 1):
            x0 = 0 if side == 0 else W
            sway = math.sin(t * 1.3 + side) * 120
            poly = [(x0, -20), (x0 + (1 if side == 0 else -1) * 60, -20), (W / 2 + sway + (180 if side == 0 else -180), H), (W / 2 + sway, H)]
            beam = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(beam).polygon(poly, fill=(255, 243, 220, 34))
            c.alpha_composite(beam)
    if level >= 45:
        for j in range(4):
            bp = ((t * 0.6 + j * 0.27) % 1.0)
            burst(c, 300 + j * 440, 230 + (j % 2) * 110, bp, n=14, radius=160, color=[PINK, GOLD, TEAL, CREAM][j], seed=j + idx)
    if level >= 35:
        crowd(c, t)
    if lt < J_HEAD + 0.2:
        p = prog(lt, 0.0, 0.5)
        a = 1 - prog(lt, J_HEAD - 0.3, 0.4)
        place(c, text_layer("About 1,000 hours on the trail", font("xbold", 86), WHITE), W / 2, 450 - 30 * (1 - ease_out_cubic(p)), 1, p * a)
        place(c, text_layer("약 1,000시간의 여정 · 실제 Claude Code 기록 27일(활동 185시간)로 맞춘 성장 곡선", font("medium", 36), SAND), W / 2, 560, 1, p * a)
        return c
    pop = ease_out_back(clamp(since / 0.4)) if since < 0.4 else 1.0
    happy = since < 0.6
    for who, x in (("locki", 380), ("cappl", 760)):
        paste_sprite(c, pose(who, look, "happy" if happy else "idle", t), 10, x, 470, pop, pop)
    tx = 1060
    p = ease_out_cubic(clamp(since / 0.35))
    place_left(c, text_layer(f"Lv{level}", font("pixel", 74), GOLD, stroke=6), tx - 40 * (1 - p), 300, p)
    place_left(c, text_layer(name, font("xbold", 84), WHITE, stroke=3), tx - 60 * (1 - p), 410, p)
    place_left(c, text_layer(name_ko, font("semi", 44), SAND, stroke=2), tx - 60 * (1 - p), 496, p)
    fans = fans_of(FAME[level])
    shown = int(lerp(fans_of(FAME[RANKS[idx - 1][0]]) if idx else 0, fans, ease_out_cubic(clamp(since / 0.8))))
    place_left(c, text_layer(f"≈ {hours:,} active hours  ·  {shown:,} fans", font("semi", 40), (226, 232, 240)), tx, 580, p)
    bar_x0, bar_x1, bar_y = 160, 1760, 860 if level < 35 else 820
    d = ImageDraw.Draw(c)
    rounded(d, [bar_x0, bar_y - 8, bar_x1, bar_y + 8], 8, (255, 255, 255, 60))
    target = hours / 1019
    prev_h = RANKS[idx - 1][3] / 1019 if idx else 0
    cur = lerp(prev_h, target, ease_in_out_cubic(clamp(since / 0.6)))
    rounded(d, [bar_x0, bar_y - 8, bar_x0 + (bar_x1 - bar_x0) * cur, bar_y + 8], 8, PINK)
    for _, _, _, h, _, _ in RANKS:
        x = bar_x0 + (bar_x1 - bar_x0) * h / 1019
        d.rectangle([x - 2, bar_y + 14, x + 2, bar_y + 26], fill=(255, 255, 255, 150))
    d.text((bar_x0, bar_y + 46), "0h", font=font("semi", 28), fill=(226, 232, 240), anchor="lm")
    d.text((bar_x1, bar_y + 46), "1,019h", font=font("semi", 28), fill=(226, 232, 240), anchor="rm")
    mx = bar_x0 + (bar_x1 - bar_x0) * cur
    paste_sprite(c, pose("cappl", look, "idle", 0), 2, mx + 20, bar_y - 40)
    paste_sprite(c, pose("locki", look, "idle", 0), 2, mx - 20, bar_y - 40)
    return c


# ── Scene 5: what you get ──────────────────────────────────────────────────

FEATURES = [
    ("⇄", "Two pals, your pick", "캐릭터마다 옷장 10벌 · 효과음 · 반짝임"),
    ("✓", "Results only", "테스트 통과 · 역전 · 커밋 · 병합에만 보상"),
    ("½", "No grind, no guilt", "같은 날 반복은 ½ → ⅕ · 연속 출석 없음"),
    ("∑", "Every session in sync", "여러 세션 합산·즉시 반영 · English & 한국어"),
]
F0 = 64.5


def scene_features(t):
    lt = t - F0
    c = gradient((22, 18, 48), (60, 40, 86)).copy()
    starfield(c, t, density=0.5)
    p = prog(lt, 0.1, 0.5)
    place(c, text_layer("What's in cappl-pals", font("xbold", 72), WHITE), W / 2, 140, 1, p)
    for i, (icon, title, sub) in enumerate(FEATURES):
        pi = prog(lt, 0.4 + i * 0.18, 0.45)
        if pi <= 0:
            continue
        x = 140 + (i % 2) * 840
        y = 290 + (i // 2) * 330
        accent = PINK if i % 2 == 0 else TEAL
        card = Image.new("RGBA", (800, 290), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, [0, 0, 799, 289], 30, (22, 18, 48, 240), outline=accent + (170,), width=3)
        rounded(cd, [40, 70, 190, 220], 28, accent)
        rtext(card, (115, 145), icon, font("bold", 92), INK, anchor="mm", pad=8)
        rtext(card, (230, 92), title, font("bold", 50), WHITE)
        rtext(card, (230, 170), sub, font("medium", 31), MUTED)
        place(c, card, x + 400, y + 145 + 40 * (1 - ease_out_cubic(pi)), 1, pi)
    paste_sprite(c, pose("locki", "lv30", "happy", t), 4, W - 250, 985)
    paste_sprite(c, pose("cappl", "lv30", "happy", t + 0.2), 4, W - 110, 985)
    return c


# ── Scene 6: the end ───────────────────────────────────────────────────────

O0 = 71.0


def scene_outro(t):
    lt = t - O0
    c = gradient((16, 12, 44), (96, 46, 78)).copy()
    starfield(c, t, density=0.9, drift=16)
    mesas(c, t, color=(46, 24, 48), base=H)
    for j, (bx, by) in enumerate([(240, 190), (560, 330), (1360, 330), (1680, 190)]):
        bp = ((lt * 0.55 + j * 0.23) % 1.0)
        burst(c, bx, by, bp, n=16, radius=180, color=[PINK, GOLD, TEAL, CREAM][j], seed=j + 40)
    p = prog(lt, 0.0, 0.8)
    rise = 60 * (1 - ease_out_back(p))
    happy = lt < 1.6
    paste_sprite(c, pose("locki", "lv50", "happy" if happy else "idle", t), 10, W / 2 - 210, 380 + rise)
    paste_sprite(c, pose("cappl", "lv50", "happy" if happy else "idle", t + 0.1), 10, W / 2 + 210, 380 + rise)
    p = prog(lt, 0.6, 0.5)
    place(c, text_layer("cappl-pals", font("pixel", 104), CREAM, stroke=8), W / 2, 640, ease_out_back(p), clamp(p * 2))
    p = prog(lt, 1.0, 0.5)
    place(c, text_layer("LOCKI & CAPPL grow with your Claude Code work", font("bold", 44), WHITE), W / 2, 735, 1, p)
    p = prog(lt, 1.5, 0.5)
    if p > 0:
        cmd = "/plugin install cappl-pals --marketplace develinu/cappl-pals"
        f = font("mono", 38)
        w = f.getlength(cmd) + 120
        chip = Image.new("RGBA", (int(w), 84), (0, 0, 0, 0))
        cd = ImageDraw.Draw(chip)
        rounded(cd, [0, 0, w - 1, 83], 20, (16, 14, 36, 240), outline=PINK + (210,), width=2)
        rtext(chip, (36, 42), "❯", f, PINK, anchor="lm", pad=4)
        cd.text((80, 42), cmd, font=f, fill=WHITE, anchor="lm")
        place(c, chip, W / 2, 850, 1, p)
    p = prog(lt, 2.0, 0.5)
    place(c, text_layer("github.com/develinu/cappl-pals  ·  open source (MIT)", font("semi", 32), SAND), W / 2, 950, 1, p * 0.95)
    p = prog(lt, 2.4, 0.5)
    place(c, text_layer("LOCKI and CAPPL are characters of the CAPPL app, used with permission", font("medium", 24), (226, 214, 200)),
          W / 2, 1010, 1, p * 0.75)
    fade = prog(lt, 6.4, 0.6)
    if fade > 0:
        c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fade))))
    return c


# ── Transitions: a star opens the next scene ───────────────────────────────

SCENES = [(0.0, 6.0, scene_intro), (6.0, D0, scene_premise), (D0, D1, scene_demo),
          (J0, F0, scene_journey), (F0, O0, scene_features), (O0, TOTAL, scene_outro)]
WIPE = 0.6


def star_points(cx, cy, r, rot=0.0):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.48
        a = rot - math.pi / 2 + i * math.pi / 5
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


def render_frame(t):
    for i, (a, b, fn) in enumerate(SCENES):
        if a <= t < b:
            base = fn(t)
            nxt = SCENES[i + 1] if i + 1 < len(SCENES) else None
            if nxt and t >= b - WIPE / 2:
                return wipe(base, nxt[2](max(nxt[0], t)), prog(t, b - WIPE / 2, WIPE))
            if i > 0 and t < a + WIPE / 2:
                return wipe(SCENES[i - 1][2](min(SCENES[i - 1][1] - 1e-3, t)), base, prog(t, a - WIPE / 2, WIPE))
            return base
    return scene_outro(TOTAL - 1e-3)


def wipe(a, b, p):
    r = ease_in_out_cubic(p) * 1500
    mask = Image.new("L", (W, H), 0)
    pts = star_points(W / 2, H / 2, r, rot=p * 1.2)
    if r > 2:
        ImageDraw.Draw(mask).polygon(pts, fill=255)
    out = Image.composite(b, a, mask)
    if 0.02 < p < 0.98:
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ring).line(pts + [pts[0]], fill=PINK + (255,), width=22, joint="curve")
        out.alpha_composite(ring)
    return out


# ── Sound cues ─────────────────────────────────────────────────────────────

def events():
    ev = [(0.3, "pop"), (0.65, "pop"), (5.7, "wipe"), (D0 - 0.3, "wipe"), (D1 - 0.3, "wipe"), (F0 - 0.3, "wipe"), (O0 - 0.3, "wipe")]
    for i in range(10):
        ev.append((1.4 + i * 0.06, "blip"))
    for col in range(2):
        for i in range(4):
            ev.append((6.0 + 1.0 + col * 1.0 + i * 0.28, "tick" if col == 0 else "coin_small"))
    # Typing: the keystrokes between source 9.6 and 18.0 moved to video time.
    for k in range(len(PROMPT)):
        st = TYPE_START + k * (TYPE_END - TYPE_START) / len(PROMPT)
        vt = video_time(st)
        if vt is not None and k % 2 == 0:
            ev.append((vt, "key"))
    for start, label, *_rest, sound in POPUPS:
        if sound:
            ev.append((start, sound))
    ev.append((LEVEL_UP, "stage_cappl"))
    for start, keys in KEYS:
        for k in range(len(keys)):
            ev.append((start + 0.25 + k * 0.3, "key_big"))
    for i in range(len(RANKS)):
        ev.append((J0 + J_HEAD + i * J_STEP, "rank" if i < len(RANKS) - 1 else "fanfare_locki"))
    for i in range(4):
        ev.append((F0 + 0.4 + i * 0.18, "tick"))
    ev.append((O0 + 0.6, "fanfare_end"))
    return sorted(ev)


SECTIONS = [(0.0, "intro"), (6.0, "premise"), (D0, "demo"), (J0, "journey"), (F0, "features"), (O0, "outro")]


def main():
    os.makedirs(OUT, exist_ok=True)
    mode = sys.argv[1]
    if mode == "stills":
        for s in sys.argv[2:]:
            t = float(s)
            render_frame(t).convert("RGB").save(os.path.join(OUT, f"still-{t:05.1f}.png"))
        return
    json.dump({"events": events(), "sections": SECTIONS, "total": TOTAL}, open(os.path.join(OUT, "events.json"), "w"), indent=1)
    ff = subprocess.run([os.path.join(HERE, ".venv/bin/python"), "-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"],
                        capture_output=True, text=True).stdout.strip()
    proc = subprocess.Popen([ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                             "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                             os.path.join(OUT, "video.mp4")], stdin=subprocess.PIPE)
    n = int(TOTAL * FPS)
    for k in range(n):
        proc.stdin.write(render_frame(k / FPS).convert("RGB").tobytes())
        if k % 150 == 0:
            print(f"{k}/{n}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("done", os.path.join(OUT, "video.mp4"))


if __name__ == "__main__":
    main()
