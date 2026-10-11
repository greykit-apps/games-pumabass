// The demo songs' instruments (demos.js): a plucked string, drums, a filter, and a
// WAV file to put them in. Plain JavaScript, no Web Audio, so Node can check the
// songs and render them (tools/check-demo.mjs).

export const hz = midi => 440 * 2 ** ((midi - 69) / 12);

/* The same noise every time, so a demo always sounds the same. */
export function noise(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/*
 * A plucked string (Karplus-Strong): a burst of noise going round a delay line one
 * period long, a little duller each time round. The period follows freqAt(seconds
 * since the pluck), so slides and bends glide. It rings for dur, then fades in release.
 */
export function pluck(out, sr, t0, dur, freqAt, { amp = 0.5, bright = 0.5, t60 = 3, seed = 1, release = 0.04 } = {}) {
  const N = 1 << Math.ceil(Math.log2(sr / 25 + 4)), mask = N - 1;
  const ring = new Float32Array(N), rand = noise(seed);
  const burst = sr / freqAt(0), smooth = 0.08 + 0.85 * bright;
  const i0 = Math.round(t0 * sr), held = Math.round(dur * sr), n = held + Math.round(release * sr);
  let lp = 0;
  for (let i = 0, w = N; i < n && i0 + i < out.length; i++, w++) {
    const f = freqAt(i / sr), rp = w - (sr / f - 0.5); // the loop's averaging adds half a sample
    const k = Math.floor(rp), fr = rp - k;
    const a = ring[(k - 1) & mask], b = ring[k & mask], c = ring[(k + 1) & mask];
    let x = 0;
    if (i < burst) { lp += smooth * (rand() - lp); x = lp; }
    const y = x + 10 ** (-3 / (f * t60)) * 0.5 * (a + (b - a) * fr + b + (c - b) * fr);
    ring[w & mask] = y;
    const env = i < held ? 1 : 1 - (i - held) / (n - held);
    out[i0 + i] += amp * y * env;
  }
}

/* A one-pole low-pass, in place. */
export function lowpass(buf, sr, cutoff) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < buf.length; i++) buf[i] = y += k * (buf[i] - y);
}

/* Drums, each written into out at t. */
export function kick(out, sr, t, amp) {
  const rand = noise(7);
  let ph = 0;
  for (let i = 0, n = 0.45 * sr, i0 = Math.round(t * sr); i < n && i0 + i < out.length; i++) {
    const tr = i / sr;
    ph += (2 * Math.PI * (44 + 90 * Math.exp(-tr / 0.035))) / sr;
    out[i0 + i] += amp * (Math.sin(ph) * Math.exp(-tr / 0.2) + 0.25 * rand() * Math.exp(-tr / 0.004));
  }
}
export function snare(out, sr, t, amp, seed) {
  const rand = noise(seed);
  let prev = 0;
  for (let i = 0, n = 0.3 * sr, i0 = Math.round(t * sr); i < n && i0 + i < out.length; i++) {
    const tr = i / sr, r = rand(), hp = r - prev; prev = r;
    out[i0 + i] += amp * (0.5 * Math.sin(2 * Math.PI * 185 * tr) * Math.exp(-tr / 0.06) + 0.7 * hp * Math.exp(-tr / 0.11));
  }
}
export function metal(out, sr, t, amp, decay, seed) { // hi-hat (short decay), crash (long), sticks
  const rand = noise(seed);
  let p1 = 0, p2 = 0;
  for (let i = 0, n = Math.min(6 * decay, 3) * sr, i0 = Math.round(t * sr); i < n && i0 + i < out.length; i++) {
    const r = rand(), h1 = r - p1; p1 = r;
    const h2 = h1 - p2; p2 = h1;
    out[i0 + i] += amp * h2 * Math.exp(-i / sr / decay);
  }
}

/** Audio ({ sr, left, right }) as a 16-bit stereo WAV file. */
export function wav({ sr, left, right }) {
  const n = left.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), true);
    v.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), true);
  }
  return buf;
}
