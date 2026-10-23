"""Draw `tmux capture-pane -e` output (ANSI) like a terminal, as a PIL image.

Half and quadrant blocks and box lines are painted directly instead of with a font,
so the pixels meet exactly.
"""

import os
import re
import unicodedata
from functools import lru_cache

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "assets", "fonts")

CW, CH = 20, 40  # cell size (px)
GLYPH = 38  # D2Coding size (px)
DEFAULT_FG = (222, 222, 222)
DEFAULT_BG = (21, 22, 30)

# The sprite palette. The engine rounds colours to 4 bits a channel under tmux, so sprite
# cells snap back to the nearest palette colour; render_frames.py fills this from poses.json.
BRAND: list[tuple[int, int, int]] = []

FONT_FILES = [
    os.path.join(FONTS, "D2Coding.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/mnt/c/Windows/Fonts/CascadiaMono.ttf",
    "/mnt/c/Windows/Fonts/seguisym.ttf",
    "/mnt/c/Windows/Fonts/segoeui.ttf",
]
BOLD_FILES = {FONT_FILES[0]: os.path.join(FONTS, "D2CodingBold.ttf"),
              FONT_FILES[1]: "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"}


def _cmap(path: str) -> set[int]:
    try:
        return set(TTFont(path, lazy=True).getBestCmap().keys())
    except Exception:
        return set()


CMAPS = [(path, _cmap(path)) for path in FONT_FILES if os.path.exists(path)]


@lru_cache(maxsize=None)
def font_for(char: str, bold: bool) -> ImageFont.FreeTypeFont:
    code = ord(char)
    path = next((p for p, cmap in CMAPS if code in cmap), CMAPS[0][0])
    if bold and path in BOLD_FILES and os.path.exists(BOLD_FILES[path]):
        path = BOLD_FILES[path]
    size = GLYPH if "D2Coding" in path else GLYPH - 6
    return ImageFont.truetype(path, size)


XTERM16 = [
    (0, 0, 0), (205, 49, 49), (13, 188, 121), (229, 229, 16), (36, 114, 200), (188, 63, 188), (17, 168, 205), (229, 229, 229),
    (102, 102, 102), (241, 76, 76), (35, 209, 139), (245, 245, 67), (59, 142, 234), (214, 112, 214), (41, 184, 219), (255, 255, 255),
]


def xterm256(n: int) -> tuple[int, int, int]:
    if n < 16:
        return XTERM16[n]
    if n < 232:
        n -= 16
        steps = [0, 95, 135, 175, 215, 255]
        return steps[n // 36], steps[(n // 6) % 6], steps[n % 6]
    v = 8 + (n - 232) * 10
    return v, v, v


def width_of(char: str) -> int:
    if unicodedata.combining(char):
        return 0
    return 2 if unicodedata.east_asian_width(char) in ("W", "F") else 1


SGR = re.compile(r"\x1b\[([0-9;]*)m")


def parse(text: str, cols: int, rows: int):
    """A grid of cells: (char, fg, bg, bold, dim)."""
    grid = [[(" ", None, None, False, False) for _ in range(cols)] for _ in range(rows)]
    # tmux sends Hangul as separate jamo; recompose syllables so each takes two cells.
    for y, line in enumerate(unicodedata.normalize("NFC", text).split("\n")[:rows]):
        fg = bg = None
        bold = dim = inverse = False
        x = 0
        pos = 0
        for match in list(SGR.finditer(line)) + [None]:
            end = match.start() if match else len(line)
            for char in line[pos:end]:
                w = width_of(char)
                if w == 0 or x >= cols:
                    continue
                f, b = (bg, fg) if inverse else (fg, bg)
                grid[y][x] = (char, f, b, bold, dim)
                if w == 2 and x + 1 < cols:
                    grid[y][x + 1] = ("", f, b, bold, dim)
                x += w
            if match is None:
                break
            pos = match.end()
            params = [int(p) if p else 0 for p in match.group(1).split(";")] if match.group(1) else [0]
            i = 0
            while i < len(params):
                p = params[i]
                if p == 0:
                    fg = bg = None
                    bold = dim = inverse = False
                elif p == 1:
                    bold = True
                elif p == 2:
                    dim = True
                elif p == 22:
                    bold = dim = False
                elif p == 7:
                    inverse = True
                elif p == 27:
                    inverse = False
                elif p in (38, 48) and i + 1 < len(params):
                    if params[i + 1] == 2 and i + 4 < len(params):
                        color = tuple(params[i + 2:i + 5])
                        i += 4
                    elif params[i + 1] == 5 and i + 2 < len(params):
                        color = xterm256(params[i + 2])
                        i += 2
                    else:
                        color = None
                    if p == 38:
                        fg = color
                    else:
                        bg = color
                elif p == 39:
                    fg = None
                elif p == 49:
                    bg = None
                elif 30 <= p <= 37:
                    fg = XTERM16[p - 30]
                elif 90 <= p <= 97:
                    fg = XTERM16[p - 90 + 8]
                elif 40 <= p <= 47:
                    bg = XTERM16[p - 40]
                elif 100 <= p <= 107:
                    bg = XTERM16[p - 100 + 8]
                i += 1
    return grid


def snap(color):
    if color is None:
        return None
    best = min(BRAND, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, color)))
    # The engine rounds each channel to steps of 17 (off by at most 8.5); farther colours (the pane background) stay.
    return best if sum((a - b) ** 2 for a, b in zip(best, color)) < 16 ** 2 else color


