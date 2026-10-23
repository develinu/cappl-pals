#!/usr/bin/env python3
"""Synthesize every character's sound effects into mod/assets/sfx/<character>/.

Usage: python3 tools/make_sfx.py   (needs numpy)

Each character has a voice of its own: LOCKI is bright square-wave chiptune with a
harmonica and little yips; CAPPL is a plucked banjo (Karplus-Strong), a soft hum
and hoof clops. All sounds are 22.05 kHz mono 16-bit, levelled by their loudest
50 ms window: "normal" near a chat notification, "quiet" near the Windows Ding.
"""

import os
import wave

import numpy as np

SR = 22050
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mod", "assets", "sfx"))
RNG = np.random.default_rng(7)


def hz(name):
    steps = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440.0 * 2 ** ((steps[name[:-1]] + (int(name[-1]) - 4) * 12) / 12)


def t_of(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, attack=0.004, decay=0.12, release=0.02):
    t = np.arange(n) / SR
    return np.clip(t / attack, 0, 1) * np.exp(-t / decay) * np.clip((n / SR - t) / release, 0, 1)


def lowpass(x, k):
    """One-pole low-pass: y[n] = k x[n] + (1 - k) y[n-1]."""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = k * v + (1 - k) * acc
        y[i] = acc
    return y


def highpass(x):
    return x - lowpass(x, 0.15)


def mix(*parts):
    out = np.zeros(max(len(p) for p in parts))
    for p in parts:
        out[: len(p)] += p
    return out


def pad(x, before):
    return np.concatenate([np.zeros(int(before * SR)), x])


def seq(notes, step, voice, tail=0.25, **kw):
    """Notes one after another; the last rings `tail` seconds longer."""
    parts = []
    for i, n in enumerate(notes):
        last = i == len(notes) - 1
        parts.append(pad(voice(n, step + (tail if last else 0), last=last, **kw), i * step))
    return mix(*parts)


# ── LOCKI: square waves, harmonica, yips ─────────────────────────────────────


def square(freq, dur, duty=0.5):
    t = t_of(dur)
    f = freq if np.isscalar(freq) else freq[: len(t)]
    phase = np.cumsum(np.full(len(t), f) / SR) if np.isscalar(f) else np.cumsum(f / SR)
    return np.where(phase % 1.0 < duty, 1.0, -1.0)


def chip(note, dur, last=False, duty=0.25, decay=0.06):
    sig = square(hz(note), dur, duty)
    return lowpass(sig * env(len(sig), decay=decay * (3 if last else 1)), 0.55)


def yip(start, end, dur=0.09):
    """A quick upward or downward pitch flick, like a small bark."""
    n = int(dur * SR)
    f = np.geomspace(start, end, n)
    sig = square(f, dur, 0.3) * env(n, attack=0.003, decay=dur / 2.5)
    return lowpass(sig, 0.5)


def harmonica(notes, dur):
    """Reedy chord: narrow pulse waves with a gentle vibrato and a breathy attack."""
    t = t_of(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t)
    sig = sum(square(hz(n) * vib, dur, 0.18) for n in notes) / len(notes)
    breath = highpass(RNG.uniform(-1, 1, len(t))) * np.exp(-t / 0.03) * 0.3
    shape = np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.12, 0, 1)
    return lowpass(sig * shape + breath, 0.35)


def sparkle(dur=0.5, count=6, notes=("E7", "G7", "B7", "D7")):
    out = np.zeros(int(dur * SR))
    for k in range(count):
        sig = square(hz(notes[k % len(notes)]), 0.05, 0.25) * env(int(0.05 * SR), decay=0.02)
        j = int(RNG.uniform(0, dur - 0.06) * SR)
        out[j:j + len(sig)] += sig * 0.5
    return out


