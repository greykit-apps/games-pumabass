// Pitch detection for the tuner: YIN (de Cheveigné & Kawahara, 2002), which
// holds up well on bass, where the fundamental is often quieter than its
// second harmonic. Plain functions, no browser APIs, so Node can test them.

/**
 * The tuner's reading: a first pass finds the pitch, then a second measures
 * the fundamental alone. Real strings are stiff, so their overtones run a
 * little sharp, and a period found from the whole sound drifts a few cents
 * sharp with them; on a low bass string with a quiet fundamental, up to five.
 * Filtering the overtones away and measuring again follows the fundamental,
 * as a tuner should. Same arguments and result as detectPitch.
 */
export function tunerPitch(buf, sampleRate, range = {}) {
  const rough = detectPitch(buf, sampleRate, range);
  if (!rough) return null;
  // A 12th-order low-pass (six Butterworth stages) at 1.3 x the pitch: the
  // second harmonic comes out ~170x quieter, so even a bass with a quiet
  // fundamental reads the fundamental.
  let y = Float32Array.from(buf);
  for (let k = 0; k < 6; k++) y = lowpass(y, sampleRate, rough.freq * 1.3);
  // Skip the filter's first few periods while it settles, and only trust the
  // second pass with enough periods left to measure: on a short window it
  // would be worse than the first.
  const period = sampleRate / rough.freq;
  const settle = Math.floor(period * 3), span = Math.round(period);
  if ((y.length - settle - span) / period < 5) return rough;
  // The low-pass keeps whatever is slower than the pitch too: an offset dying
  // away, rumble. Under a quiet fundamental that drift can be the bigger part,
  // and the period found leans on it, up to 40 cents sharp on a low string.
  // Taking away the average over one period removes it and leaves the pitch
  // alone. (A high-pass filter would ring on for periods, and misread itself.)
  y = withoutDrift(y.subarray(settle), span);
  // The search is narrow now, so it can afford many more samples per period:
  // that is what reads to a fraction of a cent.
  const fine = detectPitch(y, sampleRate, { minFreq: rough.freq / 1.12, maxFreq: rough.freq * 1.12, threshold: 0.2, perPeriod: 150 });
  return fine && Math.abs(1200 * Math.log2(fine.freq / rough.freq)) < 50 ? { freq: fine.freq, clarity: rough.clarity } : rough;
}

// x less its moving average over span samples, each sample against the span
// around it: span - 1 samples shorter than x.
function withoutDrift(x, span) {
  const y = new Float32Array(x.length - span + 1), mid = span >> 1;
  let sum = 0;
  for (let i = 0; i < span; i++) sum += x[i];
  for (let i = 0; i < y.length; i++) {
    y[i] = x[i + mid] - sum / span;
    if (i + span < x.length) sum += x[i + span] - x[i];
  }
  return y;
}

// One second-order Butterworth low-pass stage (RBJ biquad).
function lowpass(x, sampleRate, fc) {
  const w = (2 * Math.PI * fc) / sampleRate, cw = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0, a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * The fundamental frequency of a buffer of samples, or null when there is no
 * clear pitch (silence, noise, a string still settling).
 *   minFreq / maxFreq: the range to look in. Narrow it to the instrument: it
 *   decides how far the signal can be downsampled, and so how much work this is.
 * Returns { freq, clarity } (clarity 0..1, higher is a cleaner period).
 */
export function detectPitch(buf, sampleRate, { minFreq = 25, maxFreq = 500, threshold = 0.12, perPeriod = 30 } = {}) {
  // Downsample, keeping at least perPeriod samples per period of the highest
  // pitch wanted. A box average is a crude low-pass, but it is all the
  // periodicity search needs.
  const step = Math.max(1, Math.floor(sampleRate / (maxFreq * perPeriod)));
  const n = Math.floor(buf.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < step; k++) sum += buf[i * step + k];
    x[i] = sum / step;
  }
  const sr = sampleRate / step;
  const maxLag = Math.min(Math.ceil(sr / minFreq), n >> 1);
  const minLag = Math.max(2, Math.floor(sr / maxFreq));
  const W = n - maxLag;
  if (maxLag <= minLag + 2 || W < maxLag) return null;

  // Difference function and its cumulative-mean normalisation.
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; sum += v * v; }
    d[tau] = sum;
  }
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // The first dip under the threshold, followed down to its bottom; failing
  // that, the deepest dip, if it is deep enough to mean anything.
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minLag;
    for (let t = minLag + 1; t <= maxLag; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    tau = best;
  }
  if (tau <= minLag || tau >= maxLag) return null;

  // Parabolic interpolation for the period between samples.
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (a - c) / (2 * den) : 0;
  const period = (tau + Math.max(-1, Math.min(1, shift))) * step;
  return { freq: sampleRate / period, clarity: Math.max(0, Math.min(1, 1 - b)) };
}

/** Root-mean-square level of a buffer, in dB full scale (-Infinity for silence). */
export function levelDb(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return 10 * Math.log10(sum / buf.length);
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);
export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
export const noteName = m => NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export const centsBetween = (f, target) => 1200 * Math.log2(f / target);
