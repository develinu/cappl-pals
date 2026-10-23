"""Pull the events the reward rules need out of Claude Code transcripts.

No prompts or code are kept: only the timing of prompts, edits and turns, and for
commands that look like tests, commits or merges, the command and the first and
last 2,000 characters of its output. Write it under .data/ (ignored by git).
Usage: python3 -I tools/extract_events.py ~/.claude/projects .data/events.jsonl
"""

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# The TypeScript rules (mod/hooks/rules.ts) decide; this only keeps candidate commands.
PREFILTER = re.compile(r"\b(test|pytest|vitest|jest|rspec|phpunit|commit|merge)\b")
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def ms(stamp: str) -> int:
    return int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() * 1000)


def text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
    return ""


def events_of(path: Path, session: str, is_sub: bool):
    calls = {}
    for line in path.open(encoding="utf-8", errors="replace"):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        stamp = entry.get("timestamp")
        if not stamp:
            continue
        at = ms(stamp)
        message = entry.get("message") or {}
        content = message.get("content")
        if entry.get("type") == "assistant" and isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    calls[block.get("id")] = (block.get("name"), block.get("input") or {})
            if message.get("stop_reason") == "end_turn" and not is_sub:
                yield {"t": at, "k": "turn"}
        elif entry.get("type") == "user":
            origin = entry.get("origin") or {}
            if not is_sub and origin.get("kind") == "human" and not entry.get("isMeta"):
                yield {"t": at, "k": "prompt"}
                continue
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict) or block.get("type") != "tool_result":
                    continue
                name, args = calls.pop(block.get("tool_use_id"), (None, {}))
                if name is None:
                    continue
                failed = bool(block.get("is_error"))
                out = {"t": at, "k": "tool", "tool": name, "err": failed}
                if name in EDIT_TOOLS:
                    out["k"] = "edit_fail" if failed else "edit_ok"
                elif name == "ExitPlanMode":
                    out["k"] = "plan_fail" if failed else "plan_ok"
                elif name == "Bash":
                    command = str(args.get("command", ""))
                    if PREFILTER.search(command):
                        out["k"] = "bash"
                        out["cmd"] = command[:400]
                        text = text_of(block.get("content"))
                        out["out"] = text if len(text) <= 4000 else text[:2000] + "\n…\n" + text[-2000:]
                yield out


def main(root: str, dest: str) -> None:
    rows = []
    for path in Path(root).glob("*/**/*.jsonl"):
        is_sub = "subagents" in path.parts
        owner = path.parts[-3] if is_sub else path.stem
        session = hashlib.sha256(owner.encode()).hexdigest()[:10]
        for event in events_of(path, session, is_sub):
            event["s"] = session
            event["sub"] = is_sub
            rows.append(event)
    rows.sort(key=lambda row: row["t"])
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"{len(rows)} events -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
