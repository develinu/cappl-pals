#!/usr/bin/env python3
"""Draw the character layers and write mod/hooks/characters/art.ts.

Every character is a stack of full-canvas layers (ears, head, hat, paws) plus eye
stamps; the mod composes them at run time so the hat can lift, the paws can tap and
the eyes can blink. Shapes are drawn here with a few primitives so the pixels stay
easy to change; the output file is generated, edit this script instead.

Usage: python3 tools/draw_art.py [--png preview.png]
"""

import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "mod", "hooks", "characters", "art.ts")


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [["."] * w for _ in range(h)]

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < self.w and 0 <= y < self.h else "."

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def span(self, y, x0, x1, c):
        for x in range(x0, x1 + 1):
            self.set(x, y, c)

    def spans(self, rows, c):
        for y, x0, x1 in rows:
            self.span(y, x0, x1, c)

    def ellipse(self, cx, cy, rx, ry, c, y_min=-99, y_max=99):
        for y in range(self.h):
            for x in range(self.w):
                if y_min <= y <= y_max and ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, c)

    def polygon(self, points, c):
        for y in range(self.h):
            for x in range(self.w):
                if inside(points, x + 0.5, y + 0.5):
                    self.set(x, y, c)

    def mirror(self):
        """Copy the left half onto the right half."""
        for y in range(self.h):
            for x in range(self.w // 2):
                self.p[y][self.w - 1 - x] = self.p[y][x]

    def outline(self, color, keep=()):
        """Paint every shape pixel that touches empty space (4-neighbours)."""
        edge = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] in (".",) or self.p[y][x] in keep:
                    continue
                if any(self.get(x + dx, y + dy) == "." for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    edge.append((x, y))
        for x, y in edge:
            self.p[y][x] = color

    def stamp(self, x0, y0, art):
        for dy, line in enumerate(art):
            for dx, c in enumerate(line):
                if c != ".":
                    self.set(x0 + dx, y0 + dy, c)

    def over(self, other):
        for y in range(self.h):
            for x in range(self.w):
                if other.p[y][x] != ".":
                    self.p[y][x] = other.p[y][x]

    def rows(self):
        return ["".join(r) for r in self.p]


def inside(points, x, y):
    hit = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def paw(c, x0, y0, w, h, toes, fill="C", outline="o"):
    """A rounded paw resting on the ledge, outlined, with toe creases."""
    shape = Canvas(c.w, c.h)
    shape.spans([(y0, x0 + 1, x0 + w - 2)] + [(y, x0, x0 + w - 1) for y in range(y0 + 1, y0 + h)], fill)
    shape.outline(outline)
    for x in toes:
        shape.span(y0 + h - 2, x, x, outline)
    return shape


def cowboy_hat(W, H, main, dark, light, band, top=1, wide=0):
    """A pinched crown, a band and a brim whose ends curl up. `wide` stretches the brim."""
    hat = Canvas(W, H)
    t = top
    hat.spans([(t, 11, 14), (t, 17, 20), (t + 1, 10, 21)] + [(y, 9, 22) for y in range(t + 2, t + 6)], main)
    hat.span(t + 1, 15, 16, dark)
    hat.spans([(t + 6, 9, 22), (t + 7, 9, 22)], band)
    l, r = 1 - wide, 30 + wide
    hat.spans([(t + 6, l, l + 1), (t + 6, r - 1, r), (t + 7, l, l + 3), (t + 7, r - 3, r),
               (t + 8, l, r), (t + 9, l + 1, r - 1)], main)
    hat.span(t + 10, 5, 26, dark)
    hat.spans([(t, 11, 12), (t + 1, 10, 11), (t + 2, 9, 9), (t + 3, 9, 9)], light)
    hat.spans([(t + 8, l + 1, l + 5)], light)
    return hat


# ── LOCKI: cream pup, big ears, navy hat with a pink band and a pink star ─────────


def locki32():
    W, H = 32, 28
    ears = Canvas(W, H)
    ears.polygon([(1.5, 0.5), (4.0, 11.0), (12.0, 6.0)], "C")
    ears.outline("o")
    ears.polygon([(3.2, 3.0), (5.2, 9.0), (9.5, 6.2)], "i")
    ears.mirror()

    head = Canvas(W, H)
    head.ellipse(16, 17.5, 12.6, 9.2, "C", y_max=25)
    head.ellipse(16, 10, 7.5, 6, "C")
    head.outline("o")

    hat = cowboy_hat(W, H, "N", "n", "H", "P")
    hat.spans([(2, 15, 16), (3, 13, 18), (4, 14, 17), (5, 14, 14), (5, 17, 17)], "P")

    paws = [paw(Canvas(W, H), 5, 23, 8, 5, [7, 10]), paw(Canvas(W, H), 19, 23, 8, 5, [21, 24])]

    return {
        "width": W,
        "height": H,
        "ears": ears.rows(),
        "head": head.rows(),
        "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[10, 15], [20, 15]], "open": ["wK", "KK", "KK"], "blink": ["..", "..", "KK"],
                 "happy": [".KK.", "K..K"], "happyAt": [[9, 16], [19, 16]]},
        "nose": {"at": [14, 19], "art": ["KKKK", ".KK."]},
    }


# ── CAPPL: teal head with a cream face, round ears over a wide brown hat ──────────


def cappl32():
    W, H = 32, 28
    ears = Canvas(W, H)
    ears.polygon([(8.5, 7), (11, 0.5), (13.5, 7)], "T")
    ears.outline("t")
    ears.polygon([(9.5, 6), (11, 2.5), (12.5, 6)], "Q")
    ears.mirror()

    head = Canvas(W, H)
    head.ellipse(16, 17.5, 12.6, 9.2, "T", y_max=25)
    head.ellipse(16, 10, 7.5, 6, "T")
    head.outline("t")
    face = Canvas(W, H)
    face.ellipse(11.5, 18.6, 5.0, 4.4, "C")
    face.ellipse(20.5, 18.6, 5.0, 4.4, "C")
    face.ellipse(16, 21.5, 9.6, 5, "C", y_max=24)
    head.over(face)

    hat = cowboy_hat(W, H, "B", "b", "R", "b", top=2, wide=1)

    paws = [paw(Canvas(W, H), 5, 23, 8, 5, [7, 10]), paw(Canvas(W, H), 19, 23, 8, 5, [21, 24])]

    return {
        "width": W,
        "height": H,
        "ears": ears.rows(),
        "head": head.rows(),
        "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[11, 17], [19, 17]], "open": ["wt", "tt", "tt"], "blink": ["..", "..", "tt"],
                 "happy": [".tt.", "t..t"], "happyAt": [[10, 18], [18, 18]]},
        "nose": {"at": [14, 21], "art": ["tttt", ".tt."]},
    }


