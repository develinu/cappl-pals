"""Drive a real Claude Code session in tmux for the demo and save the screen as ANSI, 15 times a second.

Usage: python3 -I record.py <output dir> [en|ko]
Run ./setup_demo.sh first: it makes a renamed copy of the mod (cappl-pals-demo) and a
repository with one failing test under /tmp/cappl-demo/.
"""

import glob
import json
import os
import re
import shlex
import subprocess
import sys
import threading
import time
import unicodedata
from collections import Counter

OUT = sys.argv[1]
LANG = sys.argv[2] if len(sys.argv) > 2 else "en"
SOCK = ["tmux", "-L", "cappldemo"]
FPS = 15
COLS, ROWS = 150, 42
REPO = "/tmp/cappl-demo/repo"
PLUGIN = "/tmp/cappl-demo/cappl-pals-demo"
# What the take types and waits for, in each language. The mod follows Claude Code's
# `language` setting, so the Korean take also sets it.
TAKE = {
    "en": {
        "language": "English",
        "prompt": "Run npm test. If it fails, fix src/trail.js and run the tests again. "
                  "When they pass, commit with git commit -qam 'Pad minutes in ride time' and answer in one line.",
        "picker": r"Pick your partner",
        "commit": r"Claim staked",
        "done": r"for \d+(m \d+)?s",
        # The pane's button labels (mod/hooks/i18n.ts and the characters' items).
        "pick_caro": "Pick CARO",
        "pick_numo": "Pick NUMO",
        "pet": "Pet",
        "trick": "Trick",
        "treat": "Treat: Maple biscuit $6",
        "hat": "Black hat $1,250",
        "switch": "Switch character",
    },
    "ko": {
        "language": "Korean",
        "prompt": "npm test 돌려 보고 실패하면 src/trail.js 고친 다음 다시 테스트해 줘. "
                  "통과하면 git commit -qam '이동 시간의 분을 두 자리로' 로 커밋하고 한 줄로만 답해.",
        "picker": r"함께할 친구를 고르세요",
        "commit": r"말뚝 박기",
        "done": r"for \d+(m \d+)?s",
        "pick_caro": "CARO 고르기",
        "pick_numo": "NUMO 고르기",
        "pet": "쓰다듬기",
        "trick": "재주",
        "treat": "간식: 메이플 비스킷 $6",
        "hat": "검은 카우보이모자 $1,250",
        "switch": "캐릭터 바꾸기",
    },
}[LANG]
PROMPT = TAKE["prompt"]


def sh(*args: str, check: bool = False) -> str:
    return subprocess.run(args, capture_output=True, text=True, check=check).stdout


def capture() -> str:
    return sh(*SOCK, "capture-pane", "-t", "demo", "-p", "-e")


def plain() -> str:
    return sh(*SOCK, "capture-pane", "-t", "demo", "-p")


def keys(*items: str) -> None:
    sh(*SOCK, "send-keys", "-t", "demo", *items)


