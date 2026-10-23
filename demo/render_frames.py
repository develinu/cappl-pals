"""Render record.py's ANSI frames to PNG (the weekly-limit notice and prompt suggestions are blanked out).

Usage: .venv/bin/python render_frames.py /tmp/cappl-demo/take2 /tmp/cappl-demo/render
"""

import json
import os
import sys

import term

src, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
# Sprite cells snap back to the mod's own palette (the engine rounds colours under tmux).
palette = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "poses.json")))["palette"]
term.BRAND = [tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for v in palette.values()]
frames = [json.loads(line) for line in open(os.path.join(src, "frames.jsonl"), encoding="utf-8")]
divider = term.find_divider(frames[-1]["ansi"])


def mask(grid):
    for row in grid:
        line = "".join(cell[0] for cell in row)
        if "weekly limit" in line:
            for x in range(min(divider, len(row))):
                row[x] = (" ", None, None, False, False)
        # A dimmed prompt suggestion ("push it") would read as typed text.
        typed = row[2:min(divider, len(row))]
        if line.startswith("❯") and any(cell[4] for cell in typed) and all(cell[4] or cell[0] in (" ", "\xa0", "") for cell in typed):
            for x in range(1, min(divider, len(row))):
                row[x] = (" ", None, None, False, False)
        at = line.find("· ← ")
        if at >= 0:
            for x in range(at, min(divider, len(row))):
                row[x] = (" ", None, None, False, False)


for i, frame in enumerate(frames):
    term.render(frame["ansi"], 150, 42, mask=mask, divider=divider, pane_rows=38).save(
        os.path.join(dest, f"{i:04d}.png"), compress_level=1)
json.dump([frame["t"] for frame in frames], open(os.path.join(dest, "times.json"), "w"))
print(len(frames), "frames, divider", divider)