def cowboy_hat16(W, H, main, dark, light, band, top=0):
    hat = Canvas(W, H)
    t = top
    hat.spans([(t, 5, 6), (t, 9, 10), (t + 1, 4, 11), (t + 2, 4, 11)], main)
    hat.span(t + 3, 4, 11, band)
    hat.spans([(t + 3, 0, 0), (t + 3, 15, 15), (t + 4, 0, 15)], main)
    hat.span(t + 5, 3, 12, dark)
    hat.spans([(t, 5, 5), (t + 1, 4, 4), (t + 4, 1, 3)], light)
    return hat


def locki16():
    W, H = 16, 14
    ears = Canvas(W, H)
    ears.stamp(0, 0, ["o.....", "oo....", "oio...", "oCio..", "ooCCo.", ".oCCCo"])
    ears.mirror()
    head = Canvas(W, H)
    head.ellipse(8, 8.8, 6.6, 4.8, "C", y_max=12)
    head.ellipse(8, 4.5, 4, 3.2, "C")
    head.outline("o")
    hat = cowboy_hat16(W, H, "N", "n", "H", "P")
    hat.spans([(1, 7, 8), (2, 6, 6), (2, 9, 9)], "P")
    paws = [paw(Canvas(W, H), 2, 11, 4, 3, [3]), paw(Canvas(W, H), 10, 11, 4, 3, [12])]
    return {
        "width": W, "height": H, "ears": ears.rows(), "head": head.rows(), "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[5, 7], [10, 7]], "open": ["K", "K"], "blink": [".", "K"],
                 "happy": [".K.", "K.K"], "happyAt": [[4, 7], [9, 7]]},
        "nose": {"at": [7, 9], "art": ["KK"]},
    }


def cappl16():
    W, H = 16, 14
    ears = Canvas(W, H)
    ears.polygon([(3.5, 5), (5.5, 0.5), (7.5, 5)], "T")
    ears.mirror()
    head = Canvas(W, H)
    head.ellipse(8, 8.8, 6.6, 4.8, "T", y_max=12)
    head.ellipse(8, 4.5, 4, 3.2, "T")
    head.outline("t")
    face = Canvas(W, H)
    face.ellipse(5.8, 9.2, 2.6, 2.4, "C")
    face.ellipse(10.2, 9.2, 2.6, 2.4, "C")
    face.ellipse(8, 11, 4.8, 2.6, "C", y_max=12)
    head.over(face)
    hat = cowboy_hat16(W, H, "B", "b", "R", "b", top=1)
    paws = [paw(Canvas(W, H), 2, 11, 4, 3, [3]), paw(Canvas(W, H), 10, 11, 4, 3, [12])]
    return {
        "width": W, "height": H, "ears": ears.rows(), "head": head.rows(), "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[5, 8], [10, 8]], "open": ["t", "t"], "blink": [".", "t"],
                 "happy": [".t.", "t.t"], "happyAt": [[4, 8], [9, 8]]},
        "nose": {"at": [7, 10], "art": ["tt"]},
    }


# ── Faces, bubbles and treats ────────────────────────────────────────────────
# Expressions are stamps placed relative to each eye (`dx`, `dy` from the eye's
# anchor), the mouth anchor under the nose, and fixed spots for blush, sweat, the
# speech bubble and a held treat. The mod picks them per tick (hooks/animations.ts).


def stamp(art, dx=0, dy=0):
    return {"art": art, "dx": dx, "dy": dy}


def face32(who):
    k = {"locki": "K", "cappl": "t", "numo": "X"}[who]
    eyes = {
        "open": stamp([f"w{k}", f"{k}{k}", f"{k}{k}"]),
        "blink": stamp(["..", "..", f"{k}{k}"]),
        "closed": stamp([f"{k}..{k}", f".{k}{k}."], -1, 1),
        "happy": stamp([f".{k}{k}.", f"{k}..{k}"], -1, 1),
        "shiny": stamp([f"w{k}", f"{k}{k}", f"{k}w"]),
        "heart": stamp(["P.P", "PPP", ".P."], -1, 0),
        "star": stamp([".y.", "yly", ".y."], -1, 0),
        "wide": stamp([f".{k}{k}.", f"{k}w{k}{k}", f"{k}{k}{k}{k}", f".{k}{k}."], -1, -1),
        "x": stamp([f"{k}.{k}", f".{k}.", f"{k}.{k}"], -1, 0),
        "sleepy": stamp(["..", f"{k}{k}", f"{k}{k}"]),
    }
    brows = {
        "worried": [stamp([f".{k}", f"{k}."], -1, -3), stamp([f"{k}.", f".{k}"], 1, -3)],
        "determined": [stamp([f"{k}.", f".{k}"], -1, -3), stamp([f".{k}", f"{k}."], 1, -3)],
    }
    mouths = {
        "open": stamp([f"{k}PP{k}", f".{k}{k}."]),
        "w": stamp([f"{k}.{k}{k}.{k}", f".{k}..{k}."], -1, 0),
        "o": stamp([f".{k}{k}.", f"{k}..{k}", f".{k}{k}."]),
        "tongue": stamp([f"{k}{k}{k}P", "...P"]),
        "chomp": stamp([f"{k}{k}{k}{k}"]),
        "yawn": stamp([f".{k}{k}.", f"{k}PP{k}", f"{k}PP{k}", f".{k}{k}."]),
        "smile": stamp([f"{k}..{k}", f".{k}{k}."]),
    }
    if who == "locki":
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[10, 15], [20, 15]], [14, 21], [[5, 19], [24, 19]], [27, 11], [14, 22]
    elif who == "cappl":
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[11, 17], [19, 17]], [14, 23], [[7, 21], [23, 21]], [27, 13], [14, 22]
    else:  # numo
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[11, 17], [19, 17]], [14, 23], [[7, 21], [23, 21]], [27, 13], [14, 22]
    return {
        "eyeAt": eye_at, "eyes": eyes, "brows": brows, "mouthAt": mouth_at, "mouths": mouths,
        "blush": {"at": blush_at, "art": ["hhh"]}, "sweat": {"at": sweat_at, "art": [".D", "DD", "DA"]},
        "bubbleAt": [25, 0], "treatAt": treat_at,
    }


