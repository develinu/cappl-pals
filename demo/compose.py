"""cappl-pals demo video: a real Claude Code session (frames from record.py) plus motion graphics.

Usage:
  .venv/bin/python compose.py video en                # out/video-en.mp4 (no sound) + out/events-en.json
  .venv/bin/python compose.py video ko                # the Korean cut, from the Korean take
  .venv/bin/python compose.py stills ko 3.0 27.8 50   # PNGs of those moments
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
LANG = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] in ("en", "ko") else "en"
RENDER = f"/tmp/cappl-demo/render-v2-{LANG}"
W, H, FPS = 1920, 1080, 30

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


TICK = 0.25


def pose(character, look, moment, t, start=0.0, once=False):
    """A pose key at time t: the moment's frame (one every 250 ms, as in the mod), looped
    unless `once` holds the last frame."""
    n = POSES["ticks"][f"{character}:{moment}"]
    k = int(max(0.0, t - start) / TICK)
    k = min(k, n - 1) if once else k % n
    return f"{character}:{look}:{moment}:{k}"


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

# Every word on screen, per language.
TEXT = {
    "en": {
        "tagline_title": "LOCKI & CAPPL  ·  a Claude Code mod",
        "tagline": "Cowboy-hat pals that follow your session and grow with your results",
        "moods": "Your pal follows the session",
        "moods_sub": "A new face for every moment, in the terminal and the desktop app",
        "mood_cards": [("thinking", "Claude is thinking"), ("editing", "Editing files"), ("testing", "Running tests"),
                       ("fail", "A test fails"), ("waiting", "Needs your OK"), ("dance1", "Turn done"),
                       ("pet", "You pet it"), ("sleeping", "Five quiet minutes")],
        "premise": "Rewards for results, not tokens",
        "premise_sub": "Passing tests, clean checks, commits and PRs pay. Busywork doesn't.",
        "no_reward": "No reward",
        "reward": "Rewards",
        "no_items": ["Prompts", "Tokens", "Tool calls", "Lines of code"],
        "items": [("Bullseye · Showdown won", "tests pass · fail → fix → pass", "+5–8"),
                  ("Clean shot · Poster up", "clean type check · new PR", "+2–4"),
                  ("Claim staked · Gold strike", "commit · merged PR", "+3–15"),
                  ("Campfire rest", "work, then rest", "+2")],
        "live": "LIVE  real Claude Code session · Haiku 5.5",
        "prompt": "Prompt",
        "sent": "Enter ⏎ sent",
        "level_sub": "Lv35 · new rank: Sheriff",
        "bonus": "Gold, all day long",
        "bonus_sub": "Rep paces your rank and tricks. Gold buys treats and gear.",
        "bonus_cards": [("bigCelebrate", "Level chest", "$5 + level", "every level"),
                        ("petMore", "Bounties", "$5–15", "three a day, +$15 for all"),
                        ("lucky", "Lucky nugget", "$5–15", "one result in sixteen"),
                        ("treat", "Treats", "$6", "a blush and extra tricks")],
        "journey": "About 830 hours to Lv50",
        "journey_sub": "Tuned on 28 days (189 active hours) of real Claude Code history",
        "journey_stats": lambda h, k: f"≈ {h:,} active hours  ·  {k} tricks",
        "outro_line": "LOCKI & CAPPL grow with your Claude Code work",
        "outro_repo": "github.com/develinu/cappl-pals  ·  open source (MIT)",
        "outro_credit": "LOCKI and CAPPL are characters of the CAPPL app, used with permission",
    },
    "ko": {
        "tagline_title": "LOCKI & CAPPL  ·  Claude Code mod",
        "tagline": "세션 따라 표정이 바뀌고, 작업 결과로 함께 자라는 카우보이모자 단짝",
        "moods": "세션 따라 바뀌는 표정",
        "moods_sub": "순간마다 다른 얼굴, 터미널과 데스크톱 앱 모두에서",
        "mood_cards": [("thinking", "Claude가 생각하는 중"), ("editing", "파일 수정"), ("testing", "테스트 실행"),
                       ("fail", "테스트 실패"), ("waiting", "권한 확인 대기"), ("dance1", "턴 끝"),
                       ("pet", "쓰다듬기"), ("sleeping", "5분 동안 조용")],
        "premise": "토큰이 아니라, 결과에 보상합니다",
        "premise_sub": "테스트 통과·깔끔한 검사·커밋·PR에만 보상하고, 활동량에는 주지 않아요",
        "no_reward": "보상 없음",
        "reward": "보상",
        "no_items": ["프롬프트 수", "토큰 사용량", "도구 호출 수", "코드 줄 수"],
        "items": [("과녁 명중 · 결투 승리", "테스트 통과 · 실패 → 수정 → 통과", "+5–8"),
                  ("깔끔한 사격 · 전단 붙이기", "오류 없는 타입 검사 · 새 PR", "+2–4"),
                  ("말뚝 박기 · 금맥 발견", "커밋 · PR 병합", "+3–15"),
                  ("모닥불 휴식", "오래 일하고 쉬고 오기", "+2")],
        "live": "LIVE  실제 Claude Code 세션 · Haiku 5.5",
        "prompt": "프롬프트",
        "sent": "Enter ⏎ 보냄",
        "level_sub": "Lv35 · 새 계급: 보안관",
        "bonus": "골드는 하루 종일",
        "bonus_sub": "명성은 계급과 재주를, 골드는 간식과 소품을 삽니다",
        "bonus_cards": [("bigCelebrate", "레벨 상자", "$5 + 레벨", "레벨이 오를 때마다"),
                        ("petMore", "현상금", "$5–15", "하루 세 개, 다 하면 $15 더"),
                        ("lucky", "행운의 사금", "$5–15", "결과 열여섯 번에 한 번꼴"),
                        ("treat", "간식", "$6", "발그레한 볼, 재주 두 배")],
        "journey": "Lv50까지 약 830시간",
        "journey_sub": "실제 Claude Code 기록 28일(활동 189시간)로 맞춘 성장 곡선",
        "journey_stats": lambda h, k: f"활동 ≈ {h:,}시간  ·  재주 {k}개",
        "outro_line": "Claude Code 작업과 함께 자라는 LOCKI & CAPPL",
        "outro_repo": "github.com/develinu/cappl-pals  ·  오픈소스(MIT)",
        "outro_credit": "LOCKI와 CAPPL은 CAPPL 앱의 캐릭터로, 허가를 받아 사용합니다",
    },
}[LANG]

# Scene starts (the live session's length decides where the later ones go).
M0, P0, D0 = 6.0, 13.5, 19.0


# ── Scene 1: intro ─────────────────────────────────────────────────────────

def scene_intro(t):
    c = gradient(*DUSK).copy()
    starfield(c, t)
    mesas(c, t, color=(64, 30, 60), base=H - 160)
    plank_y = 700
    d = ImageDraw.Draw(c)
    d.rectangle([0, plank_y + 58, W, H], fill=(48, 26, 40))
    plank(c, plank_y)
    # The pals pop up from behind the plank one after the other, wave, then cheer.
    scale = 12
    h = 28 * scale
    for i, (who, x) in enumerate((("locki", W / 2 - 260), ("cappl", W / 2 + 260))):
        rise = ease_out_back(prog(t, 0.3 + i * 0.35, 0.7))
        if rise <= 0:
            continue
        if t < 1.8 + i * 0.3:
            key = pose(who, "lv1", "still", t)
        elif t < 4.2:
            key = pose(who, "lv1", "hello", t, start=1.8 + i * 0.3)
        else:
            key = pose(who, "lv1", "celebrate", t, start=4.2)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cy = lerp(plank_y + h / 2 + 40, plank_y + 34 - h / 2, rise)
        paste_sprite(layer, key, scale, x, cy)
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
        place(c, text_layer(TEXT["tagline_title"], font("bold", 50), WHITE, stroke=4), W / 2, 950, 0.92 + 0.08 * ease_out_back(p), p)
    p = prog(t, 2.7, 0.6)
    if p > 0:
        place(c, text_layer(TEXT["tagline"], font("semi", 34), SAND),
              W / 2, 1022 + 16 * (1 - ease_out_cubic(p)), 1.0, p)
    return c


# ── Scene 2: moods ─────────────────────────────────────────────────────────

def scene_moods(t):
    lt = t - M0
    c = gradient((24, 18, 52), (74, 40, 88)).copy()
    starfield(c, t + 3, density=0.5)
    p = prog(lt, 0.1, 0.5)
    place(c, text_layer(TEXT["moods"], font("xbold", 70), WHITE), W / 2, 104 - 30 * (1 - ease_out_cubic(p)), 1, p)
    place(c, text_layer(TEXT["moods_sub"], font("semi", 32), SAND), W / 2, 178, 1, p)
    for i, (moment, label) in enumerate(TEXT["mood_cards"]):
        start = 0.45 + i * 0.22
        pi = prog(lt, start, 0.4)
        if pi <= 0:
            continue
        who = "cappl" if i % 2 == 0 else "locki"
        accent = TEAL if who == "cappl" else PINK
        cx = 270 + (i % 4) * 460
        cy = 450 + (i // 4) * 400
        card = Image.new("RGBA", (420, 370), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, [0, 0, 419, 369], 30, (20, 16, 44, 236), outline=accent + (200,), width=3)
        paste_sprite(card, pose(who, "lv1", moment, t, start=M0 + start), 8, 210, 160)
        rtext(card, (210, 318), label, font("bold", 36), WHITE, anchor="mm", pad=6)
        place(c, card, cx, cy + 40 * (1 - ease_out_back(pi)), lerp(0.85, 1.0, ease_out_back(pi)), clamp(pi * 2))
    return c


# ── Scene 3: the premise ───────────────────────────────────────────────────

NO_REWARD = TEXT["no_items"]
REWARD = TEXT["items"]


def scene_premise(t):
    lt = t - P0
    c = gradient((20, 18, 46), (60, 40, 82)).copy()
    starfield(c, t + 6, density=0.5)
    p = prog(lt, 0.15, 0.5)
    place(c, text_layer(TEXT["premise"], font("xbold", 72), WHITE), W / 2, 120 - 30 * (1 - ease_out_cubic(p)), 1, p)
    place(c, text_layer(TEXT["premise_sub"], font("semi", 34), SAND), W / 2, 196, 1, p)
    for col, (title, items, x0, accent) in enumerate([(TEXT["no_reward"], NO_REWARD, 160, GRAY), (TEXT["reward"], REWARD, 1000, GOLD)]):
        p = prog(lt, 0.4 + col * 0.2, 0.45)
        if p <= 0:
            continue
        off = 40 * (1 - ease_out_cubic(p))
        card = Image.new("RGBA", (760, 560), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, [0, 0, 759, 559], 32, (20, 18, 44, 238), outline=accent + (255,), width=4)
        mark = "✕" if col == 0 else "✦"
        rtext(card, (48, 36), f"{mark} {title}", font("pixel", 52), accent)
        for i, item in enumerate(items):
            pi = prog(lt, 0.8 + col * 0.9 + i * 0.25, 0.3)
            if pi <= 0:
                continue
            y = 140 + i * 100
            a = int(255 * pi)
            if col == 0:
                rtext(card, (60 + 30 * (1 - pi), y + 8), item, font("semi", 46), GRAY + (a,))
                w = font("semi", 46).getlength(item)
                cd.rectangle([60, y + 38, 60 + w * ease_out_cubic(prog(lt, 1.0 + i * 0.25, 0.25)), y + 42], fill=RED + (a,))
            else:
                rounded(cd, [44, y - 6, 716, y + 84], 20, GOLD + (int(36 * pi),))
                rtext(card, (70 + 30 * (1 - pi), y), item[0], font("semi", 38), WHITE + (a,))
                rtext(card, (70 + 30 * (1 - pi), y + 46), item[1], font("medium", 27), MUTED + (a,))
                rtext(card, (690, y + 38), item[2], font("pixel", 40), GOLD + (a,), anchor="rm")
        place(c, card, x0 + 380, 580 + off, 1, clamp(p * 1.5))
    moment = "celebrate" if lt > 3.2 else "still"
    paste_sprite(c, pose("locki", "lv5", moment, t, start=P0 + 3.2), 5, W / 2 - 90, 990)
    paste_sprite(c, pose("cappl", "lv5", moment, t, start=P0 + 3.2), 5, W / 2 + 90, 990)
    return c


# ── Scene 4: the real session ──────────────────────────────────────────────

TIMES = json.load(open(os.path.join(RENDER, "times.json")))
SW, SH = 3000, 1680
CW, CH = 20, 40
DIV = 114
WIN_W, WIN_H = 1520, 851
WIN_X, WIN_Y = (W - WIN_W) // 2, 34
BAR = 44
CAPTION_Y = 1006

# Moments in each take (source seconds), found in record.py's marks and the frames.
ANCHORS = {
    "en": {"ready": 1.7, "pick": 5.94, "type": 9.95, "submit": 18.87, "saddled": 19.13, "fail": 23.4, "levelup": 29.13,
           "claim": 33.13, "done": 35.07, "pet": 38.48, "bounty": 40.07, "trick": 45.59, "treat": 49.99, "shop": 54.99,
           "switch": 58.4, "locki": 60.67, "petlocki": 63.6},
    "ko": {"ready": 1.3, "pick": 5.5, "type": 9.5, "submit": 15.5, "saddled": 15.67, "fail": 17.93, "levelup": 22.47,
           "claim": 24.27, "done": 25.67, "pet": 31.0, "bounty": 32.6, "trick": 38.1, "treat": 42.5, "shop": 47.5,
           "switch": 50.9, "locki": 53.27, "petlocki": 56.2},
}[LANG]
A = ANCHORS
# (name, source start, source end, video length or None for real time)
PLAN = [
    ("intro", A["ready"], A["ready"], 1.6),
    ("picker", A["pick"] - 1.9, A["pick"], 1.6),
    ("hello", A["pick"], A["pick"] + 3.0, None),
    ("typing", A["type"], A["submit"] - 0.2, 3.2),
    ("submit", A["submit"] - 0.2, A["submit"] + 0.8, None),
    ("thinking", A["submit"] + 0.8, A["fail"], 3.2),
    ("fail", A["fail"], A["fail"] + 2.2, None),
    ("fixing", A["fail"] + 2.2, A["levelup"] - 0.1, 1.8),
    ("levelup", A["levelup"] - 0.1, A["levelup"] + 4.1, None),
    ("commit", A["levelup"] + 4.1, A["done"] + 0.5, 2.4),
    ("pets", A["pet"] - 0.3, A["pet"] + 5.1, None),
    ("trick", A["trick"] - 0.2, A["trick"] + 3.6, None),
    ("treat", A["treat"] - 0.2, A["treat"] + 3.8, None),
    ("shop", A["shop"] - 0.2, A["shop"] + 2.6, None),
    ("switch", A["switch"] - 0.2, A["locki"] + 2.0, 3.0),
    ("petlocki", A["petlocki"] - 0.2, A["petlocki"] + 2.4, None),
    ("hold", A["petlocki"] + 2.4, A["petlocki"] + 2.4, 1.0),
]
SEGMENTS = []
STARTS = {}
_v = D0
for name, s0, s1, dur in PLAN:
    if s1 < s0 or (s1 == s0 and dur is None):
        continue
    # A fixed length only ever speeds a span up; shorter spans play in real time.
    length = s1 - s0 if dur is None or (s1 > s0 and s1 - s0 < dur) else dur
    STARTS[name] = _v
    SEGMENTS.append((_v, _v + length, s0, s1))
    _v += length
D1 = _v
B0 = D1
J0 = B0 + 6.0
J_HEAD = 1.5
J_STEP = 1.15
O0 = J0 + J_HEAD + 11 * J_STEP + 0.6
TOTAL = O0 + 7.0


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
    "picker": (PANE_X + 350, 420, 2.2),
    "pal": (PANE_X + 350, 500, 1.75),
    "prompt": (1150, 1460, 1.35),
    "left": (1000, 640, 1.35),
}
CAMERA = [
    ("intro", "full"), ("picker", "picker"), ("hello", "pal"), ("typing", "prompt"), ("submit", "pal"),
    ("fixing", "left"), ("levelup", "pal"), ("switch", "picker"), ("petlocki", "pal"), ("hold", "full"),
]
CAMERA = [(STARTS[name] - (0.0 if name == "levelup" else 0.2), view_name) for name, view_name in CAMERA if name in STARTS]
MOVE = 0.6
LEVEL_UP = video_time(A["levelup"])


def camera(t):
    prev = VIEWS[CAMERA[0][1]]
    current = prev
    for start, name in CAMERA:
        if t < start:
            break
        # Cuts into the moments the pal reacts; eases everywhere else.
        dur = 0.25 if start == STARTS.get("levelup") else MOVE
        p = ease_in_out_cubic(prog(t, start, dur))
        target = VIEWS[name]
        current = tuple(lerp(a, b, p) for a, b in zip(prev, target))
        prev = current if p < 1 else target
    box = view(*current)
    zoom = current[2]
    if LEVEL_UP <= t < LEVEL_UP + 0.6:
        k = (1 - prog(t, LEVEL_UP, 0.6)) * 18
        dx, dy = math.sin(t * 90) * k, math.cos(t * 77) * k
        dx = clamp(dx, -box[0], SW - box[2])
        dy = clamp(dy, -box[1], SH - box[3])
        box = (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)
    return box, zoom


def to_screen(sx, sy, box):
    x0, y0, x1, y1 = box
    return WIN_X + (sx - x0) / (x1 - x0) * WIN_W, WIN_Y + BAR + (sy - y0) / (y1 - y0) * WIN_H


@lru_cache(maxsize=1)
def window_shadow():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([WIN_X + 10, WIN_Y + 24, WIN_X + WIN_W - 10, WIN_Y + BAR + WIN_H + 30], 24, fill=(0, 0, 0, 170))
    return img.filter(ImageFilter.GaussianBlur(28))


CAPTION_TEXT = {
    "en": [
        ("picker", "hello", "Pick your pal: LOCKI or CAPPL", "Each has their own wardrobe, sounds and tricks"),
        ("hello", "typing", "CAPPL rides in: Lv34 Ranger, $1,872", "Just $28 short of the black hat ($1,900)"),
        ("typing", "submit", "Ask Claude as usual", "Test → fix → commit"),
        ("submit", "levelup", "The pal follows the session", "Listening… thinking… a failing test makes it flinch… a fix"),
        ("levelup", "pets", "Lv35 Sheriff: a chest of gold and a new trick", "Bullseye +5 · Showdown won +8 · Claim staked +10"),
        ("pets", "trick", "Pet your pal", "Three pets finish today's bounty: +$5"),
        ("trick", "treat", "Ask for a trick", "The newest first · ten to learn by Lv50"),
        ("treat", "shop", "Buy a treat for $6", "A blush and extra tricks for ten minutes"),
        ("shop", "switch", "Gold buys gear, worn right away", "Cosmetics only · no loot boxes, no trading"),
        ("switch", "hold", "Switch pals any time", "Each keeps their own wardrobe · gold is shared"),
    ],
    "ko": [
        ("picker", "hello", "함께할 친구 고르기: LOCKI 또는 CAPPL", "캐릭터마다 옷장·효과음·재주가 따로 있어요"),
        ("hello", "typing", "CAPPL 등장: Lv34 레인저 · 골드 $1,872", "검은 카우보이모자($1,900)까지 딱 $28 모자람"),
        ("typing", "submit", "평소처럼 Claude에게 일을 시킵니다", "테스트 돌리고 → 고치고 → 커밋"),
        ("submit", "levelup", "세션 따라 표정이 바뀝니다", "듣고… 생각하고… 테스트가 실패하면 움찔… 그리고 수정"),
        ("levelup", "pets", "Lv35 보안관: 골드 상자와 새 재주", "과녁 명중 +5 · 결투 승리 +8 · 말뚝 박기 +10"),
        ("pets", "trick", "쓰다듬어 주세요", "세 번 쓰다듬으면 오늘의 현상금 완료: +$5"),
        ("trick", "treat", "재주 부탁하기", "가장 최근에 배운 재주부터 · Lv50까지 열 가지"),
        ("treat", "shop", "간식 사 주기 $6", "10분 동안 볼이 발그레하고 재주를 더 자주 부려요"),
        ("shop", "switch", "모은 골드로 소품을 사서 바로 착용", "꾸밈 전용 · 뽑기와 거래는 없습니다"),
        ("switch", "hold", "언제든 친구 바꾸기", "옷장은 캐릭터마다 따로, 골드는 함께"),
    ],
}[LANG]
CAPTIONS = [(STARTS[a] + 0.15, STARTS.get(b, D1) - 0.1, title, sub) for a, b, title, sub in CAPTION_TEXT if a in STARTS]

# Reward text pops just left of the pane (source pixels): beside the face, or lower down
# beside the gold line, so it never covers the pal.
SPRITE_SPOT = (PANE_X - 360, 300)
GOLD_SPOT = (PANE_X - 360, 18.5 * CH)
LOW_SPOT = (PANE_X - 360, 21.5 * CH)
LOWER_SPOT = (PANE_X - 360, 23.5 * CH)
POPUP_TEXT = {
    "en": [("pick", 0.1, "Howdy, partner!", SPRITE_SPOT, TEAL, "hello_cappl"),
           ("saddled", 0.0, "+$10 Saddled up", GOLD_SPOT, GOLD, "coin_cappl"),
           ("fail", 0.0, "1 failing!", SPRITE_SPOT, (252, 165, 165), "fail_cappl"),
           ("levelup", 0.0, "+5 Bullseye", LOW_SPOT, GOLD, None),
           ("levelup", 0.35, "+8 Showdown won", LOWER_SPOT, GOLD, None),
           ("levelup", 1.8, "+$40 Level chest", GOLD_SPOT, GOLD, "chest_cappl"),
           ("levelup", 2.9, "New trick: Two-step!", SPRITE_SPOT, (134, 239, 172), "trick_cappl"),
           ("claim", 0.0, "+10 Claim staked", GOLD_SPOT, GOLD, "coin_cappl"),
           ("bounty", 0.0, "+$5 Bounty done", GOLD_SPOT, GOLD, "quest_cappl"),
           ("treat", 0.1, "−$6 Maple biscuit", GOLD_SPOT, (252, 165, 165), "treat_cappl"),
           ("shop", 0.1, "−$1,900 Black hat!", GOLD_SPOT, (252, 165, 165), "buy_cappl"),
           ("locki", 0.0, "Howdy! LOCKI's on duty", SPRITE_SPOT, PINK, "hello_locki")],
    "ko": [("pick", 0.1, "반가워, 파트너!", SPRITE_SPOT, TEAL, "hello_cappl"),
           ("saddled", 0.0, "+$10 안장 얹기", GOLD_SPOT, GOLD, "coin_cappl"),
           ("fail", 0.0, "1건 실패!", SPRITE_SPOT, (252, 165, 165), "fail_cappl"),
           ("levelup", 0.0, "+5 과녁 명중", LOW_SPOT, GOLD, None),
           ("levelup", 0.35, "+8 결투 승리", LOWER_SPOT, GOLD, None),
           ("levelup", 1.8, "+$40 레벨 상자", GOLD_SPOT, GOLD, "chest_cappl"),
           ("levelup", 2.9, "새 재주: 투스텝!", SPRITE_SPOT, (134, 239, 172), "trick_cappl"),
           ("claim", 0.0, "+10 말뚝 박기", GOLD_SPOT, GOLD, "coin_cappl"),
           ("bounty", 0.0, "+$5 현상금 완료", GOLD_SPOT, GOLD, "quest_cappl"),
           ("treat", 0.1, "−$6 메이플 비스킷", GOLD_SPOT, (252, 165, 165), "treat_cappl"),
           ("shop", 0.1, "−$1,900 검은 모자!", GOLD_SPOT, (252, 165, 165), "buy_cappl"),
           ("locki", 0.0, "하우디! LOCKI 근무 시작", SPRITE_SPOT, PINK, "hello_locki")],
}[LANG]
POPUPS = []
for anchor, delay, label, (sx, sy), color, sound in POPUP_TEXT:
    vt = video_time(A[anchor] + delay)
    if vt is not None:
        POPUPS.append((vt, label, sx, sy, color, sound))


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
    x = clamp(x, 300, W - 300)
    # A spot outside the current camera view pops at the window's edge instead.
    y = clamp(y, WIN_Y + BAR + 150, WIN_Y + BAR + WIN_H - 60)
    scale = ease_out_back(clamp(p * 4))
    alpha = 1 - clamp((p - 0.7) / 0.3)
    place(canvas, text_layer(label, font("pixel", 50), color, stroke=7), x, y - 90 * ease_out_cubic(p), scale, alpha)


def level_up(canvas, t):
    """A banner over the session's side of the window; the pal on the right stays in view."""
    p = prog(t, LEVEL_UP, 2.0)
    if p <= 0 or p >= 1:
        return
    a = clamp(p * 8) * (1 - clamp((p - 0.82) / 0.18))
    cx, cy = WIN_X + WIN_W * 0.3, WIN_Y + BAR + WIN_H * 0.52
    canvas.alpha_composite(Image.new("RGBA", (W, H), (255, 244, 220, int(150 * (1 - clamp(p * 5))))))
    panel = Image.new("RGBA", (860, 280), (0, 0, 0, 0))
    rounded(ImageDraw.Draw(panel), [0, 0, 859, 279], 34, (16, 14, 36, 236), outline=GOLD + (230,), width=4)
    place(canvas, panel, cx, cy, lerp(0.8, 1.0, ease_out_back(clamp(p * 4))), a)
    burst(canvas, cx, cy - 20, clamp(p * 1.6), n=22, radius=640, color=TEAL)
    burst(canvas, cx, cy - 20, clamp(p * 1.4), n=16, radius=540, color=GOLD, seed=8)
    place(canvas, text_layer("LEVEL UP!", font("pixel", 112), GOLD, stroke=10), cx, cy - 44, ease_out_back(clamp(p * 3.5)), a)
    place(canvas, text_layer(TEXT["level_sub"], font("bold", 46), WHITE, stroke=4), cx, cy + 74,
          ease_out_back(clamp(p * 6 - 0.4)), a)


