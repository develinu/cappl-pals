# Making the demo video

How `docs/cappl-pals-demo.mp4` and its Korean cut `docs/cappl-pals-demo.ko.mp4` (1080p, 30 fps, about 1.5 minutes) are made: a real Claude Code session recorded in tmux, with motion graphics and a synthesized soundtrack on top. Each language has its own take: the Korean one sets Claude Code's `language` to Korean, so the pane and Claude answer in Korean.

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

1. `./setup_demo.sh` makes `/tmp/cappl-demo/` with a renamed copy of the mod (`cappl-pals-demo`, starting at Lv34, 12 rep short of Sheriff, with $1,872, $28 short of CARO's black hat, so your real progress is untouched) and a repository with one failing test. Start `claude` once in `/tmp/cappl-demo/repo` and trust the folder.
2. `python3 -I record.py /tmp/cappl-demo/take-v2-en en` (or `/tmp/cappl-demo/take-v2-ko ko`) drives Claude Code (Haiku) in tmux and saves the screen as ANSI 15 times a second: CARO is picked, Claude fixes and commits, then the take pets CARO three times (the day's bounty), asks for a trick, buys a treat and the black hat, switches to RIKI and pets RIKI. It starts Claude with `env -i` so nothing leaks in from the session you run it from. Record on a day whose pal bounty is "Pet your pal ×3" (`questsOf` in `mod/hooks/rules.ts`), or the bounty moment won't happen.
3. `.venv/bin/python render_frames.py /tmp/cappl-demo/take-v2-en /tmp/cappl-demo/render-v2-en` (`render-v2-ko` for the Korean take) draws the frames as PNG with `term.py`, an ANSI renderer that paints half blocks and box lines itself.
4. `bun export_frames.ts > assets/poses.json` exports every activity and act of both pals in each outfit the scenes use, drawn by the mod's own composer.
5. `.venv/bin/python compose.py video en` (or `ko`) writes `out/video-en.mp4` and `out/events-en.json`. `compose.py plan en` prints the timeline; `compose.py stills en 37.4` writes single frames to check.
6. `.venv/bin/python audio.py en` (or `ko`) writes `out/audio-en.wav`. In-session moments use the mod's own character sounds.
7. Mux:

```sh
FF=$(.venv/bin/python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
$FF -i out/video-en.mp4 -i out/audio-en.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../docs/cappl-pals-demo.mp4
$FF -i out/video-ko.mp4 -i out/audio-ko.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ../docs/cappl-pals-demo.ko.mp4
```

The README highlight GIFs are cut from the finished videos (12 fps, 960 px, a shared palette): the moods grid, the hello, the failing test, the level-up, the petting, the treat and the hat.

```sh
gif() {  # gif <video> <gif> <start-end>...
  src=$1 out=$2; shift 2; n=0 parts= labels=
  for seg in "$@"; do parts="$parts[0:v]trim=${seg%-*}:${seg#*-},setpts=PTS-STARTPTS[s$n];"; labels="$labels[s$n]"; n=$((n+1)); done
  $FF -y -i "$src" -filter_complex "${parts}${labels}concat=n=$n:v=1:a=0,fps=12,scale=960:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=160:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$out"
}
gif ../docs/cappl-pals-demo.mp4 ../docs/cappl-pals-demo.gif 8.6-10.4 22.4-24.2 32.6-34.0 36.6-38.8 43.6-45.6 52.4-54.0 56.4-57.8
gif ../docs/cappl-pals-demo.ko.mp4 ../docs/cappl-pals-demo.ko.gif 8.6-10.4 22.4-24.2 31.03-32.43 35.03-37.23 39.73-41.73 48.43-50.03 52.43-53.83
```

`docs/cappl-pals-demo-poster*.png` are stills for the repository's social preview (`compose.py stills en 4.8`, scaled to 1280 × 720).

A new take changes what Claude does and when, so update that language's entry in `ANCHORS` in `compose.py` from the new `marks.json` and frames (when the test fails, the level-up, the commit, the bounty, the RIKI hello). The segments, popups, keycaps and captions follow the anchors, and `plan` shows where the GIF cuts now fall. On-screen words live in `TEXT`, `CAPTION_TEXT` and `POPUP_TEXT`.
