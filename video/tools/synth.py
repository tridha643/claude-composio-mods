# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""Synthesizes every sound in the video (no samples, nothing downloaded) into media/.

    uv run tools/synth.py

The music follows the scene beats in src/lib.rs (`BPM`, `STORY`); keep the two in sync.
"""
from pathlib import Path
import wave

import numpy as np

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM
# Scene cues in beats, from STORY in src/lib.rs: the mods start on 21, install on 89, the
# outro on 97, the video ends on 105. Bars start on beat 1 so every section lands on a downbeat.
MODS, INSTALL, OUTRO, END = 21, 89, 97, 105
BAR0 = 1
OUT = Path(__file__).resolve().parent.parent / "media"
rng = np.random.default_rng(7)


def t_of(beat):
    return beat * BEAT


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def write(name, x, peak_db=-3.0):
    """16-bit mono WAV, peak-normalized unless `peak_db` is None."""
    x = np.asarray(x, dtype=np.float64)
    if peak_db is not None:
        x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def onepole(x, cutoff):
    """One-pole low-pass; `cutoff` may be an array (Hz per sample)."""
    a = np.exp(-2 * np.pi * np.broadcast_to(cutoff, x.shape) / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def saw(freq, n, harmonics=10, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, harmonics + 1):
        if freq * h > 9000:
            break
        out += np.sin(2 * np.pi * freq * h * t + phase * h) / h
    return out


def add(buf, start_s, x):
    i = int(start_s * SR)
    if i >= len(buf):
        return
    x = x[: len(buf) - i]
    buf[i : i + len(x)] += x


def env(n, attack, release_tau):
    t = np.arange(n) / SR
    return np.minimum(t / max(attack, 1e-4), 1.0) * np.exp(-t / release_tau)


# --- music ---------------------------------------------------------------------------------

total = t_of(END)
N = int(total * SR)
pad = np.zeros(N)
arp = np.zeros(N)
bass = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)

# Am7, Fmaj7, Cmaj7, G6: warm and unresolved until the outro lands on Cmaj9.
CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]]
ROOTS = [45, 41, 48, 43]
BAR = 4 * BEAT


def chord_at(beat):
    return (int((beat - BAR0) // 4)) % 4


# Pad: one chord per bar (and the pickup), slow attack, overlapping release.
bars = [(-1, BAR0)] + [(b, BAR0 + 4 * b) for b in range((OUTRO - BAR0) // 4)]
for b, beat in bars:
    idx = b % 4 if b >= 0 else 3
    start = t_of(max(beat - (1 if b < 0 else 0), 0))
    dur = (t_of(BAR0) if b < 0 else BAR) + 1.2
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.minimum(t / 0.35, 1.0) * np.clip((dur - t) / 1.2, 0, 1)
    voice = sum(saw(midi(m), n, 8) * 0.5 + saw(midi(m) * 1.004, n, 8, 1.3) * 0.5 for m in CHORDS[idx])
    add(pad, start, voice * e)
# Outro: Cmaj9 rings out.
n = int((total - t_of(OUTRO)) * SR)
t = np.arange(n) / SR
e = np.minimum(t / 0.2, 1.0) * np.exp(-t / 3.5)
add(pad, t_of(OUTRO), sum(saw(midi(m), n, 8) + saw(midi(m) * 1.004, n, 8, 1.1) for m in [48, 55, 59, 62, 64]) * 0.6 * e)
pad = onepole(pad, 1400.0)

# Arp: 16ths over the mods and install, opening up (brighter) towards the CTA.
beat = MODS
step = 0
while beat < OUTRO:
    notes = CHORDS[chord_at(beat)]
    seq = [notes[0] + 12, notes[2] + 12, notes[1] + 12, notes[3] + 12, notes[2] + 24, notes[3] + 12, notes[1] + 12, notes[2] + 12]
    m = seq[step % 8]
    progress = (beat - MODS) / (INSTALL - MODS)
    bright = 3 + int(5 * min(progress, 1.0)) + (3 if beat >= INSTALL else 0)
    n = int(0.3 * SR)
    note = saw(midi(m), n, bright) * env(n, 0.003, 0.09)
    accent = 1.0 if step % 4 == 0 else 0.7
    add(arp, t_of(beat), note * accent * (0.55 + 0.45 * min(progress, 1.0)))
    beat += 0.25
    step += 1
# Dotted-eighth echo gives the arp some space.
d = int(0.75 * BEAT * SR)
echo = np.zeros(N)
echo[d:] += arp[:-d] * 0.35
echo[2 * d :] += arp[: -2 * d] * 0.15
arp = arp + onepole(echo, 2500.0)

# Bass: eighths on the root from the mods on.
beat = MODS
while beat < OUTRO:
    r = ROOTS[chord_at(beat)] - 12
    n = int(0.24 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * midi(r) * t) + 0.35 * np.sin(2 * np.pi * midi(r) * 2 * t)
    add(bass, t_of(beat), tone * env(n, 0.005, 0.12) * (1.0 if beat % 1 == 0 else 0.75))
    beat += 0.5
# Outro: one long low C.
n = int(3.0 * SR)
t = np.arange(n) / SR
add(bass, t_of(OUTRO), np.sin(2 * np.pi * midi(36) * t) * env(n, 0.01, 1.2))


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 85 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) + rng.normal(0, 1, n) * np.exp(-t / 0.002) * 0.15


def hat(open_=False):
    n = int((0.12 if open_ else 0.04) * SR)
    t = np.arange(n) / SR
    x = rng.normal(0, 1, n)
    x = x - onepole(x, 7000.0)
    return x * np.exp(-t / (0.05 if open_ else 0.012))


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = rng.normal(0, 1, n)
    x = onepole(x - onepole(x, 900.0), 5000.0)
    e = np.exp(-t / 0.09)
    for k in (0.0, 0.011, 0.022):
        e += np.where(t >= k, np.exp(-(t - k) / 0.004), 0) * 0.6
    return x * e


K, H, HO, C = kick(), hat(), hat(True), clap()
kick_times = []
for b in np.arange(0, OUTRO, 0.25):
    in_mods = b >= MODS
    if in_mods and b % 1 == 0 and not (INSTALL - 1 <= b < INSTALL):
        add(drums, t_of(b), K)
        kick_times.append(t_of(b))
    if in_mods and b >= MODS + 20 and b % 2 == 1:
        add(drums, t_of(b), C * 0.5)
    if b >= 4 and b % 0.5 == 0 and b % 1 != 0:
        add(drums, t_of(b), H * (0.35 if b < MODS else 0.5))
    if b >= MODS + 30 and b % 0.5 != 0:
        add(drums, t_of(b), H * 0.22)
    if b >= INSTALL and b % 1 == 0.5:
        add(drums, t_of(b), HO * 0.25)
# A last kick and crash-like swell on the outro downbeat.
add(drums, t_of(OUTRO), K)
kick_times.append(t_of(OUTRO))
n = int(2.0 * SR)
tt = np.arange(n) / SR
x = rng.normal(0, 1, n)
add(fx, t_of(OUTRO), (x - onepole(x, 3000.0)) * np.exp(-tt / 0.6) * 0.18)

# Riser into the install CTA: filtered noise opening over two bars plus a rising tone.
rs, re_ = t_of(INSTALL - 4), t_of(INSTALL)
n = int((re_ - rs) * SR)
tt = np.arange(n) / SR
p = tt / (re_ - rs)
noise = onepole(rng.normal(0, 1, n), 300 + 7000 * p**2)
tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * p**2) / SR)
add(fx, rs, (noise * 0.6 + tone * 0.15) * p**2)

# Sidechain pumping from the kick on pad, arp and bass.
duck = np.ones(N)
tt = np.arange(int(0.3 * SR)) / SR
shape = 1 - 0.45 * np.exp(-tt / 0.09)
for kt in kick_times:
    i = int(kt * SR)
    seg = shape[: N - i]
    duck[i : i + len(seg)] = np.minimum(duck[i : i + len(seg)], seg)


def norm(x):
    return x / (np.sqrt(np.mean(x[x != 0] ** 2)) + 1e-9)


# Arrangement levels: the pad carries the intro and swells into the CTA.
time = np.arange(N) / SR
pad_lvl = np.interp(time, [0, t_of(MODS), t_of(INSTALL), t_of(OUTRO), total], [0.30, 0.22, 0.26, 0.32, 0.32])
mix = (
    norm(pad) * pad_lvl * duck
    + norm(arp) * 0.13 * duck
    + norm(bass) * 0.20 * duck
    + norm(drums) * 0.20
    + fx * 0.6
)
# Fade in over the first half second and out over the last two.
mix *= np.clip(time / 0.5, 0.15, 1.0) * np.clip((total - time) / 2.0, 0.0, 1.0)
mix = np.tanh(mix * 1.6) / 1.6
rms_db = 20 * np.log10(np.sqrt(np.mean(mix**2)))
# Trimmed to about -16 dBFS RMS; the track gain in src/lib.rs sets the final loudness.
write("music.wav", mix * 10 ** ((-16 - rms_db) / 20), peak_db=None)

# --- sound effects -------------------------------------------------------------------------

# Whoosh: noise through an opening then closing low-pass, peaking at 0.3 s.
n = int(0.7 * SR)
tt = np.arange(n) / SR
shape = np.exp(-(((tt - 0.3) / 0.13) ** 2))
write("whoosh.wav", onepole(rng.normal(0, 1, n), 200 + 3500 * shape) * shape)

# Click: a short bright tick plus a soft body.
n = int(0.05 * SR)
tt = np.arange(n) / SR
write("click.wav", np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt / 0.004) + 0.6 * np.sin(2 * np.pi * 700 * tt) * np.exp(-tt / 0.012))

# Chime: two soft bell notes (E6 then B6), a fifth apart.
n = int(0.9 * SR)
x = np.zeros(n)
for k, (f0, at) in enumerate([(midi(88), 0.0), (midi(95), 0.07)]):
    i = int(at * SR)
    t = np.arange(n - i) / SR
    x[i:] += (np.sin(2 * np.pi * f0 * t) + 0.25 * np.sin(2 * np.pi * f0 * 2.01 * t)) * env(n - i, 0.002, 0.28) * (1.0 if k == 0 else 0.8)
write("chime.wav", x)

# Key tick: a tiny filtered noise burst.
n = int(0.03 * SR)
tt = np.arange(n) / SR
x = rng.normal(0, 1, n)
write("key.wav", (x - onepole(x, 2000.0)) * np.exp(-tt / 0.005))
print(f"music {total:.2f}s, rms {rms_db:.1f} dBFS before trim")