def keycaps(canvas, t, start, keys, x, y, step=0.3):
    p = prog(t, start, 0.9 + step * len(keys))
    if p <= 0 or p >= 1:
        return
    a = clamp(p * 5) * (1 - clamp((p - 0.85) / 0.15))
    f = font("monob", 40)
    cx = x
    for i, k in enumerate(keys):
        press = prog(t, start + 0.25 + i * step, 0.18)
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


def keys_at(anchor, keys, step=0.3, delay=0.0):
    """Keycaps timed so the last key lands on the anchor's moment."""
    vt = video_time(A[anchor] + delay)
    if vt is None:
        return None
    return (vt - 0.25 - step * (len(keys) - 1), keys, step)


KEYS = [k for k in (
    keys_at("pick", ["ctrl+x", "Tab", "2"]),
    keys_at("pet", ["p", "p", "p"], step=0.35, delay=1.4),
    keys_at("trick", ["t"]),
    keys_at("treat", ["f"]),
    keys_at("shop", ["8"]),
    (STARTS["switch"] + 0.05, ["c", "1"], 0.9) if "switch" in STARTS else None,
    keys_at("petlocki", ["p"]),
) if k is not None]

PROMPT = {
    "en": "Run npm test. If it fails, fix src/trail.js and run the tests again. "
          "When they pass, commit with git commit -qam 'Pad minutes in ride time' and answer in one line.",
    "ko": "npm test 돌려 보고 실패하면 src/trail.js 고친 다음 다시 테스트해 줘. "
          "통과하면 git commit -qam '이동 시간의 분을 두 자리로' 로 커밋하고 한 줄로만 답해.",
}[LANG]
TYPE_START, TYPE_END, SUBMIT = A["type"], A["submit"] - 0.6, A["submit"]


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
    t0, t1 = STARTS["typing"], STARTS["thinking"]
    if not (t0 <= t < t1):
        return
    st = src_time(t)
    count = int(clamp((st - TYPE_START) / (TYPE_END - TYPE_START)) * len(PROMPT))
    typed = PROMPT[:count]
    a = ease_out_cubic(prog(t, t0, 0.35)) * (1 - prog(t, t1 - 0.45, 0.45))
    f = font("semi", 38)
    lines = wrap(typed, f, 1140) if typed else [""]
    h = 120 + 56 * len(lines)
    layer = Image.new("RGBA", (1280, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rounded(d, [0, 0, 1279, h - 1], 26, (16, 14, 36, 242), outline=PINK + (220,), width=3)
    rtext(layer, (44, 30), TEXT["prompt"], font("bold", 26), PINK, pad=4)
    sent = st >= SUBMIT
    if sent:
        rtext(layer, (1236, 30), TEXT["sent"], font("bold", 26), (134, 239, 172), anchor="ra", pad=4)
    y = 78
    for i, line in enumerate(lines):
        rtext(layer, (44, y), ("❯ " if i == 0 else "   ") + line, f, WHITE, pad=4)
        if i == len(lines) - 1 and not sent and int(t * 2.5) % 2 == 0:
            x = 44 + f.getlength(("❯ " if i == 0 else "   ") + line) + 6
            d.rectangle([x, y + 6, x + 4, y + 46], fill=PINK)
        y += 56
    place(canvas, layer, W / 2, WIN_Y + BAR + 420, lerp(0.96, 1.0, ease_out_cubic(prog(t, t0, 0.35))), a)


def live_badge(chrome, t):
    d = ImageDraw.Draw(chrome)
    x = 120
    rounded(d, [x, 9, x + 470, 35], 13, (16, 14, 36, 255), outline=RED + (255,), width=2)
    if int(t * 2) % 2 == 0:
        d.ellipse([x + 12, 16, x + 24, 28], fill=RED)
    rtext(chrome, (x + 34, 22), TEXT["live"], font("semi", 21), WHITE, anchor="lm", pad=4)


def scene_demo(t):
    c = gradient((18, 16, 40), (44, 30, 66)).copy()
    starfield(c, t, density=0.35)
    intro = ease_out_cubic(prog(t, D0, 0.7))
    c.alpha_composite(window_shadow())
    box, zoom = camera(t)
    frame = term_frame(frame_index(src_time(t)))
    shot = frame.resize((WIN_W, WIN_H), Image.LANCZOS, box=box).convert("RGBA")
    # Close on the pane, the session's cut-off lines step back so the pal stands out.
    dim = clamp((zoom - 1.4) / 0.3) * 0.62
    if dim > 0:
        edge = int(to_screen(PANE_X - CW, 0, box)[0] - WIN_X)
        if edge > 0:
            shade = Image.new("RGBA", (min(edge, WIN_W), WIN_H), (18, 16, 40, int(255 * dim)))
            shot.alpha_composite(shade)
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
    for start, keys, step in KEYS:
        keycaps(c, t, start, keys, WIN_X + 40, WIN_Y + BAR + 80, step)
    level_up(c, t)
    return c


# ── Scene 5: bonus gold ────────────────────────────────────────────────────

def scene_bonus(t):
    lt = t - B0
    c = gradient((40, 24, 30), (120, 70, 40)).copy()
    starfield(c, t, density=0.4, color=GOLD)
    p = prog(lt, 0.1, 0.5)
    place(c, text_layer(TEXT["bonus"], font("xbold", 74), WHITE), W / 2, 130 - 30 * (1 - ease_out_cubic(p)), 1, p)
    place(c, text_layer(TEXT["bonus_sub"], font("semi", 34), SAND), W / 2, 208, 1, p)
    for i, (moment, title, amount, sub) in enumerate(TEXT["bonus_cards"]):
        start = 0.5 + i * 0.3
        pi = prog(lt, start, 0.45)
        if pi <= 0:
            continue
        who = "cappl" if i % 2 == 0 else "locki"
        card = Image.new("RGBA", (420, 620), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, [0, 0, 419, 619], 32, (30, 18, 24, 236), outline=GOLD + (210,), width=4)
        paste_sprite(card, pose(who, "demo", moment, t, start=B0 + start), 9, 210, 170)
        rtext(card, (210, 360), title, font("bold", 42), WHITE, anchor="mm", pad=6)
        rtext(card, (210, 450), amount, font("pixel", 60), GOLD, anchor="mm", stroke=4, pad=8)
        rtext(card, (210, 545), sub, font("medium", 28), MUTED, anchor="mm", pad=6)
        place(c, card, 270 + i * 460, 640 + 50 * (1 - ease_out_back(pi)), lerp(0.85, 1.0, ease_out_back(pi)), clamp(pi * 2))
    return c


# ── Scene 6: the trail to Lv50 ─────────────────────────────────────────────

# (level, rank, rank in Korean, hours at the median day, look, trick shown, sky)
RANKS = [
    (1, "Greenhorn", "새내기", 0, "lv1", ("hello", "hello"), ((40, 30, 62), (226, 150, 120))),
    (5, "Stable Hand", "마구간지기", 9, "lv5", ("hop", "nod"), ((54, 28, 30), (170, 84, 62))),
    (10, "Trail Rider", "길잡이 기수", 36, "lv10", ("spin", "hatTip"), ((70, 36, 22), (214, 132, 60))),
    (15, "Wrangler", "카우보이", 81, "lv15", ("hatToss", "strum"), ((26, 48, 40), (96, 150, 92))),
    (20, "Rodeo Rookie", "로데오 신인", 142, "lv20", ("salute", "sip"), ((44, 20, 58), (150, 70, 130))),
    (25, "Deputy", "보안관 보좌관", 219, "lv20", ("peekaboo", "hatPeekaboo"), ((16, 24, 64), (60, 90, 170))),
    (30, "Ranger", "레인저", 312, "lv30", ("heartBurst", "hum"), ((14, 40, 44), (40, 120, 120))),
    (35, "Sheriff", "보안관", 420, "lv30", ("starDance", "twoStep"), ((60, 30, 10), (200, 130, 40))),
    (40, "Marshal", "연방 보안관", 543, "lv40", ("starDance", "twoStep"), ((14, 18, 54), (60, 70, 160))),
    (45, "Frontier Hero", "개척지 영웅", 681, "lv40", ("cartwheel", "tumble"), ((60, 18, 40), (230, 110, 80))),
    (50, "Legend of the West", "서부의 전설", 834, "lv50", ("fireworks", "campfireSong"), ((20, 14, 50), (120, 60, 130))),
]
MAX_HOURS = RANKS[-1][3]
TRICK_LEVELS = [2, 4, 7, 12, 17, 23, 29, 35, 42, 50]


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
    level, name, name_ko, hours, look, tricks, (top, bottom) = RANKS[idx]
    since = lt - J_HEAD - idx * J_STEP if lt >= J_HEAD else 0
    if idx > 0 and since < 0.35:
        prev = RANKS[idx - 1][6]
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
        place(c, text_layer(TEXT["journey"], font("xbold", 86), WHITE), W / 2, 450 - 30 * (1 - ease_out_cubic(p)), 1, p * a)
        place(c, text_layer(TEXT["journey_sub"], font("medium", 36), SAND), W / 2, 560, 1, p * a)
        return c
    pop = ease_out_back(clamp(since / 0.4)) if since < 0.4 else 1.0
    step_start = J0 + J_HEAD + idx * J_STEP
    for (who, x), trick in zip((("locki", 380), ("cappl", 760)), tricks):
        paste_sprite(c, pose(who, look, trick, t, start=step_start), 10, x, 470, pop, pop)
    tx = 1060
    p = ease_out_cubic(clamp(since / 0.35))
    place_left(c, text_layer(f"Lv{level}", font("pixel", 74), GOLD, stroke=6), tx - 40 * (1 - p), 300, p)
    place_left(c, text_layer(name if LANG == "en" else name_ko, font("xbold", 84), WHITE, stroke=3), tx - 60 * (1 - p), 430, p)
    learned = sum(1 for lv in TRICK_LEVELS if lv <= level)
    place_left(c, text_layer(TEXT["journey_stats"](hours, learned), font("semi", 40), (226, 232, 240)), tx, 550, p)
    bar_x0, bar_x1, bar_y = 160, 1760, 860 if level < 35 else 820
    d = ImageDraw.Draw(c)
    rounded(d, [bar_x0, bar_y - 8, bar_x1, bar_y + 8], 8, (255, 255, 255, 60))
    target = hours / MAX_HOURS
    prev_h = RANKS[idx - 1][3] / MAX_HOURS if idx else 0
    cur = lerp(prev_h, target, ease_in_out_cubic(clamp(since / 0.6)))
    rounded(d, [bar_x0, bar_y - 8, bar_x0 + (bar_x1 - bar_x0) * cur, bar_y + 8], 8, PINK)
    for rank in RANKS:
        x = bar_x0 + (bar_x1 - bar_x0) * rank[3] / MAX_HOURS
        d.rectangle([x - 2, bar_y + 14, x + 2, bar_y + 26], fill=(255, 255, 255, 150))
    d.text((bar_x0, bar_y + 46), "0h", font=font("semi", 28), fill=(226, 232, 240), anchor="lm")
    d.text((bar_x1, bar_y + 46), f"{MAX_HOURS:,}h", font=font("semi", 28), fill=(226, 232, 240), anchor="rm")
    mx = bar_x0 + (bar_x1 - bar_x0) * cur
    paste_sprite(c, pose("cappl", look, "still", 0), 2, mx + 20, bar_y - 40)
    paste_sprite(c, pose("locki", look, "still", 0), 2, mx - 20, bar_y - 40)
    return c


# ── Scene 7: the end ───────────────────────────────────────────────────────

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
    for who, x, moment in (("locki", W / 2 - 210, "fireworks"), ("cappl", W / 2 + 210, "campfireSong")):
        key = pose(who, "lv50", moment if lt < 4.0 else "hello", t, start=O0 if lt < 4.0 else O0 + 4.0)
        paste_sprite(c, key, 10, x, 380 + rise)
    p = prog(lt, 0.6, 0.5)
    place(c, text_layer("cappl-pals", font("pixel", 104), CREAM, stroke=8), W / 2, 640, ease_out_back(p), clamp(p * 2))
    p = prog(lt, 1.0, 0.5)
    place(c, text_layer(TEXT["outro_line"], font("bold", 44), WHITE), W / 2, 735, 1, p)
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
    place(c, text_layer(TEXT["outro_repo"], font("semi", 32), SAND), W / 2, 950, 1, p * 0.95)
    p = prog(lt, 2.4, 0.5)
    place(c, text_layer(TEXT["outro_credit"], font("medium", 24), (226, 214, 200)),
          W / 2, 1010, 1, p * 0.75)
    fade = prog(lt, 6.4, 0.6)
    if fade > 0:
        c.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(255 * fade))))
    return c