def jingle(dur=0.35):
    """Spur rowels: a few bright metallic ticks."""
    out = np.zeros(int(dur * SR))
    for k, at in enumerate((0.0, 0.05, 0.09, 0.16)):
        n = int(0.06 * SR)
        t = np.arange(n) / SR
        ring = sum(np.sin(2 * np.pi * f * t) for f in (3150, 4720, 6200)) / 3
        tick = (ring + highpass(RNG.uniform(-1, 1, n)) * 0.6) * np.exp(-t / 0.018)
        j = int(at * SR)
        out[j:j + n] += tick * (1 - k * 0.15)
    return out


def noise_hit(dur, decay):
    n = RNG.uniform(-1, 1, int(dur * SR))
    return highpass(n) * np.exp(-np.arange(len(n)) / SR / decay)


def chomp():
    """One bite: a short crunchy burst."""
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return lowpass(RNG.uniform(-1, 1, n), 0.35) * np.exp(-t / 0.02) * 1.4


def chomps(count=3, gap=0.15):
    return mix(*[pad(chomp(), i * gap) for i in range(count)])


def creak(dur=0.35):
    """A chest lid: a low wooden creak that rises."""
    n = int(dur * SR)
    f = np.geomspace(110, 260, n)
    t = np.arange(n) / SR
    wobble = 1 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * t))
    return lowpass(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * wobble, 0.15) * np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.05, 0, 1) * 0.5


def coins(count=6, dur=0.5, notes=("E6", "B6", "G6", "D7", "A6", "E7")):
    out = np.zeros(int(dur * SR))
    for k in range(count):
        sig = square(hz(notes[k % len(notes)]), 0.07, 0.25) * env(int(0.07 * SR), decay=0.03)
        j = int((k / count) * (dur - 0.08) * SR)
        out[j:j + len(sig)] += sig * 0.6
    return lowpass(out, 0.6)


def locki():
    return {
        "coin": mix(chip("E6", 0.06), pad(yip(1300, 1780, 0.16), 0.06)),
        "comeback": seq(["C6", "E6", "G6", "C7"], 0.055, chip, tail=0.3),
        "fanfare": mix(harmonica(["C5", "E5", "G5"], 0.45), pad(seq(["G5", "C6", "E6", "G6"], 0.07, chip, tail=0.4), 0.3),
                       pad(sparkle(0.5, 5), 0.5) * 0.6),
        "levelup": mix(seq(["C5", "E5", "G5", "C6", "E6", "G6", "C7"], 0.045, chip, tail=0.5), pad(sparkle(0.7, 8), 0.3) * 0.7),
        "stage": mix(harmonica(["A4", "C#5", "E5"], 0.5), pad(harmonica(["D5", "F#5", "A5"], 0.6), 0.45),
                     pad(seq(["A5", "C#6", "E6", "A6"], 0.06, chip, tail=0.6), 0.95), pad(noise_hit(1.1, 0.35), 0.95) * 0.2,
                     pad(sparkle(0.8, 10), 1.0) * 0.6),
        "buy": mix(jingle(0.35), pad(seq(["E6", "G6", "C7"], 0.05, chip, tail=0.25), 0.12) * 0.8),
        "equip": seq(["G5", "D6"], 0.05, chip, tail=0.12),
        "error": mix(yip(700, 520, 0.12), pad(yip(560, 380, 0.2), 0.11)),
        "open": yip(800, 1500, 0.11),
        "close": yip(1400, 750, 0.11),
        "hello": mix(yip(1150, 820, 0.1), pad(yip(1250, 880, 0.13), 0.14), pad(sparkle(0.3, 3), 0.25) * 0.4),
    }


# ── CAPPL: banjo, hum, hooves ────────────────────────────────────────────────


def pluck(note, dur, last=False, bright=0.5, gain=1.0):
    """Karplus-Strong plucked string with a short banjo-like twang."""
    freq = hz(note) if isinstance(note, str) else note
    n = int(dur * SR)
    period = max(2, int(SR / freq))
    buf = RNG.uniform(-1, 1, period)
    out = np.empty(n)
    decay = 0.996 if last else 0.992
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = decay * (bright * buf[j] + (1 - bright) * buf[(j + 1) % period])
    twang = highpass(out) * 0.35
    return (out + twang) * gain * np.clip((dur - np.arange(n) / SR) / 0.02, 0, 1)


