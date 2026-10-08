// Checks the sync test: the swinging bar reaches a side on every tick, and the
// play-along measures plucks a known time late (with human wobble, a skipped
// note or two) and arrives at the right allowance for the cable, from any
// allowance already in use, at any speed. No song library needed. (Plucks
// read a few ms early, as they do in scoring, which finds them the same way:
// the offsets agree.)
//   node tools/check-sync.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SyncMeter, syncTest, metronome, SYNC } = await import(pathToFileURL(path.join(root, 'web/js/calibrate.js')));

const SR = 48000;
let seed = 777;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

let fails = 0;
const ok = (good, what) => { if (!good) fails++; console.log(`${good ? 'ok  ' : 'FAIL'} ${what}`); };

// The bar: a side on every beat, the middle halfway between.
const at = b => metronome(b * SYNC.BEAT);
ok(at(0).x === 0 && Math.abs(at(1).x - 1) < 1e-9 && Math.abs(at(2).x) < 1e-9 && Math.abs(at(7).x - 1) < 1e-9, 'the bar reaches a side on every tick');
ok(Math.abs(at(0.5).x - 0.5) < 1e-9 && Math.abs(at(1.5).x - 0.5) < 1e-9 && at(3.25).since > 0.149 && at(3.25).since < 0.151, 'and swings evenly between');
ok(Math.abs(SYNC.PLAY / SYNC.BEAT - Math.round(SYNC.PLAY / SYNC.BEAT)) < 1e-9 && Math.abs(60 / SYNC.BEAT - Math.round(60 / SYNC.BEAT)) < 1e-9, 'the play-along and the line-up\'s going round both land on a tick');

/** A plucked open E, cutting off the last. */
function pluck(buf, t) {
  const i0 = Math.round(t * SR);
  for (let k = 0; k < 0.6 * SR && i0 + k < buf.length; k++) {
    const tt = k / SR;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * 41.2 * h * tt) / h;
    v *= 0.1 * Math.exp(-tt / 0.8) * Math.min(1, (0.6 - tt) / 0.03); // and a gentle stop: an abrupt one clicks like a pluck
    if (tt < 0.004) v += 0.06 * (rnd() * 2 - 1) * (1 - tt / 0.004);
    buf[i0 + k] = v + 0.002 * (rnd() * 2 - 1); // over the cable's hiss
  }
}

/** The play-along with plucks lateMs late; returns the meter's result. */
function run({ lateMs, rate = 1, current = 0, wobble = 4 }) {
  const test = syncTest();
  URL.revokeObjectURL?.(test.url);
  const meter = new SyncMeter(test.targets);
  const buf = new Float32Array(Math.ceil((SYNC.END / rate + 1) * SR));
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * (rnd() * 2 - 1);
  for (const tg of test.targets) {
    if (tg.i === 9 || tg.i === 20) continue; // a note or two missed
    pluck(buf, tg.t / rate + lateMs / 1000 + (wobble / 1000) * gauss());
  }
  // song time T is real time T / rate here; the input is exact
  const input = (t0, t1) => {
    const i = Math.round((t0 / rate) * SR), j = Math.round((t1 / rate) * SR);
    if (i < 0 || j > buf.length) return null;
    return { x: buf.subarray(i, j), sr: SR, t0: (i / SR) * rate };
  };
  for (let now = SYNC.PLAY; now <= SYNC.END + 1; now += 1 / 60) meter.update(now, rate, input);
  return meter.result(current);
}

const near = (got, want, tol = 6) => got !== null && Math.abs(got - want) <= tol;
let r = run({ lateMs: 73 });
ok(near(r.input, 73), `cable 73 ms late: measured ${r.input} ms, ${r.heard} of ${SYNC.NOTES - SYNC.WARMUP} heard`);
ok(r.heard === SYNC.NOTES - SYNC.WARMUP - 2, 'the two skipped notes are not heard');
r = run({ lateMs: 12, current: 60 });
ok(near(r.input, 72), `from an allowance of 60 ms, 12 ms more: ${r.input} ms`);
r = run({ lateMs: -20, current: 40 });
ok(near(r.input, 20), `from 40 ms, 20 ms early: ${r.input} ms`);
r = run({ lateMs: 73, rate: 0.7 });
ok(near(r.input, 73), `at 70% speed: ${r.input} ms`);
r = run({ lateMs: 73, wobble: 20 });
ok(near(r.input, 73, 12), `a wobblier player: ${r.input} ms, within ±${Math.round(r.timing.spread)} ms`);
r = run({ lateMs: 300 }); // half a beat off: belongs to no note
ok(r.input === null, 'plucks half a beat off are not counted');

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('check-sync: all good');
