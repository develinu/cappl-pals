# Making the demo video

How `docs/cappl-pals-demo.mp4` and its Korean cut `docs/cappl-pals-demo.ko.mp4` (1080p, 30 fps, 78 s) are made: a real Claude Code session recorded in tmux, with motion graphics and a synthesized soundtrack on top. Each language has its own take: the Korean one sets Claude Code's `language` to Korean, so the pane and Claude answer in Korean.

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
2. `python3 -I record.py /tmp/cappl-demo/take3 en` (or `/tmp/cappl-demo/take-ko ko`) drives Claude Code (Haiku) in tmux and saves the screen as ANSI 15 times a second. It starts Claude with `env -i` so nothing leaks in from the session you run it from.
3. `.venv/bin/python render_frames.py /tmp/cappl-demo/take3 /tmp/cappl-demo/render-en` (`render-ko` for the Korean take) draws the frames as PNG with `term.py`, an ANSI renderer that paints half blocks and box lines itself.
4. `bun export_frames.ts > assets/poses.json` exports the poses the scenes use, drawn by the mod's own composer.
5. `.venv/bin/python compose.py video en` (or `ko`) writes `out/video-en.mp4` and `out/events-en.json`.
6. `.venv/bin/python audio.py en` (or `ko`) writes `out/audio-en.wav`. In-session moments use the mod's own character sounds.
7. Mux:

```sh
FF=$(.venv/bin/python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
$FF -i out/video-en.mp4 -i out/audio-en.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../docs/cappl-pals-demo.mp4
$FF -i out/video-ko.mp4 -i out/audio-ko.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../docs/cappl-pals-demo.ko.mp4
```

The README highlight GIFs are cut from the finished videos (12 fps, 960 px, a shared palette):

```sh
$FF -i ../docs/cappl-pals-demo.mp4 -filter_complex "[0:v]trim=0.6:4.8,setpts=PTS-STARTPTS[a];[0:v]trim=15.4:18.2,setpts=PTS-STARTPTS[b];[0:v]trim=28.4:30.4,setpts=PTS-STARTPTS[c];[0:v]trim=34.8:36.4,setpts=PTS-STARTPTS[d];[0:v]trim=39.6:41.0,setpts=PTS-STARTPTS[e];[a][b][c][d][e]concat=n=5:v=1:a=0,fps=12,scale=960:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=160:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" ../docs/cappl-pals-demo.gif
```

`docs/cappl-pals-demo-poster*.png` are stills for the repository's social preview.

A new take changes what Claude does and when, so retime that language's entry in `TAKES` in `compose.py` (segments, typing, popups, keys) against the new `marks.json` and frames. On-screen words live in `TEXT`.