def face16(who):
    k = {"locki": "K", "cappl": "t", "numo": "X"}[who]
    eyes = {
        "open": stamp([k, k]),
        "blink": stamp([".", k]),
        "closed": stamp([".", k]),
        "happy": stamp([f".{k}.", f"{k}.{k}"], -1, 0),
        "shiny": stamp(["w", k]),
        "heart": stamp(["P", "P"]),
        "star": stamp(["y", "l"]),
        "wide": stamp([f"{k}{k}", f"{k}{k}"]),
        "x": stamp([f"{k}.{k}", f".{k}."], -1, 0),
        "sleepy": stamp([".", k]),
    }
    brows = {"worried": [stamp([k], 0, -1), stamp([k], 0, -1)], "determined": [stamp([k], 0, -1), stamp([k], 0, -1)]}
    mouths = {
        "open": stamp(["PP"]), "w": stamp([f"{k}.{k}"], 0, 0), "o": stamp([k], 1, 0), "tongue": stamp([".P"]),
        "chomp": stamp([f"{k}{k}"]), "yawn": stamp(["PP", "PP"]), "smile": stamp([f"{k}{k}"]),
    }
    if who == "locki":
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[5, 7], [10, 7]], [7, 10], [[3, 9], [12, 9]], [13, 5], [6, 10]
    elif who == "cappl":
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[5, 8], [10, 8]], [7, 11], [[3, 10], [12, 10]], [13, 6], [6, 11]
    else:  # numo
        eye_at, mouth_at, blush_at, sweat_at, treat_at = [[5, 8], [10, 8]], [7, 11], [[3, 10], [12, 10]], [13, 6], [6, 11]
    return {
        "eyeAt": eye_at, "eyes": eyes, "brows": brows, "mouthAt": mouth_at, "mouths": mouths,
        "blush": {"at": blush_at, "art": ["h"]}, "sweat": {"at": sweat_at, "art": ["D", "D"]},
        "bubbleAt": [12, 0], "treatAt": treat_at,
    }


BUBBLE_SYMBOLS = {
    "!": (["..X..", "..X..", "..X..", ".....", "..X.."], "r"),
    "?": ([".XXX.", "...X.", "..X..", ".....", "..X.."], "k"),
    "heart": ([".....", "XX.XX", "XXXXX", ".XXX.", "..X.."], "P"),
    "note": (["..XX.", "..X.X", "..X..", "XXX..", "XX..."], "k"),
    "dots": ([".....", ".....", "X.X.X", ".....", "....."], "G"),
    "star": (["..X..", ".XXX.", "XXXXX", ".XXX.", ".X.X."], "y"),
}


def bubble_art(symbol_rows, color):
    out = [".ggggg."]
    for line in symbol_rows:
        out.append("g" + "".join(color if c == "X" else "w" for c in line[:5]) + "g")
    out.append(".ggggg.")
    out.append(".g.....")
    return out


BUBBLE_SYMBOLS_16 = {
    "!": (["X", "X", ".", "X"], "r"),
    "?": (["XX", ".X", "X.", "..", "X."], "k"),
    "heart": (["X.X", "XXX", ".X."], "P"),
    "note": ([".X", ".X", "XX"], "k"),
    "dots": (["X.X.X"], "G"),
    "star": ([".X.", "XXX", ".X."], "y"),
}


def bubbles():
    big = {name: bubble_art(rows, color) for name, (rows, color) in BUBBLE_SYMBOLS.items()}
    small = {name: ["".join(color if c == "X" else "." for c in line) for line in rows] for name, (rows, color) in BUBBLE_SYMBOLS_16.items()}
    big["zzz"] = ["..AAAA.", "....A..", "...A...", "..AAAA.", "AAA....", ".A.....", "AAA...."]
    small["zzz"] = ["AAA", ".A.", "AAA"]
    return {32: big, 16: small}


TREATS = {
    # A pink-frosted star cookie for LOCKI, a maple biscuit for CAPPL, a dew drop for NUMO.
    "locki": {32: ["..P..", ".mPm.", "mPmPm", ".mmm.", ".m.m."], 16: ["mP", "Pm"]},
    "cappl": {32: [".xxx.", "xmlmx", "xmmmx", "xmlmx", ".xxx."], 16: ["xm", "mx"]},
    "numo": {32: [".II.", "IDDI", "IDDI", ".II.", "...."], 16: ["ID", "DI"]},
}


# ── Items ─────────────────────────────────────────────────────────────────────
# Each item is drawn on one layer: "back" (behind the character, empty cells only),
# "face" (over the eyes), "hat" (over the hat, lifts with it), "hand" (under the
# paws, so the paws hold it) or "front" (over everything). An item with several
# frames animates; a hat item may also recolour the hat.


def layer(W, H, draw):
    c = Canvas(W, H)
    draw(c)
    return c.rows()


def item(layer_name, *frames, recolor=None):
    out = {"layer": layer_name, "frames": list(frames)}
    if recolor:
        out["recolor"] = recolor
    return out


def ring(c, cx, cy, rx, ry, color, width=1.0):
    for y in range(c.h):
        for x in range(c.w):
            d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            inner = ((x + 0.5 - cx) / max(rx - width, 0.1)) ** 2 + ((y + 0.5 - cy) / max(ry - width, 0.1)) ** 2
            if d <= 1 and inner > 1:
                c.set(x, y, color)


def background(c, bands):
    """Fill the whole canvas with horizontal colour bands: [(until_y, color), ...]."""
    for y in range(c.h):
        color = next(col for until, col in bands if y <= until)
        c.span(y, 0, c.w - 1, color)


def stars(c, spots, color):
    for x, y in spots:
        c.set(x, y, color)