def strum(notes, dur, gap=0.018):
    return mix(*[pad(pluck(n, dur - i * gap, last=True), i * gap) for i, n in enumerate(notes)])


def triangle(freq, dur):
    t = t_of(dur)
    f = np.full(len(t), freq) if np.isscalar(freq) else freq[: len(t)]
    phase = np.cumsum(f / SR)
    return 2 * np.abs(2 * (phase % 1.0) - 1) - 1


def hum(notes, step):
    """A closed-mouth hum: soft triangle tones that glide into each other."""
    f = np.concatenate([np.full(int(step * SR), hz(n)) for n in notes])
    f = lowpass(f, 0.004)
    dur = len(f) / SR
    sig = triangle(f, dur) * (1 + 0.15 * np.sin(2 * np.pi * 4.5 * t_of(dur)))
    shape = np.clip(t_of(dur) / 0.04, 0, 1) * np.clip((dur - t_of(dur)) / 0.15, 0, 1)
    return lowpass(sig * shape, 0.25)


def clop(pitch):
    """A hoof on hard ground: a short resonant knock."""
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * pitch * t) * np.exp(-t / 0.012)
    click = highpass(RNG.uniform(-1, 1, n)) * np.exp(-t / 0.004) * 0.5
    return body + click


def notes_up(dur, count=5):
    return mix(*[pad(pluck(n, 0.25, bright=0.3) * 0.35, i * dur / count)
                 for i, n in enumerate(["D6", "G6", "B6", "D7", "G7"][:count])])


def cappl():
    return {
        "coin": seq(["G4", "D5"], 0.07, pluck, tail=0.3),
        "comeback": seq(["G4", "B4", "D5", "G5"], 0.065, pluck, tail=0.4),
        "fanfare": mix(strum(["G3", "D4", "G4", "B4", "D5"], 0.9), pad(seq(["D5", "G5", "B5"], 0.08, pluck, tail=0.5), 0.35),
                       lowpass(triangle(hz("G2"), 0.6), 0.3) * env(int(0.6 * SR), decay=0.3) * 0.6),
        "levelup": mix(seq(["G4", "B4", "D5", "G5", "B5", "D6", "G6"], 0.055, pluck, tail=0.5), pad(notes_up(0.4), 0.35)),
        "stage": mix(strum(["G3", "D4", "G4", "B4", "D5"], 0.6), pad(strum(["C4", "E4", "G4", "C5", "E5"], 0.6), 0.45),
                     pad(seq(["G4", "B4", "D5", "G5", "B5", "D6", "G6"], 0.05, pluck, tail=0.6), 0.9),
                     pad(lowpass(triangle(hz("G2"), 1.2), 0.3) * env(int(1.2 * SR), decay=0.5), 0.9) * 0.6,
                     pad(noise_hit(1.0, 0.3), 0.9) * 0.12),
        "buy": mix(pluck("E6", 0.4, bright=0.2), pad(pluck("B6", 0.35, bright=0.2) * 0.8, 0.07), pad(clop(1900) * 0.5, 0.0)),
        "equip": pluck("D5", 0.2),
        "error": mix(pluck("D4", 0.25), pad(pluck("A3", 0.35), 0.1), lowpass(triangle(np.geomspace(220, 140, int(0.35 * SR)), 0.35), 0.3) * 0.4),
        "open": mix(clop(520), pad(clop(700), 0.11)),
        "close": mix(clop(700), pad(clop(520), 0.11)),
        "hello": mix(hum(["G4", "B4", "D5", "B4"], 0.13), pad(pluck("G5", 0.4) * 0.5, 0.4)),
    }


