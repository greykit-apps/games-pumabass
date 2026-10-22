#!/usr/bin/env python3
# make-theme.py -- the title's theme: a bass groove, played live, made into a loop that goes round
# without a seam. Writes into web/audio/:
#
#   theme.m4a    twelve bars (48 beats) from its first downbeat, the moment after the twelfth bar
#                folded into the first so the join doesn't click (the groove comes back round to
#                its opening there); AAC, which every browser decodes
#   theme.json   its beat in seconds and how many it holds, for the painting to pulse in time
#
# web/js/title-sound.js plays it. Needs ffmpeg, and Python with numpy.
#
#   python3 tools/make-theme.py <groove.m4a>
import sys, os, json, subprocess, tempfile, wave
import numpy as np

BEATS = 48         # the loop: twelve bars, where the groove comes back round to its opening
FOLD = 0.06        # seconds of the twelfth bar's ring folded into the first beat
BPM = 111.75       # near enough to find the beats by (the take is steady: 111.8)
SR = 48000

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = os.path.join(root, 'web', 'audio')
tmp = tempfile.mkdtemp()

def decode(src, ch):
    p = os.path.join(tmp, f'{ch}.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', str(ch), '-ar', str(SR), p], check=True)
    w = wave.open(p)
    return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float).reshape(-1, ch) / 32768

x = decode(sys.argv[1], 2)
mono = x.mean(1)

# Onsets: where the spectrum jumps; then each beat found near the tempo's grid, free to slide 40 ms.
hop, n = 128, 2048
fps = SR / hop
frames = np.lib.stride_tricks.sliding_window_view(mono, n)[::hop] * np.hanning(n)
flux = np.maximum(0, np.diff(np.log1p(np.abs(np.fft.rfft(frames, axis=1)) * 10), axis=0)).sum(1)
per, strong = 60 / BPM, np.percentile(flux, 75)
t = flux[:int(2 * fps)].argmax() / fps                      # the first note
beats = []
while t < len(mono) / SR - 0.05:
    i0, i1 = max(int((t - 0.04) * fps), 0), int((t + 0.04) * fps)
    seg = flux[i0:i1]
    t = (i0 + seg.argmax()) / fps if len(seg) and seg.max() > strong else t
    beats.append(t)
    t += per
beats = np.array(beats)
if len(beats) <= BEATS: sys.exit(f'only {len(beats)} beats: the loop wants {BEATS + 1}')
# The loop's ends, on the beats' line of best fit (a live take: each beat a few ms either side).
fit = np.polyfit(np.arange(len(beats)), beats, 1)
a, b = int(round(np.polyval(fit, 0) * SR)), int(round(np.polyval(fit, BEATS) * SR))
f = int(FOLD * SR)
loop = x[a:b].copy()
ramp = np.sin(np.linspace(0, np.pi / 2, f))[:, None]         # equal power
loop[:f] = loop[:f] * ramp + x[b:b + f] * ramp[::-1]

wav = os.path.join(tmp, 'loop.wav')
w = wave.open(wav, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(loop, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
os.makedirs(out, exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
                os.path.join(out, 'theme.m4a')], check=True)
beat = (b - a) / SR / BEATS
with open(os.path.join(out, 'theme.json'), 'w') as fh:
    json.dump({'beat': round(beat, 6), 'beats': BEATS}, fh)
print(f'theme: {BEATS} beats at {60 / beat:.2f} BPM, {(b - a) / SR:.3f} s from {a / SR:.3f} s')