def locki_items32(W=32, H=28):
    def aviators(c):
        for x0 in (9, 19):
            c.stamp(x0, 15, ["kkkk", "kkkk", ".kk."])
            c.set(x0 + 1, 15, "g")
        c.span(15, 13, 18, "y")
        c.span(15, 6, 8, "y")
        c.span(15, 23, 25, "y")

    def hearts(c):
        for x0 in (8, 19):
            c.stamp(x0, 15, ["PP.PP", "PPPPP", ".PPP.", "..P.."])
            c.set(x0, 15, "w")
        c.span(16, 13, 18, "p")

    def feather(c):
        for x, y in [(21, 7), (22, 6), (23, 5), (24, 4), (25, 3)]:
            c.set(x, y, "p")
        for x, y in [(22, 5), (23, 4), (24, 3), (25, 2), (26, 1), (23, 6), (24, 5), (25, 4), (26, 3), (26, 2), (27, 1), (27, 0)]:
            c.set(x, y, "P")

    def gold_star(c):
        c.stamp(12, 1, ["...yy...", "...yy...", "yyyllyyy", ".yyllyy.", "..yyyy..", ".yy..yy.", ".Y....Y."])

    def harmonica(c):
        c.span(23, 10, 21, "s")
        for x in range(10, 22):
            c.set(x, 24, "S" if x % 2 else "s")
        c.span(25, 10, 21, "S")

    def lasso(c):
        ring(c, 27.5, 18.5, 4.2, 5.2, "m", 1.2)
        for x, y in [(27, 23), (26, 24), (25, 25)]:
            c.set(x, y, "m")
        for x, y in [(24, 14), (31, 18), (30, 21)]:
            c.set(x, y, "M")

    def desert(c):
        background(c, [(9, "D"), (17, "I"), (99, "J")])
        for x0 in (0, 29):
            c.spans([(y, x0 + 1, x0 + 1) for y in range(14, 27)], "e")
            c.spans([(y, x0 + 2, x0 + 2) for y in range(14, 27)], "E")
            arm = 0 if x0 == 0 else 2
            c.spans([(18, x0 + arm, x0 + arm), (19, x0 + arm, x0 + arm)], "e")

    def sunset(c):
        background(c, [(5, "v"), (11, "U"), (16, "u"), (21, "a"), (99, "X")])
        c.ellipse(27, 18, 4, 4, "l", y_max=21)

    def galaxy(tick):
        spots = [[(11, 3), (19, 5), (14, 6), (4, 10), (26, 9)], [(13, 2), (17, 4), (21, 6), (7, 10), (24, 10)]]
        def draw(c):
            stars(c, spots[tick % 2], "l")
            stars(c, spots[(tick + 1) % 2], "y")
        return draw

    L = lambda d: layer(W, H, d)
    return {
        "aviators": item("face", L(aviators)),
        "feather": item("hat", L(feather)),
        "harmonica": item("hand", L(harmonica)),
        "heart-shades": item("face", L(hearts)),
        "lasso": item("hand", L(lasso)),
        "gold-star": item("hat", L(gold_star)),
        "desert": item("back", L(desert)),
        "white-hat": item("hat", L(lambda c: None), recolor={"N": "W", "n": "V", "H": "w"}),
        "sunset": item("back", L(sunset)),
        "galaxy-hat": item("hat", L(galaxy(0)), L(galaxy(1)), recolor={"N": "z", "n": "Z", "H": "v"}),
    }


def cappl_items32(W=32, H=28):
    def specs(c):
        for x0 in (10, 18):
            c.stamp(x0, 16, [".bb.", "b..b", "b..b", "b..b", ".bb."])
        c.span(17, 14, 17, "b")

    def straw(c):
        for x, y in [(18, 23), (19, 23), (20, 22), (21, 22), (22, 21), (23, 21), (24, 20)]:
            c.set(x, y, "m")
        for x, y in [(25, 19), (25, 20), (26, 19), (26, 18)]:
            c.set(x, y, "M")

    def bandana(c):
        c.spans([(20, 7, 24), (21, 7, 24), (22, 8, 23), (23, 10, 21), (24, 12, 19), (25, 14, 17)], "r")
        c.span(20, 7, 24, "d")
        for x, y in [(10, 21), (15, 22), (20, 21), (13, 24), (18, 23)]:
            c.set(x, y, "w")

    def coffee(tick):
        def draw(c):
            c.spans([(20, 13, 18), (21, 13, 18)], "j")
            c.span(20, 13, 18, "g")
            c.span(21, 14, 17, "X")
            c.spans([(y, 13, 18) for y in range(22, 26)], "j")
            c.spans([(22, 19, 20), (24, 19, 20)], "G")
            c.set(20, 23, "G")
            steam = [[(14, 18), (15, 17), (15, 16), (16, 15)], [(16, 18), (15, 17), (16, 16), (15, 15)]][tick % 2]
            for x, y in steam:
                c.set(x, y, "A")
        return draw

    def banjo(rim, head):
        def draw(c):
            for x, y in [(23, 16), (24, 15), (25, 14), (26, 13), (27, 12), (28, 11), (29, 10)]:
                c.set(x, y, "x")
                c.set(x + 1, y, "X")
            c.stamp(29, 8, ["Gx", "xG"])
            c.ellipse(25, 22, 4.6, 4.6, head)
            ring(c, 25, 22, 4.6, 4.6, rim, 1.2)
            c.set(25, 22, "G")
        return draw

    def sparrow(c):
        c.stamp(23, 3, [".xx..", "xkxO.", "xxcc.", ".xcx.", "..M.."])

    def campfire(tick):
        flames = [["..a..", ".aFa.", "FaFaF", ".FFF."], [".a...", ".Faa.", "aFaFa", ".FFF."], ["...a.", ".aaF.", "FaFaF", ".FFF."]]
        def draw(c):
            c.stamp(0, 20, flames[tick % 3])
            c.spans([(24, 0, 4)], "x")
            c.stamp(0, 25, ["XxxX.", ".XX.."])
        return draw

    def night(tick):
        spots = [[(2, 9), (29, 2), (24, 0), (30, 13), (1, 16)], [(5, 1), (27, 4), (31, 8), (2, 13), (30, 18)]]
        def draw(c):
            background(c, [(99, "z")])
            c.stamp(1, 0, [".ll.", "l...", "l...", ".ll."])
            stars(c, spots[tick % 2], "w")
            stars(c, spots[(tick + 1) % 2], "l")
        return draw

    L = lambda d: layer(W, H, d)
    return {
        "round-specs": item("face", L(specs)),
        "straw": item("face", L(straw)),
        "coffee": item("hand", L(coffee(0)), L(coffee(1))),
        "bandana": item("face", L(bandana)),
        "banjo": item("hand", L(banjo("x", "W"))),
        "sparrow": item("hat", L(sparrow)),
        "campfire": item("front", L(campfire(0)), L(campfire(1)), L(campfire(2))),
        "black-hat": item("hat", L(lambda c: None), recolor={"B": "q", "b": "k", "R": "G"}),
        "starry-night": item("back", L(night(0)), L(night(1))),
        "golden-banjo": item("hand", L(banjo("Y", "l"))),
    }


