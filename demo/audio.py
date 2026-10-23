"""Synthesize the demo's music and sound effects (no third-party audio).

The backing track is a country-flavoured chiptune: boom-chick bass, a banjo roll made
with Karplus-Strong plucks, and a square-wave lead. In-session moments use the mod's
own character sounds from mod/assets/sfx/.

Usage: .venv/bin/python audio.py   # reads out/events.json, writes out/audio.wav
"""

import json
import os
import wave
from functools import lru_cache

import numpy as np
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
SFX_DIR = os.path.join(HERE, "..", "mod", "assets", "sfx")
SR = 48000
RNG = np.random.default_rng(5)

spec = json.load(open(os.path.join(OUT, "events.json")))
TOTAL = spec["total"]
N = int((TOTAL + 1.5) * SR)
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def note_hz(name: str) -> float:
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440.0 * 2 ** ((names[name[:-1]] + (int(name[-1]) - 4) * 12) / 12)


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def square(freq, dur, duty=0.5):
    t = tvec(dur)
    return np.where((t * freq) % 1.0 < duty, 1.0, -1.0)


def triangle(freq, dur):
    t = tvec(dur)
    return 2 * np.abs(2 * ((t * freq) % 1.0) - 1) - 1


def env(n, attack=0.005, decay=0.2, sustain=0.0, release=0.05):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = sustain + (1 - sustain) * np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4))
    r = np.clip((n / SR - t) / max(release, 1e-4), 0, 1)
    return a * d * r


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= len(buf) or len(sig) == 0 or i < 0:
        return
    sig = sig[: len(buf) - i]
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * left * 1.414
    buf[i:i + len(sig), 1] += sig * gain * right * 1.414


def noise(dur):
    return RNG.uniform(-1, 1, int(dur * SR))


def highpass(x, k=0.85):
    return lfilter([k, -k], [1, -k], x)


def lowpass(x, k=0.2):
    return lfilter([k], [1, -(1 - k)], x)


@lru_cache(maxsize=None)
def pluck(name, dur, bright=0.5):
    """Karplus-Strong: a plucked string, here a banjo."""
    freq = note_hz(name)
    n = int(dur * SR)
    period = max(2, int(SR / freq))
    buf = RNG.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = 0.994 * (bright * buf[j] + (1 - bright) * buf[(j + 1) % period])
    return (out + highpass(out) * 0.3) * np.clip((dur - np.arange(n) / SR) / 0.02, 0, 1)


# ── Drums ──────────────────────────────────────────────────────────────────

def kick():
    t = tvec(0.25)
    freq = 48 + 100 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.1)


HP_NOISE = highpass(noise(2.5), 0.92)


def brush():
    t = tvec(0.18)
    return HP_NOISE[: len(t)] * np.exp(-t / 0.05) * 0.8 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03) * 0.3


def hat():
    t = tvec(0.04)
    return HP_NOISE[: len(t)] * np.exp(-t / 0.01)


def block(pitch):
    t = tvec(0.07)
    return np.sin(2 * np.pi * pitch * t) * np.exp(-t / 0.012) + HP_NOISE[: len(t)] * np.exp(-t / 0.004) * 0.4


KICK, BRUSH, HAT = kick(), brush(), hat()
CRASH = HP_NOISE[: int(2.2 * SR)] * np.exp(-tvec(2.2) / 0.7)
CLIP, CLOP = block(780), block(560)

# ── The tune ───────────────────────────────────────────────────────────────

BPM = 116
BEAT = 60 / BPM
BAR = BEAT * 4
PROG = [("G2", "G"), ("C3", "C"), ("D3", "D"), ("G2", "G")]
CHORDS = {"G": ["G3", "B3", "D4"], "C": ["C4", "E4", "G4"], "D": ["D4", "F#4", "A4"]}
FIFTH = {"G": "D3", "C": "G2", "D": "A2"}
ROLL = {"G": ["G4", "B4", "D5", "G5"], "C": ["G4", "C5", "E5", "G5"], "D": ["F#4", "A4", "D5", "F#5"]}
LEAD = ["D5", "E5", "G5", "A5", "G5", "E5", "D5", "B4", "D5", "E5", "G5", "B5", "A5", "G5", "E5", "G5"]
LEVEL = {"intro": 0.85, "premise": 0.7, "demo": 0.4, "journey": 1.0, "features": 0.75, "outro": 0.9}
sections = spec["sections"]


def section_at(t):
    name = sections[0][1]
    for start, label in sections:
        if t >= start:
            name = label
    return name


