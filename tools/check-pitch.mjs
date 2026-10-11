#!/usr/bin/env node
// check-pitch.mjs -- the tuner's pitch detector against synthesized notes:
// bass and guitar open strings in every Rocksmith tuning range, detuned,
// with a weak fundamental, with noise, as a decaying pluck, and drifting.
//   node tools/check-pitch.mjs
// Fails on any displayed reading more than 2 cents off (the tuner calls
// +/-3 cents in tune; ears can't tell under ~5), any octave mistake, or a
// pitch out of silence or hiss. Reports how many land over 1 cent.
import { tunerPitch as detectPitch, midiToFreq, centsBetween, noteName } from '../web/js/pitch.js';

const SR = 48000;
// The tuner's window: 16384 samples (0.34 s) for bass, which holds enough
// cycles of a low string; 8192 for guitar. web/js/input.js uses the same.
let N = 8192;
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// inharm: real strings are stiff, so overtone h sits at h*f*sqrt(1 + B*h^2), a little sharp (B ~ 1e-4 on a bass)
// drift: an offset dying away under the note, this many times the fundamental's level (a
// plucked string synthesized by Karplus-Strong keeps its burst's offset going round; rumble)
function note(f, { weakFund = false, noise = 0, decay = 0, phase = 0, inharm = 0, drift = 0 } = {}) {
  const buf = new Float32Array(N);
  // a plucked string: harmonics falling off, the 2nd stronger than the 1st on a weak fundamental
  const amps = weakFund ? [0.25, 1, 0.6, 0.4, 0.25, 0.15] : [1, 0.6, 0.35, 0.2, 0.12, 0.08];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = 0;
    amps.forEach((a, h) => { const k = h + 1; v += a * Math.sin(2 * Math.PI * f * k * Math.sqrt(1 + inharm * k * k) * t + phase * k); });
    v *= 0.3 * Math.exp(-decay * t);
    buf[i] = v + 0.3 * drift * amps[0] * Math.exp(-2 * t) + noise * rand();
  }
  return buf;
}

const cases = [];
// bass open strings from A0 (a 5-string dropped a tone) to a raised G2, guitar to E4
for (let m = 21; m <= 46; m++) cases.push({ m, range: { minFreq: 25, maxFreq: 150 }, kind: 'bass' });
for (let m = 38; m <= 66; m++) cases.push({ m, range: { minFreq: 60, maxFreq: 400 }, kind: 'guitar' });

// The tuner shows the median of its last 5 readings (web/js/tuner.js), so
// that is what has to be within 1 cent; a single reading may be off more in
// noise, and is reported, but noise moves from one reading to the next.
const READINGS = 5;
const LIMIT = 2;
let worst = 0, worstSingle = 0, fails = 0, checked = 0, overOne = 0;
for (const c of cases) {
  N = c.kind === 'bass' ? 16384 : 8192;
  for (const detune of [-37, -12, -3, 0, 4, 19, 45]) {
    for (const opts of [{}, { weakFund: true }, { noise: 0.02 }, { decay: 3, phase: 1.3 }, { weakFund: true, noise: 0.03, decay: 2 }, { inharm: 0.0002 }, { weakFund: true, inharm: 0.0004, noise: 0.02 }, { weakFund: true, drift: 5 }, { drift: -3, decay: 2 }]) {
      const f = midiToFreq(c.m) * 2 ** (detune / 1200);
      const errs = [];
      for (let k = 0; k < READINGS; k++) {
        const r = detectPitch(note(f, { ...opts, phase: (opts.phase || 0) + k * 0.7 }), SR, c.range);
        errs.push(r ? centsBetween(r.freq, f) : Infinity);
      }
      checked++;
      worstSingle = Math.max(worstSingle, ...errs.map(Math.abs));
      const err = errs.sort((a, b) => a - b)[READINGS >> 1];
      const r = { freq: f * 2 ** (err / 1200) };
      worst = Math.max(worst, Math.abs(err));
      if (Math.abs(err) > 1) overOne++;
      if (!(Math.abs(err) <= LIMIT)) {
        fails++;
        if (process.env.ALL || fails <= 10) console.log(`FAIL ${c.kind} ${noteName(c.m)} ${detune > 0 ? '+' : ''}${detune}c ${JSON.stringify(opts)}: ${r ? r.freq.toFixed(2) + ' Hz, ' + err.toFixed(1) + ' cents off' : 'no pitch'}`);
      }
    }
  }
}
// A short window (a 96 kHz sound card filling 16384 samples in 0.17 s) must
// never read worse than the first pass alone would.
{
  const f = midiToFreq(28) * 2 ** (5 / 1200);
  const short = detectPitch(note(f).subarray(0, 8192), SR, { minFreq: 25, maxFreq: 150 });
  const err = short ? Math.abs(centsBetween(short.freq, f)) : Infinity;
  if (!(err <= LIMIT)) { fails++; console.log(`FAIL short window on E1: ${err.toFixed(2)} cents off`); }
}

// silence and noise must give no pitch at all
N = 16384;
const quiet = detectPitch(new Float32Array(N), SR, { minFreq: 25, maxFreq: 150 });
const hiss = detectPitch(Float32Array.from({ length: N }, () => 0.1 * rand()), SR, { minFreq: 25, maxFreq: 150 });
if (quiet || hiss) { fails++; console.log(`FAIL silence/noise gave a pitch: ${JSON.stringify({ quiet, hiss })}`); }

console.log(`${checked} notes checked (median of ${READINGS} readings each): ${checked - overOne} within 1 cent; worst ${worst === Infinity ? 'no pitch' : worst.toFixed(2) + ' cents'}; worst single reading ${worstSingle.toFixed(2)} cents; silence and noise: ${quiet || hiss ? 'pitched (bad)' : 'no pitch'}`);
if (fails) { console.log(`check-pitch: ${fails} FAILED`); process.exit(1); }
console.log(`check-pitch: every displayed reading within ${LIMIT} cents`);