def wait_for(pattern: str, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if re.search(pattern, plain(), re.M):
            return True
        time.sleep(0.2)
    return False


def type_text(text: str, delay: float = 0.045) -> None:
    for char in text:
        keys("-l", char)
        time.sleep(delay)


SGR = re.compile(r"\x1b\[([0-9;:]*)m")
BUTTON = re.compile(r"\[ (.+?) \]")


def sgr(state: dict, params: str) -> dict:
    """Apply one SGR sequence to {bold, reverse, fg, bg}."""
    codes = params.replace(":", ";").split(";") if params else ["0"]
    state = dict(state)
    i = 0
    while i < len(codes):
        code = codes[i]
        if code in ("", "0"):
            state = {}
        elif code in ("38", "48"):
            n = 4 if codes[i + 1:i + 2] == ["2"] else 2
            state["fg" if code == "38" else "bg"] = ";".join(codes[i + 1:i + 1 + n])
            i += n
        elif code in ("39", "49"):
            state.pop("fg" if code == "39" else "bg", None)
        elif code in ("1", "2", "7"):
            state[code] = True
        elif code in ("22", "27"):
            state.pop("7" if code == "27" else "1", None)
            if code == "22":
                state.pop("2", None)
        i += 1
    return state


def cells(row: str) -> list[tuple[str, tuple]]:
    """A row of `capture-pane -e` as (char, style) cells; a wide char's second cell is a NUL."""
    out: list[tuple[str, tuple]] = []
    state: dict = {}
    style: tuple = ()
    for i, part in enumerate(SGR.split(row)):
        if i % 2:
            state = sgr(state, part)
            style = tuple(sorted(state.items()))
            continue
        for char in part:
            out.append((char, style))
            if unicodedata.east_asian_width(char) in "WF":
                out.append(("\0", style))
    return out


def focused() -> str | None:
    """The pane button in focus: the one drawn unlike the others. The pane has no
    hotkeys (v0.2.4), so the take walks the focus with Tab and presses Enter."""
    rows = [cells(row) for row in capture().split("\n")]
    bars = Counter(x for row in rows[1:20] for x, (char, _) in enumerate(row) if char == "│")
    divider = bars.most_common(1)[0][0] if bars else 0
    found: dict[str, frozenset] = {}
    for row in rows:
        text = "".join(char for char, _ in row)
        for match in BUTTON.finditer(text, divider):
            found[match.group(1).replace("\0", "")] = frozenset(style for _, style in row[match.start():match.end()])
    counts = Counter(found.values())
    odd = [label for label, style in found.items() if counts[style] == 1]
    return odd[0] if len(found) > 2 and len(odd) == 1 else None


def focus(label: str, tries: int = 30) -> None:
    for _ in range(tries):
        # Checked twice: a drawing that lags a Tab behind would stop one button short.
        if focused() == label:
            time.sleep(0.25)
            if focused() == label:
                return
        keys("Tab")
        time.sleep(0.25)
    raise SystemExit(f"could not focus [ {label} ] (in focus: {focused()!r})")


def reset() -> None:
    for path in glob.glob(os.path.expanduser("~/.claude/plugins/store/cappl-pals-demo_inline-*.json")):
        os.remove(path)
    sh("git", "-C", REPO, "reset", "-q", "--hard", "HEAD@{0}")
    first = sh("git", "-C", REPO, "rev-list", "--max-parents=0", "HEAD").strip()
    sh("git", "-C", REPO, "reset", "-q", "--hard", first)
    sh("git", "-C", REPO, "clean", "-qfd")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    reset()
    sh(*SOCK, "kill-server")
    # A clean environment, so nothing leaks in from the outer Claude session (CLAUDE_CODE_CHILD_SESSION and so on).
    home = os.path.expanduser("~")
    command = (
        f"cd {REPO} && env -i HOME={home} PATH={shlex.quote(os.environ['PATH'])} USER={os.environ.get('USER', '')} "
        f"SHELL=/bin/bash LANG=C.UTF-8 TERM=xterm-256color COLORTERM=truecolor "
        f"claude --setting-sources project --settings '{{\"tui\":\"fullscreen\",\"theme\":\"dark\",\"viewMode\":\"default\",\"language\":\"{TAKE['language']}\"}}' "
        f"--plugin-dir {PLUGIN} --model haiku"
    )
    sh(*SOCK, "-f", "/tmp/cappl-demo/tmux.conf", "new-session", "-d", "-s", "demo",
       "-x", str(COLS), "-y", str(ROWS), command)

    frames: list[tuple[float, str]] = []
    marks: list[tuple[float, str]] = []
    stop = threading.Event()
    start = time.time()

    def mark(name: str) -> None:
        marks.append((time.time() - start, name))
        print(f"{time.time() - start:6.1f}s {name}", flush=True)

    def loop() -> None:
        tick = 0
        while not stop.is_set():
            at = time.time() - start
            text = capture()
            if not frames or frames[-1][1] != text:
                frames.append((at, text))
            tick += 1
            time.sleep(max(0.0, start + tick / FPS - time.time()))

    if not wait_for(TAKE["picker"], 60):
        raise SystemExit("the picker did not show up")
    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    mark("ready")
    time.sleep(3.0)

    # Pick CARO in the pane.
    keys("C-x")
    time.sleep(0.3)
    keys("Tab")
    time.sleep(0.4)
    focus(TAKE["pick_caro"])
    time.sleep(0.6)
    mark("pick")
    keys("Enter")
    time.sleep(3.2)
    keys("Escape")
    time.sleep(0.8)

    mark("type")
    type_text(PROMPT)
    time.sleep(0.8)
    keys("Enter")
    mark("submit")

    if not wait_for(TAKE["commit"], 180):
        mark("no-commit")
    wait_for(TAKE["done"], 60)
    mark("turn-done")
    time.sleep(4.0)

    # Play with CARO: three pets (the day's bounty), the newest trick, a treat.
    keys("C-x")
    time.sleep(0.3)
    keys("Tab")
    time.sleep(0.4)
    focus(TAKE["pet"])
    time.sleep(0.6)
    mark("pet")
    for _ in range(3):
        keys("Enter")
        time.sleep(0.7)
    time.sleep(4.0)
    focus(TAKE["trick"])
    time.sleep(0.4)
    mark("trick")
    keys("Enter")
    time.sleep(4.0)
    focus(TAKE["treat"])
    time.sleep(0.4)
    mark("treat")
    keys("Enter")
    time.sleep(4.0)

    # Buy the black hat, then switch to NUMO for a pet.
    focus(TAKE["hat"])
    time.sleep(0.6)
    mark("shop")
    keys("Enter")
    time.sleep(3.4)
    focus(TAKE["switch"])
    time.sleep(0.4)
    mark("switch")
    keys("Enter")
    time.sleep(1.6)
    focus(TAKE["pick_numo"])
    time.sleep(0.6)
    keys("Enter")
    time.sleep(3.0)
    # A pick puts the focus on Pet.
    focus(TAKE["pet"])
    mark("pet-numo")
    keys("Enter")
    time.sleep(3.0)
    keys("Escape")
    time.sleep(0.8)
    mark("end")

    stop.set()
    thread.join()
    keys("/exit", "Enter")
    time.sleep(1.5)
    sh(*SOCK, "kill-server")

    with open(os.path.join(OUT, "frames.jsonl"), "w", encoding="utf-8") as out:
        for at, text in frames:
            out.write(json.dumps({"t": round(at, 3), "ansi": text}, ensure_ascii=False) + "\n")
    with open(os.path.join(OUT, "marks.json"), "w", encoding="utf-8") as out:
        json.dump(marks, out, ensure_ascii=False, indent=1)
    print(f"{len(frames)} frames, {frames[-1][0]:.1f}s")


if __name__ == "__main__":
    main()