def locki_items16(W=16, H=14):
    def galaxy(tick):
        spots = [[(5, 1), (9, 2), (2, 4)], [(7, 1), (11, 2), (13, 4)]]
        return lambda c: (stars(c, spots[tick % 2], "l"), stars(c, spots[(tick + 1) % 2], "y"))

    L = lambda d: layer(W, H, d)
    return {
        "aviators": item("face", L(lambda c: (c.spans([(7, 4, 6), (7, 9, 11), (8, 5, 6), (8, 9, 10)], "k"), c.span(7, 7, 8, "y")))),
        "feather": item("hat", L(lambda c: (c.set(11, 2, "p"), c.stamp(12, 0, ["PP", "P."])))),
        "harmonica": item("hand", L(lambda c: (c.span(11, 5, 10, "s"), c.span(12, 5, 10, "S")))),
        "heart-shades": item("face", L(lambda c: (c.stamp(4, 7, ["P.P", "PPP", ".P."]), c.stamp(9, 7, ["P.P", "PPP", ".P."])))),
        "lasso": item("hand", L(lambda c: c.stamp(12, 6, [".mm.", "m..m", "m..m", ".mm."]))),
        "gold-star": item("hat", L(lambda c: c.spans([(1, 7, 8), (2, 6, 9)], "y"))),
        "desert": item("back", L(lambda c: (background(c, [(4, "D"), (8, "I"), (99, "J")]),
                                            c.spans([(y, 0, 0) for y in range(7, 13)] + [(y, 15, 15) for y in range(7, 13)], "e")))),
        "white-hat": item("hat", L(lambda c: None), recolor={"N": "W", "n": "V", "H": "w"}),
        "sunset": item("back", L(lambda c: (background(c, [(2, "v"), (5, "U"), (8, "u"), (10, "a"), (99, "X")]),
                                            c.spans([(8, 14, 15), (9, 14, 15)], "l")))),
        "galaxy-hat": item("hat", L(galaxy(0)), L(galaxy(1)), recolor={"N": "z", "n": "Z", "H": "v"}),
    }


def numo32():
    W, H = 32, 28
    ears = Canvas(W, H)  # cactus — no animal ears

    head = Canvas(W, H)
    head.ellipse(16, 17.5, 12.6, 9.2, "f", y_max=25)
    head.ellipse(16, 10, 7.5, 6, "f")
    head.outline("L")

    hat = cowboy_hat(W, H, "B", "b", "R", "W")
    hat.spans([(2, 15, 16), (3, 13, 18), (4, 14, 17), (5, 14, 14), (5, 17, 17)], "W")

    paws = [paw(Canvas(W, H), 5, 23, 8, 5, [7, 10], "f", "L"),
            paw(Canvas(W, H), 19, 23, 8, 5, [21, 24], "f", "L")]

    return {
        "width": W,
        "height": H,
        "ears": ears.rows(),
        "head": head.rows(),
        "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[11, 17], [19, 17]], "open": ["wX", "XX", "XX"], "blink": ["..", "..", "XX"],
                 "happy": [".XX.", "X..X"], "happyAt": [[10, 18], [18, 18]]},
        "nose": {"at": [14, 21], "art": ["XXXX", ".XX."]},
    }


def numo16():
    W, H = 16, 14
    ears = Canvas(W, H)  # cactus — no animal ears

    head = Canvas(W, H)
    head.ellipse(8, 8.8, 6.6, 4.8, "f", y_max=12)
    head.ellipse(8, 4.5, 4, 3.2, "f")
    head.outline("L")

    hat = cowboy_hat16(W, H, "B", "b", "R", "W")
    hat.spans([(1, 7, 8), (2, 6, 6), (2, 9, 9)], "W")

    paws = [paw(Canvas(W, H), 2, 11, 4, 3, [3], "f", "L"),
            paw(Canvas(W, H), 10, 11, 4, 3, [12], "f", "L")]

    return {
        "width": W, "height": H, "ears": ears.rows(), "head": head.rows(), "hat": hat.rows(),
        "paws": [p.rows() for p in paws],
        "eyes": {"at": [[5, 8], [10, 8]], "open": ["X", "X"], "blink": [".", "X"],
                 "happy": [".X.", "X.X"], "happyAt": [[4, 8], [9, 8]]},
        "nose": {"at": [7, 10], "art": ["XX"]},
    }


def numo_items32(W=32, H=28):
    def reading_specs(c):
        for x0 in (10, 18):
            c.stamp(x0, 16, [".bb.", "b..b", "b..b", ".bb."])
        c.span(17, 14, 17, "b")

    def cactus_bloom(c):
        c.stamp(18, 2, ["..h..", ".hhh.", "hhlhh", ".hhh.", "..h.."])

    def watering_can(c):
        c.spans([(21, 19, 24), (22, 18, 25), (23, 18, 25), (24, 19, 24)], "e")
        c.span(21, 20, 23, "E")
        for x, yy in [(18, 21), (17, 22), (16, 23)]:
            c.set(x, yy, "e")
        c.set(15, 24, "D")
        c.set(16, 25, "D")
        c.spans([(21, 25, 25), (22, 25, 26), (23, 25, 26), (24, 25, 25)], "e")

    def sun_goggles(c):
        for x0 in (9, 19):
            c.stamp(x0, 15, ["yyyy", "yyyy", ".yy."])
            c.set(x0 + 1, 15, "O")
        c.span(15, 13, 18, "y")
        c.span(15, 6, 8, "y")
        c.span(15, 23, 25, "y")

    def logbook(c):
        for yy in range(19, 26):
            c.span(yy, 20, 25, "W")
        c.spans([(yy, 19, 19) for yy in range(19, 26)], "X")
        for yy in [21, 23]:
            c.span(yy, 20, 25, "V")
        c.set(19, 25, "l")

    def moon_badge(c):
        c.stamp(20, 2, [".Wl", "W..", "W..", ".W."])

    def oasis(c):
        background(c, [(9, "D"), (17, "I"), (99, "J")])
        for yy in range(10, 18):
            c.set(2, yy, "x")
        c.stamp(0, 8, ["eee", "ee.", "e.."])
        c.stamp(2, 7, [".ee", "ee.", "e.."])
        c.spans([(24, 0, 6), (25, 0, 8)], "D")

    def starry_oasis(tick):
        spots = [[(2, 9), (28, 2), (24, 0), (30, 13), (1, 16)], [(5, 1), (27, 4), (31, 8), (2, 13), (30, 18)]]
        def draw(c):
            background(c, [(99, "z")])
            c.stamp(1, 0, [".ll.", "l...", "l...", ".ll."])
            stars(c, spots[tick % 2], "w")
            stars(c, spots[(tick + 1) % 2], "l")
            c.spans([(24, 0, 5), (25, 0, 7)], "D")
        return draw

    def golden_can(c):
        c.spans([(21, 19, 24), (22, 18, 25), (23, 18, 25), (24, 19, 24)], "y")
        c.span(21, 20, 23, "Y")
        for x, yy in [(18, 21), (17, 22), (16, 23)]:
            c.set(x, yy, "y")
        c.set(15, 24, "l")
        c.set(16, 25, "l")
        c.spans([(21, 25, 25), (22, 25, 26), (23, 25, 26), (24, 25, 25)], "y")

    L = lambda d: layer(W, H, d)
    return {
        "reading-specs": item("face", L(reading_specs)),
        "cactus-bloom": item("hat", L(cactus_bloom)),
        "watering-can": item("hand", L(watering_can)),
        "sun-goggles": item("face", L(sun_goggles)),
        "logbook": item("hand", L(logbook)),
        "moon-badge": item("hat", L(moon_badge)),
        "oasis": item("back", L(oasis)),
        "camel-hat": item("hat", L(lambda c: None), recolor={"B": "m", "b": "M", "R": "l"}),
        "starry-oasis": item("back", L(starry_oasis(0)), L(starry_oasis(1))),
        "golden-can": item("hand", L(golden_can)),
    }