bar_index = 0
t = 0.0
while t < TOTAL - 0.2:
    sec = section_at(t)
    gain = LEVEL[sec]
    root, chord = PROG[bar_index % 4]
    tones = CHORDS[chord]
    # Boom-chick: bass on 1 and 3 (root, then fifth), a short chord on 2 and 4.
    if not (sec == "intro" and t < 2.5):
        for k, name in enumerate([root, None, FIFTH[chord], None]):
            at = t + k * BEAT
            if name:
                sig = triangle(note_hz(name), BEAT * 0.8) * env(int(BEAT * 0.8 * SR), decay=0.3, sustain=0.4, release=0.04)
                add(music, at, sig, 0.26 * gain)
            else:
                sig = sum(square(note_hz(n), BEAT * 0.3, 0.25) for n in tones)
                add(music, at, lowpass(sig * env(int(BEAT * 0.3 * SR), decay=0.06, release=0.02), 0.22), 0.035 * gain, pan=0.2)
    # Banjo roll in the bright sections.
    if sec in ("intro", "premise", "features", "journey", "outro"):
        notes = ROLL[chord]
        for k in range(8):
            name = notes[[0, 1, 2, 3, 2, 1, 2, 3][k]]
            add(music, t + k * BEAT / 2, pluck(name, BEAT * 0.9, 0.45), 0.12 * gain, pan=-0.35 if k % 2 else -0.15)
    # Drums: a shuffle with brushes; woodblock hoofbeats in the intro.
    if sec == "intro":
        for k in range(4):
            add(music, t + k * BEAT, CLIP if k % 2 == 0 else CLOP, 0.18, pan=0.3)
    else:
        for k in range(8):
            at = t + k * BEAT / 2 + (BEAT * 0.08 if k % 2 else 0)
            add(music, at, HAT, 0.07 * gain, pan=0.35)
        for k in (0, 2):
            add(music, t + k * BEAT, KICK, 0.55 * gain)
        for k in (1, 3):
            add(music, t + k * BEAT, BRUSH, 0.22 * gain, pan=-0.1)
    # Lead on the trail.
    if sec in ("journey", "outro"):
        for k in range(8):
            name = LEAD[(bar_index * 8 + k) % len(LEAD)]
            dur = BEAT / 2
            sig = square(note_hz(name), dur, 0.125) * env(int(dur * SR), decay=0.2, sustain=0.3, release=0.03)
            add(music, t + k * BEAT / 2, sig, 0.06, pan=0.15)
    t += BAR
    bar_index += 1

end = TOTAL - 6.2
for n in ["G2", "G3", "D4", "G4", "B4", "D5"]:
    add(music, end, lowpass(square(note_hz(n), 4.5, 0.5) * env(int(4.5 * SR), decay=1.4, release=0.4), 0.18), 0.05)
for k, n in enumerate(["G4", "B4", "D5", "G5", "B5", "D6"]):
    add(music, end + k * 0.06, pluck(n, 2.0, 0.4), 0.16)
add(music, end, CRASH, 0.22)
add(music, end, KICK, 0.8)

# ── Sound effects ──────────────────────────────────────────────────────────


def tone_seq(notes, step, duty=0.5, decay=0.12, last_hold=0.0):
    total = step * len(notes) + last_hold + 0.3
    out = np.zeros(int(total * SR))
    for i, n in enumerate(notes):
        dur = step + (last_hold if i == len(notes) - 1 else 0) + 0.05
        sig = square(note_hz(n), dur, duty) * env(int(dur * SR), decay=decay if i < len(notes) - 1 else 0.35, release=0.03)
        j = int(i * step * SR)
        out[j:j + len(sig)] += sig[: len(out) - j]
    return out


def whoosh(dur=0.5):
    t = tvec(dur)
    return lowpass(noise(dur), 0.08) * np.sin(np.pi * t / dur) ** 2 * 3.0


def mod_sound(character, name):
    """One of the mod's own sounds, resampled to the video's rate."""
    with wave.open(os.path.join(SFX_DIR, character, f"{name}.wav")) as w:
        rate = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16) / 32768
    x = np.arange(int(len(data) * SR / rate)) * rate / SR
    return np.interp(x, np.arange(len(data)), data)


SFX = {
    "pop": (tone_seq(["G5", "D6"], 0.05, 0.25, decay=0.05), 0.12),
    "wipe": (whoosh(0.55), 0.3),
    "blip": (tone_seq(["E6"], 0.04, 0.25, decay=0.03), 0.07),
    "tick": (HP_NOISE[:240] * np.exp(-np.arange(240) / 40), 0.25),
    "key": (HP_NOISE[:300] * np.exp(-np.arange(300) / 50), 0.16),
    "key_big": (HP_NOISE[:600] * np.exp(-np.arange(600) / 90) + 0.3 * square(1800, 0.0125)[:600] * np.exp(-np.arange(600) / 60), 0.35),
    "coin_small": (pluck("B5", 0.25, 0.3), 0.18),
    "rank": (tone_seq(["D6", "G6"], 0.06, 0.25, decay=0.08, last_hold=0.12), 0.1),
    "fanfare_end": (tone_seq(["D5", "G5", "B5", "D6"], 0.08, 0.5, decay=0.08, last_hold=1.0), 0.12),
}
for character in ("locki", "cappl"):
    for name in ("hello", "coin", "buy", "stage", "fanfare", "levelup"):
        SFX[f"{name}_{character}"] = (mod_sound(character, name), 5.0 if name == "hello" else 3.2)

pan_cycle = [-0.3, 0.2, -0.1, 0.35, 0.0]
for k, (at, name) in enumerate(spec["events"]):
    sig, gain = SFX[name]
    is_key = name.startswith("key")
    add(sfx, at, sig, gain * (RNG.uniform(0.8, 1.15) if is_key else 1.0), pan=pan_cycle[k % len(pan_cycle)] if is_key else 0.0)
    if name.startswith(("stage", "fanfare")):
        add(sfx, at, CRASH, 0.14)

echo = np.zeros_like(sfx)
d = int(0.17 * SR)
echo[d:] = sfx[:-d] * 0.25
echo[2 * d:] += sfx[: -2 * d] * 0.1

# Duck the music under the effects.
energy = np.abs(sfx).mean(axis=1)
duck = 1 - 0.35 * np.clip(lowpass(energy, 0.0006) * 6, 0, 1)
mix = music * duck[:, None] + sfx + echo
mix = np.tanh(mix * 1.1)
mix /= max(1e-6, np.abs(mix).max()) / 0.89
fade = np.ones(len(mix))
tail = int(1.2 * SR)
fade[-tail:] = np.linspace(1, 0, tail)
mix *= fade[:, None]

os.makedirs(OUT, exist_ok=True)
pcm = (mix * 32767).astype(np.int16)
with wave.open(os.path.join(OUT, "audio.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio", round(len(mix) / SR, 1), "s")