# Sounds added in 0.2 (petting, treats, tricks, bounties, chests). They are made after
# the first ones so that the shared random noise of the older sounds never changes.
def locki_more():
    return {
        "pet": mix(yip(1000, 1450, 0.08), pad(yip(1100, 1550, 0.08), 0.11), pad(sparkle(0.3, 3), 0.18) * 0.35),
        "treat": mix(chomps(3), pad(yip(900, 1500, 0.14), 0.5), pad(sparkle(0.25, 2), 0.6) * 0.3),
        "trick": mix(seq(["C6", "E6", "G6", "E7"], 0.05, chip, tail=0.2), pad(sparkle(0.35, 4), 0.15) * 0.4),
        "fail": mix(chip("E5", 0.12, duty=0.5, decay=0.08), pad(yip(520, 330, 0.25), 0.12)),
        "lucky": mix(sparkle(0.5, 7), pad(seq(["E6", "G6", "B6", "E7"], 0.05, chip, tail=0.35), 0.05)),
        "quest": mix(seq(["G5", "C6", "E6", "G6"], 0.07, chip, tail=0.45), pad(jingle(0.35), 0.28) * 0.7),
        "chest": mix(creak(0.35), pad(coins(7, 0.55), 0.3), pad(sparkle(0.4, 4), 0.5) * 0.4),
    }


def cappl_more():
    return {
        "pet": mix(hum(["D5", "G5"], 0.12), pad(pluck("B5", 0.3, bright=0.3) * 0.6, 0.2)),
        "treat": mix(chomps(3, 0.17), pad(hum(["G4", "D5"], 0.13), 0.55)),
        "trick": seq(["G4", "B4", "D5", "G5", "D5", "G5"], 0.045, pluck, tail=0.3),
        "fail": mix(pluck("D4", 0.2), pad(lowpass(triangle(np.geomspace(200, 110, int(0.4 * SR)), 0.4), 0.3) * 0.6, 0.08)),
        "lucky": mix(notes_up(0.35), pad(pluck("G6", 0.5, bright=0.2) * 0.6, 0.3)),
        "quest": mix(strum(["G3", "D4", "G4", "B4"], 0.6), pad(seq(["D5", "G5"], 0.08, pluck, tail=0.4), 0.25)),
        "chest": mix(creak(0.35), pad(mix(*[pad(pluck(n, 0.25, bright=0.2) * 0.5, i * 0.06) for i, n in enumerate(["E6", "B6", "G6", "D7", "G7"])]), 0.3)),
    }


LEVELS = {"": -27.0, "quiet": -35.0}
OFFSET = {"coin": -1.0, "equip": -2.0, "open": -3.0, "close": -3.0, "error": -2.0, "hello": -1.0, "pet": -2.0,
          "trick": -1.0, "fail": -3.0, "treat": -1.0, "levelup": 1.0, "stage": 1.5, "fanfare": 0.5, "chest": 0.5}


def short_rms_db(sig):
    win = int(SR * 0.05)
    peak = max(np.sqrt(np.mean(sig[i:i + win] ** 2)) for i in range(0, max(1, len(sig) - win), win))
    return 20 * np.log10(peak + 1e-12)


def dc_block(x, r=0.995):
    """Removes the DC offset narrow pulse waves and plucks leave behind."""
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = v - prev_x + r * prev_y
        prev_x = v
        y[i] = prev_y
    return y


def write(folder, name, sig, target_db):
    sig = dc_block(sig)
    sig = sig * 10 ** ((target_db - short_rms_db(sig)) / 20)
    fade = np.ones(len(sig))
    k = int(0.01 * SR)
    fade[-k:] = np.linspace(1, 0, k)
    pcm = (np.clip(sig * fade, -1, 1) * 32767).astype(np.int16)
    os.makedirs(folder, exist_ok=True)
    with wave.open(os.path.join(folder, f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    voices = {"locki": locki(), "cappl": cappl()}
    voices["locki"].update(locki_more())
    voices["cappl"].update(cappl_more())
    for character, sounds in voices.items():
        for sub, level in LEVELS.items():
            for name, sig in sounds.items():
                write(os.path.join(OUT, character, sub), name, sig, level + OFFSET.get(name, 0.0))
        print(character, " ".join(f"{name}:{len(sig) / SR:.2f}s" for name, sig in sounds.items()))
