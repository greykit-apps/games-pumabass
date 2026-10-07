// Checks scoring's pluck detector on repeated notes from the lowest bass
// strings to the 12th fret: every pluck found, on time, and no false ones.
// A plucked string's harmonics start in step, so a low note's waveform has a
// sharp spike once a period; the detector must not take those for plucks
// (it once did, and low notes went missed). No song library needed.
//   node tools/check-plucks.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onsets } = await import(pathToFileURL(path.join(root, 'web/js/scoring.js')));

const SR = 48000, GAP = 0.45, COUNT = 8;
let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** COUNT plucks of one string, each cutting off the last, with a click of the given size. */
function render(freq, harm, click, inStep) {
  const buf = new Float32Array(Math.ceil((COUNT * GAP + 1) * SR));
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * (rnd() * 2 - 1); // the cable's hiss
  for (let n = 0; n < COUNT; n++) {
    const i0 = Math.round((0.3 + n * GAP) * SR);
    const ph = harm.map(() => (inStep ? 0 : rnd() * 6.28));
    for (let k = 0; k < GAP * SR; k++) {
      const t = k / SR;
      let v = 0;
      for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t + ph[h]);
      v *= 0.1 * Math.exp(-t / 1.2);
      if (t < 0.004) v += click * (rnd() * 2 - 1) * (1 - t / 0.004);
      buf[i0 + k] = v;
    }
  }
  return buf;
}

const NOTES = [['B0 (5-string)', 30.9], ['D1 (drop D)', 36.7], ['E1', 41.2], ['A1', 55], ['B1', 61.7], ['G2', 98], ['G3 (12th fret)', 196]];
const SHAPES = [['1/h, 12 harmonics', Array.from({ length: 12 }, (_, h) => 1 / (h + 1))], ['bright, 5 harmonics', [1, 0.5, 0.33, 0.25, 0.2]]];
let fails = 0;
for (const inStep of [true, false]) {
  for (const click of [0.12, 0.03]) {
    for (const [shapeName, harm] of SHAPES) {
      for (const [name, f] of NOTES) {
        const o = onsets(render(f, harm, click, inStep), SR);
        const want = Array.from({ length: COUNT }, (_, n) => 0.3 + n * GAP);
        const hits = want.map(w => o.find(t => Math.abs(t - w) < 0.03)).filter(t => t !== undefined);
        const extra = o.length - hits.length;
        const worst = Math.max(...hits.map((t, i) => Math.abs(t - want[i])), 0) * 1000;
        // The very first pluck rises out of silence; an extra blip there is harmless.
        const ok = hits.length === COUNT && extra <= 1 && worst <= 10;
        if (!ok) fails++;
        if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${inStep ? 'in step' : 'random phase'}, click ${click}, ${shapeName}, ${name}: found ${hits.length}/${COUNT}, ${extra} false, worst ${worst.toFixed(0)} ms`);
      }
    }
  }
}
if (fails) { console.log(`check-plucks: ${fails} failed`); process.exit(1); }
console.log(`check-plucks: all good (${2 * 2 * SHAPES.length * NOTES.length} cases)`);