# ── Transitions: a star opens the next scene ───────────────────────────────

SCENES = [(0.0, M0, scene_intro), (M0, P0, scene_moods), (P0, D0, scene_premise), (D0, D1, scene_demo),
          (B0, J0, scene_bonus), (J0, O0, scene_journey), (O0, TOTAL, scene_outro)]
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
    ev = [(0.3, "pop"), (0.65, "pop"), (M0 - 0.3, "wipe"), (P0 - 0.3, "wipe"), (D0 - 0.3, "wipe"), (B0 - 0.3, "wipe"),
          (J0 - 0.3, "wipe"), (O0 - 0.3, "wipe")]
    for i in range(10):
        ev.append((1.4 + i * 0.06, "blip"))
    for i, (moment, _) in enumerate(TEXT["mood_cards"]):
        ev.append((M0 + 0.45 + i * 0.22, "tick"))
    for col in range(2):
        for i in range(4):
            ev.append((P0 + 0.8 + col * 0.9 + i * 0.25, "tick" if col == 0 else "coin_small"))
    # Typing: the keystrokes moved to video time.
    for k in range(len(PROMPT)):
        st = TYPE_START + k * (TYPE_END - TYPE_START) / len(PROMPT)
        vt = video_time(st)
        if vt is not None and k % 2 == 0:
            ev.append((vt, "key"))
    for start, label, *_rest, sound in POPUPS:
        if sound:
            ev.append((start, sound))
    ev.append((LEVEL_UP, "stage_cappl"))
    for start, keys, step in KEYS:
        for k in range(len(keys)):
            ev.append((start + 0.25 + k * step, "key_big"))
    # The pal's own sounds for petting, the trick and petting LOCKI.
    for k in range(3):
        vt = video_time(A["pet"] + k * 0.7)
        if vt is not None:
            ev.append((vt, "pet_cappl"))
    for anchor, sound in (("trick", "trick_cappl"), ("petlocki", "pet_locki")):
        vt = video_time(A[anchor])
        if vt is not None:
            ev.append((vt, sound))
    for i, sound in enumerate(("chest_cappl", "quest_locki", "lucky_cappl", "treat_locki")):
        ev.append((B0 + 0.5 + i * 0.3, sound))
    for i in range(len(RANKS)):
        ev.append((J0 + J_HEAD + i * J_STEP, "rank" if i < len(RANKS) - 1 else "fanfare_locki"))
    ev.append((O0 + 0.6, "fanfare_end"))
    return sorted(ev)