def cappl_items16(W=16, H=14):
    def banjo(rim, head):
        return lambda c: (c.stamp(11, 9, [".xx.", "x" + head * 2 + "x", "x" + head * 2 + "x", ".xx."].copy() if rim == "x" else
                                  [".YY.", "Y" + head * 2 + "Y", "Y" + head * 2 + "Y", ".YY."]),
                          c.set(14, 8, "x"), c.set(15, 7, "x"))

    def night(tick):
        spots = [[(3, 0), (14, 1), (1, 6)], [(12, 0), (15, 4), (0, 9)]]
        return lambda c: (background(c, [(99, "z")]), c.stamp(0, 0, [".l", "l."]),
                          stars(c, spots[tick % 2], "w"), stars(c, spots[(tick + 1) % 2], "l"))

    def coffee(tick):
        return lambda c: (c.spans([(10, 6, 9), (11, 6, 9), (12, 6, 9)], "j"), c.span(10, 7, 8, "X"),
                          c.set(7 + tick % 2, 8, "A"), c.set(8 - tick % 2, 9, "A"))

    def fire(tick):
        return lambda c: c.stamp(0, 10, [["a.", "Fa", "FF", "XX"], [".a", "aF", "FF", "XX"]][tick % 2])

    L = lambda d: layer(W, H, d)
    return {
        "round-specs": item("face", L(lambda c: [c.stamp(x, 7, [".k.", "k.k", "k.k", ".k."]) for x in (4, 9)])),
        "straw": item("face", L(lambda c: (c.spans([(10, 9, 10), (9, 11, 12)], "m"), c.set(13, 8, "M")))),
        "coffee": item("hand", L(coffee(0)), L(coffee(1))),
        "bandana": item("face", L(lambda c: (c.spans([(10, 3, 12), (11, 4, 11), (12, 6, 9)], "r"), c.set(5, 10, "w"), c.set(10, 11, "w")))),
        "banjo": item("hand", L(banjo("x", "W"))),
        "sparrow": item("hat", L(lambda c: c.stamp(12, 3, ["xO", "xc"]))),
        "campfire": item("front", L(fire(0)), L(fire(1))),
        "black-hat": item("hat", L(lambda c: None), recolor={"B": "q", "b": "k", "R": "G"}),
        "starry-night": item("back", L(night(0)), L(night(1))),
        "golden-banjo": item("hand", L(banjo("Y", "l"))),
    }


def numo_items16(W=16, H=14):
    def night_oasis(tick):
        spots = [[(3, 0), (14, 1), (1, 6)], [(12, 0), (15, 4), (0, 9)]]
        return lambda c: (background(c, [(99, "z")]), c.stamp(0, 0, [".l", "l."]),
                          stars(c, spots[tick % 2], "w"), stars(c, spots[(tick + 1) % 2], "l"),
                          c.spans([(11, 0, 3), (12, 0, 4)], "D"))

    def can(color, rim):
        return lambda c: (c.spans([(10, 9, 12), (11, 9, 12), (12, 9, 12)], color),
                          c.span(10, 10, 11, rim),
                          c.set(8, 11, color), c.set(7, 12, color))

    L = lambda d: layer(W, H, d)
    return {
        "reading-specs": item("face", L(lambda c: (c.stamp(4, 7, [".b.", "b.b", ".b."]), c.stamp(9, 7, [".b.", "b.b", ".b."])))),
        "cactus-bloom": item("hat", L(lambda c: (c.set(8, 1, "h"), c.set(7, 2, "h"), c.set(9, 2, "h"), c.set(8, 2, "l")))),
        "watering-can": item("hand", L(can("e", "E"))),
        "sun-goggles": item("face", L(lambda c: (c.stamp(4, 7, ["yy", "yy"]), c.stamp(9, 7, ["yy", "yy"]), c.span(7, 6, 8, "y")))),
        "logbook": item("hand", L(lambda c: (c.spans([(10, 10, 13), (11, 10, 13), (12, 10, 13)], "W"), c.span(10, 9, 9, "X"), c.span(11, 9, 9, "X"), c.span(12, 9, 9, "X")))),
        "moon-badge": item("hat", L(lambda c: (c.set(8, 1, "W"), c.set(7, 2, "W"), c.set(7, 3, "W")))),
        "oasis": item("back", L(lambda c: (background(c, [(4, "D"), (8, "I"), (99, "J")]),
                                           c.spans([(yy, 0, 0) for yy in range(5, 13)], "x")))),
        "camel-hat": item("hat", L(lambda c: None), recolor={"B": "m", "b": "M", "R": "l"}),
        "starry-oasis": item("back", L(night_oasis(0)), L(night_oasis(1))),
        "golden-can": item("hand", L(can("y", "Y"))),
    }


