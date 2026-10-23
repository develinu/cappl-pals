# Making the demo video

How `docs/cappl-pals-demo.mp4` (1080p, 30 fps, 78 s) is made: a real Claude Code session recorded in tmux, with motion graphics and a synthesized soundtrack on top.

## Setup

```sh
cd demo
uv venv .venv && uv pip install --python .venv/bin/python imageio-ffmpeg pillow numpy fonttools scipy
```

The fonts are not in the repository. Put these in `demo/assets/fonts/` and install Pretendard in `~/.fonts` (all under the SIL Open Font License):

- Galmuri v2.40.4 (github.com/quiple/galmuri): `Galmuri11-Bold.ttf`
- D2Coding VER1.4.0 (github.com/naver/d2-coding-font): rename to `D2Coding.ttf` and `D2CodingBold.ttf`
- Pretendard (github.com/orioncactus/pretendard): `Pretendard-ExtraBold.otf`, `-Bold`, `-SemiBold`, `-Medium`

## Steps

1. `./setup_demo.sh` makes `/tmp/cappl-demo/` with a renamed copy of the mod (`cappl-pals-demo`, starting at Lv14 with $642, so your real progress is untouched) and a repository with one failing test. Start `claude` once in `/tmp/cappl-demo/repo` and trust the folder.
2. `python3 -I record.py /tmp/cappl-demo/take3` drives Claude Code (Haiku) in tmux and saves the screen as ANSI 15 times a second. It starts Claude with `env -i` so nothing leaks in from the session you run it from.
3. `.venv/bin/python render_frames.py /tmp/cappl-demo/take3 /tmp/cappl-demo/render` draws the frames as PNG with `term.py`, an ANSI renderer that paints half blocks and box lines itself.
4. `bun export_frames.ts > assets/poses.json` exports the poses the scenes use, drawn by the mod's own composer.
5. `.venv/bin/python compose.py video` writes `out/video.mp4` and `out/events.json`.
6. `.venv/bin/python audio.py` writes `out/audio.wav`. In-session moments use the mod's own character sounds.
7. Mux:

```sh
FF=$(.venv/bin/python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
$FF -i out/video.mp4 -i out/audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../docs/cappl-pals-demo.mp4
```

A new take changes what Claude does and when, so retime `SEGMENTS`, `CAPTIONS`, `POPUPS` and `KEYS` in `compose.py` against the new `marks.json` and frames.