SECTIONS = [(0.0, "intro"), (M0, "moods"), (P0, "premise"), (D0, "demo"), (B0, "bonus"), (J0, "journey"), (O0, "outro")]


def main():
    os.makedirs(OUT, exist_ok=True)
    mode = sys.argv[1]
    if mode == "stills":
        for s in sys.argv[3:]:
            t = float(s)
            render_frame(t).convert("RGB").save(os.path.join(OUT, f"still-{LANG}-{t:05.1f}.png"))
        return
    if mode == "plan":
        print(f"total {TOTAL:.2f}  demo {D0:.1f}–{D1:.2f}  bonus {B0:.2f}  journey {J0:.2f}  outro {O0:.2f}")
        for name, start in STARTS.items():
            print(f"  {start:6.2f} {name}")
        return
    json.dump({"events": events(), "sections": SECTIONS, "total": TOTAL}, open(os.path.join(OUT, f"events-{LANG}.json"), "w"), indent=1)
    ff = subprocess.run([os.path.join(HERE, ".venv/bin/python"), "-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"],
                        capture_output=True, text=True).stdout.strip()
    proc = subprocess.Popen([ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                             "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                             os.path.join(OUT, f"video-{LANG}.mp4")], stdin=subprocess.PIPE)
    n = int(TOTAL * FPS)
    for k in range(n):
        proc.stdin.write(render_frame(k / FPS).convert("RGB").tobytes())
        if k % 150 == 0:
            print(f"{k}/{n}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("done", os.path.join(OUT, f"video-{LANG}.mp4"))


if __name__ == "__main__":
    main()