PALETTE = {
    # LOCKI
    "N": "#2B4A8B", "n": "#1B2C57", "H": "#4568B0", "P": "#F2728F", "p": "#C8526F", "i": "#F6CFCF",
    # CAPPL / CARO
    "B": "#9C6B42", "b": "#6E4A2C", "R": "#C08E5E", "T": "#2F7A7E", "t": "#1D5257", "Q": "#4A979B",
    # NUMO
    "f": "#8BBF97", "L": "#5A8C6A",
    # shared fur and features
    "C": "#FFF3DC", "c": "#EEDDBD", "o": "#C4A57E", "K": "#1F1D24", "w": "#FFFFFF",
    # items and effects
    "k": "#16161A", "g": "#D1D5DB", "G": "#6B7280", "y": "#FACC15", "Y": "#B7791F", "l": "#FEF3A0",
    "r": "#E5484D", "d": "#A3272B", "m": "#D9A066", "M": "#A0703F", "x": "#8B5A2B", "X": "#5C3A1A",
    "e": "#5BA35E", "s": "#C9D1DB", "S": "#7C8796", "F": "#F97316", "a": "#FDE047", "A": "#E7EEF5",
    "u": "#FB923C", "U": "#E879A8", "v": "#7C5CC4", "z": "#27235E", "Z": "#17143D", "W": "#F4F1EA",
    "V": "#CFC8BA", "h": "#F7A1BD", "O": "#F59E0B", "q": "#2A2A30", "j": "#A7B0BC", "D": "#8ECDF0", "I": "#C4E6F6", "E": "#3E7D47", "J": "#E8C98F",
}


def compose(art, items=(), tick=0):
    c = Canvas(art["width"], art["height"])
    by = {name: [i for i in items if i["layer"] == name] for name in ("back", "face", "hat", "hand", "front")}
    for it in by["back"]:
        c.stamp(0, 0, it["frames"][tick % len(it["frames"])])
    for layer_rows in [art["ears"], art["head"]]:
        c.stamp(0, 0, layer_rows)
    for (x, y) in art["eyes"]["at"]:
        c.stamp(x, y, art["eyes"]["open"])
    c.stamp(*art["nose"]["at"], art["nose"]["art"])
    for it in by["face"]:
        c.stamp(0, 0, it["frames"][tick % len(it["frames"])])
    hat = [list(r) for r in art["hat"]]
    for it in by["hat"]:
        for k, v in it.get("recolor", {}).items():
            hat = [[v if ch == k else ch for ch in r] for r in hat]
    c.stamp(0, 0, ["".join(r) for r in hat])
    for it in by["hat"]:
        c.stamp(0, 0, it["frames"][tick % len(it["frames"])])
    for it in by["hand"]:
        c.stamp(0, 0, it["frames"][tick % len(it["frames"])])
    for p in art["paws"]:
        c.stamp(0, 0, p)
    for it in by["front"]:
        c.stamp(0, 0, it["frames"][tick % len(it["frames"])])
    return c.rows()


