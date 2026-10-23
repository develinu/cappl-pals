"""Drive a real Claude Code session in tmux for the demo and save the screen as ANSI, 15 times a second.

Usage: python3 -I record.py <output dir>
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

OUT = sys.argv[1]
SOCK = ["tmux", "-L", "cappldemo"]
FPS = 15
COLS, ROWS = 150, 42
REPO = "/tmp/cappl-demo/repo"
PLUGIN = "/tmp/cappl-demo/cappl-pals-demo"
PROMPT = (
    "Run npm test. If it fails, fix src/trail.js and run the tests again. "
    "When they pass, commit with git commit -qam 'Pad minutes in ride time' and answer in one line."
)


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
        f"claude --setting-sources project --settings '{{\"tui\":\"fullscreen\",\"viewMode\":\"default\"}}' "
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

    if not wait_for(r"Pick your partner", 60):
        raise SystemExit("the picker did not show up")
    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    mark("ready")
    time.sleep(3.0)

    # Pick CAPPL in the pane.
    keys("C-x")
    time.sleep(0.3)
    keys("Tab")
    time.sleep(1.0)
    mark("pick")
    keys("2")
    time.sleep(3.2)
    keys("Escape")
    time.sleep(0.8)

    mark("type")
    type_text(PROMPT)
    time.sleep(0.8)
    keys("Enter")
    mark("submit")

    if not wait_for(r"Claim staked", 180):
        mark("no-commit")
    wait_for(r"for \d+(m \d+)?s", 60)
    mark("turn-done")
    time.sleep(3.0)

    # Buy the banjo, then switch to LOCKI.
    keys("C-x")
    time.sleep(0.3)
    keys("Tab")
    time.sleep(1.2)
    mark("shop")
    keys("5")
    time.sleep(3.2)
    mark("switch")
    keys("c")
    time.sleep(2.2)
    keys("1")
    time.sleep(3.5)
    keys("Escape")
    time.sleep(0.8)

    mark("rules")
    type_text("/cappl-rules", 0.06)
    time.sleep(0.5)
    keys("Enter")
    time.sleep(5.0)
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