# Quadrant blocks: char → (top left, top right, bottom left, bottom right)
QUADS = {
    "▘": (1, 0, 0, 0), "▝": (0, 1, 0, 0), "▖": (0, 0, 1, 0), "▗": (0, 0, 0, 1),
    "▀": (1, 1, 0, 0), "▄": (0, 0, 1, 1), "▌": (1, 0, 1, 0), "▐": (0, 1, 0, 1),
    "█": (1, 1, 1, 1), "▚": (1, 0, 0, 1), "▞": (0, 1, 1, 0), "▙": (1, 0, 1, 1),
    "▛": (1, 1, 1, 0), "▜": (1, 1, 0, 1), "▟": (0, 1, 1, 1),
}
LINES = {"─": "h", "━": "h", "│": "v", "┃": "v", "╭": "tl", "╮": "tr", "╰": "bl", "╯": "br", "├": "vr", "┤": "vl", "┼": "x"}


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


PANE_BG = (38, 38, 38)


def render(text: str, cols: int, rows: int, mask=None, divider: int | None = None, pane_rows: int = 0) -> Image.Image:
    grid = parse(text, cols, rows)
    if mask is not None:
        mask(grid)
    # Cells in the pane left at the default background (transparent sprite pixels) take the pane background.
    if divider is not None:
        for y in range(min(pane_rows, rows)):
            for x in range(divider + 1, cols):
                char, fg, bg, bold, dim = grid[y][x]
                if bg is None:
                    grid[y][x] = (char, fg, PANE_BG, bold, dim)
    image = Image.new("RGB", (cols * CW, rows * CH), DEFAULT_BG)
    draw = ImageDraw.Draw(image)
    # Paint every background first, so the next cell never covers the right half of a wide glyph.
    for y, row in enumerate(grid):
        for x, cell in enumerate(row):
            bg = cell[2]
            if divider is not None and x > divider and cell[0] in QUADS:
                bg = snap(bg)
            if bg is not None:
                draw.rectangle([x * CW, y * CH, x * CW + CW - 1, y * CH + CH - 1], fill=bg)
    for y, row in enumerate(grid):
        for x, (char, fg, bg, bold, dim) in enumerate(row):
            in_pane = divider is not None and x > divider
            if in_pane and char in QUADS:
                fg, bg = snap(fg), snap(bg)
            back = bg or DEFAULT_BG
            fore = fg or DEFAULT_FG
            if dim:
                fore = mix(fore, back, 0.45)
            x0, y0 = x * CW, y * CH
            if char in ("", " "):
                continue
            if char in QUADS:
                tl, tr, bl, br = QUADS[char]
                hw, hh = CW // 2, CH // 2
                for on, (dx, dy) in zip((tl, tr, bl, br), ((0, 0), (hw, 0), (0, hh), (hw, hh))):
                    if on:
                        draw.rectangle([x0 + dx, y0 + dy, x0 + dx + hw - 1, y0 + dy + hh - 1], fill=fore)
                continue
            if char in LINES:
                kind = LINES[char]
                cx, cy = x0 + CW // 2, y0 + CH // 2
                t = 2
                if kind in ("h", "x", "vr", "vl"):
                    left = x0 if kind != "vr" else cx
                    right = x0 + CW if kind != "vl" else cx
                    draw.rectangle([left, cy - 1, right - 1, cy - 1 + t - 1], fill=fore)
                if kind in ("v", "x", "vr", "vl"):
                    draw.rectangle([cx - 1, y0, cx - 1 + t - 1, y0 + CH - 1], fill=fore)
                if kind in ("tl", "tr", "bl", "br"):
                    r = CW // 2
                    box = {"tl": [cx, cy, cx + 2 * r, cy + 2 * r], "tr": [cx - 2 * r, cy, cx, cy + 2 * r],
                           "bl": [cx, cy - 2 * r, cx + 2 * r, cy], "br": [cx - 2 * r, cy - 2 * r, cx, cy]}[kind]
                    start = {"tl": 180, "tr": 270, "bl": 90, "br": 0}[kind]
                    draw.arc(box, start, start + 90, fill=fore, width=t)
                continue
            font = font_for(char, bold)
            w = width_of(char) * CW
            bbox = draw.textbbox((0, 0), char, font=font)
            gx = x0 + (w - (bbox[2] - bbox[0])) // 2 - bbox[0]
            gy = y0 + (CH - GLYPH) // 2 - 3
            draw.text((gx, gy), char, font=font, fill=fore)
    return image


def find_divider(text: str) -> int | None:
    """The column of the vertical line between the pane and the conversation."""
    plain = unicodedata.normalize("NFC", SGR.sub("", text)).split("\n")
    counts: dict[int, int] = {}
    for line in plain[1:20]:
        x = 0
        for char in line:
            if char == "│":
                counts[x] = counts.get(x, 0) + 1
            x += width_of(char)
    return max(counts, key=counts.get) if counts else None