def png(path, sheets, scale=10):
    from PIL import Image

    pad = 2
    width = sum((len(rows[0]) + pad * 2) for rows in sheets) * scale
    height = max(len(rows) + pad * 2 for rows in sheets) * scale * 2
    img = Image.new("RGB", (width, height))
    for band, bg in enumerate(("#1f2430", "#f5f5f4")):
        ox = 0
        for rows in sheets:
            w, h = len(rows[0]) + pad * 2, len(rows) + pad * 2
            for y in range(h):
                for x in range(w):
                    key = rows[y - pad][x - pad] if 0 <= y - pad < len(rows) and 0 <= x - pad < len(rows[0]) else "."
                    color = PALETTE.get(key, bg)
                    for dy in range(scale):
                        for dx in range(scale):
                            img.putpixel((ox + x * scale + dx, band * (height // 2) + y * scale + dy), hex_rgb(color))
            ox += w * scale
    img.save(path)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


HEADER = """// Generated by tools/draw_art.py: edit that script and run it again, not this file.
// One character is a stack of full-canvas layers ('.' is empty) plus eye and nose
// stamps; hooks/sprite.ts composes them every frame. Letters are PALETTE keys.

export type Layer = readonly string[]
export type ItemLayer = 'back' | 'face' | 'hat' | 'hand' | 'front'
export type BodyArt = {
  width: number
  height: number
  ears: Layer
  head: Layer
  hat: Layer
  paws: readonly [Layer, Layer]
  eyes: {
    at: readonly (readonly [number, number])[]
    open: Layer
    blink: Layer
    happy: Layer
    happyAt: readonly (readonly [number, number])[]
  }
  nose: { at: readonly [number, number]; art: Layer }
  face: Face
}
export type Stamp = { art: Layer; dx: number; dy: number }
export type EyeKind = 'open' | 'blink' | 'closed' | 'happy' | 'shiny' | 'heart' | 'star' | 'wide' | 'x' | 'sleepy'
export type BrowKind = 'worried' | 'determined'
export type MouthKind = 'open' | 'w' | 'o' | 'tongue' | 'chomp' | 'yawn' | 'smile'
export type BubbleKind = '!' | '?' | 'heart' | 'note' | 'dots' | 'star' | 'zzz'
export type Face = {
  eyeAt: readonly (readonly [number, number])[]
  eyes: Readonly<Record<EyeKind, Stamp>>
  brows: Readonly<Record<BrowKind, readonly [Stamp, Stamp]>>
  mouthAt: readonly [number, number]
  mouths: Readonly<Record<MouthKind, Stamp>>
  blush: { at: readonly (readonly [number, number])[]; art: Layer }
  sweat: { at: readonly [number, number]; art: Layer }
  bubbleAt: readonly [number, number]
  treatAt: readonly [number, number]
}
export type ItemArt = { layer: ItemLayer; frames: readonly Layer[]; recolor?: Readonly<Record<string, string>> }
"""


def ts_layer(rows, indent):
    pad = " " * indent
    return "[\n" + "".join(f"{pad}  {json.dumps(r)},\n" for r in rows) + f"{pad}]"


def ts_body(art, indent):
    pad = " " * indent
    eyes = art["eyes"]
    return (
        "{\n"
        f"{pad}  width: {art['width']},\n"
        f"{pad}  height: {art['height']},\n"
        f"{pad}  ears: {ts_layer(art['ears'], indent + 2)},\n"
        f"{pad}  head: {ts_layer(art['head'], indent + 2)},\n"
        f"{pad}  hat: {ts_layer(art['hat'], indent + 2)},\n"
        f"{pad}  paws: [{ts_layer(art['paws'][0], indent + 2)}, {ts_layer(art['paws'][1], indent + 2)}],\n"
        f"{pad}  eyes: {{ at: {json.dumps(eyes['at'])}, open: {json.dumps(eyes['open'])}, blink: {json.dumps(eyes['blink'])}, "
        f"happy: {json.dumps(eyes['happy'])}, happyAt: {json.dumps(eyes['happyAt'])} }},\n"
        f"{pad}  nose: {{ at: {json.dumps(art['nose']['at'])}, art: {json.dumps(art['nose']['art'])} }},\n"
        f"{pad}  face: {json.dumps(art['face'])},\n"
        f"{pad}}}"
    )


def ts_item(it, indent):
    pad = " " * indent
    frames = ", ".join(ts_layer(f, indent + 2) for f in it["frames"])
    recolor = f", recolor: {json.dumps(it['recolor'])}" if "recolor" in it else ""
    return f"{{ layer: '{it['layer']}', frames: [{frames}]{recolor} }}"


def emit(arts, items):
    out = [HEADER]
    out.append("export const PALETTE: Readonly<Record<string, number>> = {")
    for k, v in PALETTE.items():
        out.append(f"  {json.dumps(k)}: 0x{v[1:].lower()},")
    out.append("}\n")
    out.append("export const BODY = {")
    for name, sizes in arts.items():
        out.append(f"  {name}: {{")
        for size, art in sizes.items():
            out.append(f"    {size}: {ts_body(art, 4)},")
        out.append("  },")
    out.append("} as const satisfies Record<string, Record<32 | 16, BodyArt>>\n")
    out.append(f"export const BUBBLES: Readonly<Record<32 | 16, Readonly<Record<BubbleKind, Layer>>>> = {json.dumps(bubbles())}\n")
    out.append(f"export const TREAT_ART: Readonly<Record<string, Record<32 | 16, Layer>>> = {json.dumps(TREATS)}\n")
    out.append("export const ITEM_ART: Readonly<Record<string, Readonly<Record<string, Record<32 | 16, ItemArt>>>>> = {")
    for name, sizes in items.items():
        out.append(f"  {name}: {{")
        for item_id in sizes[32]:
            out.append(f"    {json.dumps(item_id)}: {{")
            for size in (32, 16):
                out.append(f"      {size}: {ts_item(sizes[size][item_id], 6)},")
            out.append("    },")
        out.append("  },")
    out.append("}")
    with open(OUT, "w") as f:
        f.write("\n".join(out) + "\n")
    print(os.path.relpath(OUT, ROOT))


def icon(path, arts, size=1024):
    """The plugin icon: LOCKI and CAPPL peeking over a plank in a pastel squircle."""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sky = Image.new("RGBA", (size, size))
    top, bottom = hex_rgb("#CFE8F5"), hex_rgb("#F8E7C9")
    for y in range(size):
        k = y / (size - 1)
        ImageDraw.Draw(sky).line([(0, y), (size, y)], fill=tuple(int(a + (b - a) * k) for a, b in zip(top, bottom)) + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.23), fill=255)
    img.paste(sky, (0, 0), mask)
    scale = 13
    rows = [compose(arts["locki"][32]), compose(arts["cappl"][32])]
    total = sum(len(r[0]) for r in rows) * scale + 2 * scale
    ox = (size - total) // 2
    oy = (size - len(rows[0]) * scale) // 2 + int(size * 0.06)
    draw = ImageDraw.Draw(img, "RGBA")
    # The plank they peek over, behind the paws.
    plank = oy + 25 * scale
    draw.rectangle([0, plank, size, plank + 4 * scale], fill=hex_rgb("#B98B5E"))
    draw.rectangle([0, plank + 4 * scale, size, plank + 5 * scale], fill=hex_rgb("#8B5A2B"))
    for sx, sy, color in [(0.14, 0.16, "#F2728F"), (0.80, 0.12, "#FACC15"), (0.62, 0.24, "#FFFFFF"), (0.30, 0.08, "#FACC15"), (0.90, 0.30, "#F2728F")]:
        cx, cy, r = int(size * sx), int(size * sy), scale
        draw.rectangle([cx - r // 2, cy - r * 3 // 2, cx + r // 2, cy + r * 3 // 2], fill=hex_rgb(color))
        draw.rectangle([cx - r * 3 // 2, cy - r // 2, cx + r * 3 // 2, cy + r // 2], fill=hex_rgb(color))
    for rows_ in rows:
        for y, line in enumerate(rows_):
            for x, key in enumerate(line):
                if key in PALETTE:
                    draw.rectangle([ox + x * scale, oy + y * scale, ox + (x + 1) * scale - 1, oy + (y + 1) * scale - 1],
                                   fill=hex_rgb(PALETTE[key]))
        ox += len(rows_[0]) * scale + 2 * scale
    clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    clipped.paste(img, (0, 0), mask)
    img = clipped
    img.save(path)
    print(path)


if __name__ == "__main__":
    arts = {"locki": {32: locki32(), 16: locki16()}, "cappl": {32: cappl32(), 16: cappl16()}, "numo": {32: numo32(), 16: numo16()}}
    for who in arts:
        arts[who][32]["face"] = face32(who)
        arts[who][16]["face"] = face16(who)
    items = {"locki": locki_items32(), "cappl": cappl_items32(), "numo": numo_items32()}
    emit(arts, {"locki": {32: items["locki"], 16: locki_items16()}, "cappl": {32: items["cappl"], 16: cappl_items16()}, "numo": {32: items["numo"], 16: numo_items16()}})
    if "--icon" in sys.argv:
        icon(sys.argv[sys.argv.index("--icon") + 1], arts)
    if "--png" in sys.argv:
        out = sys.argv[sys.argv.index("--png") + 1]
        sheets = []
        for k in arts:
            sheets.append(compose(arts[k][32]))
            for name, it in items[k].items():
                sheets.append(compose(arts[k][32], [it]))
        png(out, sheets[:11], scale=6)
        png(out.replace(".png", "-2.png"), sheets[11:], scale=6)
        small = {"locki": locki_items16(), "cappl": cappl_items16(), "numo": numo_items16()}
        sheets = []
        for k in arts:
            sheets.append(compose(arts[k][16]))
            for name, it in small[k].items():
                sheets.append(compose(arts[k][16], [it]))
        png(out.replace(".png", "-16.png"), sheets, scale=6)
        print(out)
