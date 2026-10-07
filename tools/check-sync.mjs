// Checks the sync test's arithmetic: plays a made-up player through it (plucks
// on the cable a known time late, differently for Watch and Listen, with human
// wobble kept small, a skipped beat or two) and through taps, and checks the offsets it
// arrives at. No song library needed. (Plucks read a few ms early, as they
// do in scoring, which finds them the same way: the offsets agree.)
//   node tools/check-sync.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SyncMeter, syncTest, SYNC } = await import(pathToFileURL(path.join(root, 'web/js/calibrate.js')));

const SR = 48000;
let seed = 777;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

function pluck(buf, t, freq) {
  const i0 = Math.round(t * SR);
  for (let k = 0; k < 0.5 * SR && i0 + k < buf.length; k++) {
    const tt = k / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * freq * h * tt) / h;
    v *= 0.1 * Math.exp(-tt / 0.8);
    if (tt < 0.004) v += 0.12 * (rnd() * 2 - 1) * (1 - tt / 0.004);
    buf[i0 + k] += v;
  }
}

/**
 * One run of the test. watchMs/listenMs: how late the plucks reach the input
 * against what the meter expects; rate: playback speed. Returns the result.
 */
function run({ watchMs, listenMs, rate = 1, current = { av: 0, input: 0 }, cable = true }) {
  const test = syncTest();
  URL.revokeObjectURL?.(test.url);
  const meter = new SyncMeter(test.targets);
  // The input, in real seconds from song time 0.
  const len = SYNC.END / rate + 1;
  const buf = new Float32Array(Math.ceil(len * SR));
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * (rnd() * 2 - 1);
  let skipped = 0;
  for (const tg of test.targets) {
    if (tg.i === 9 || (tg.pass === 'listen' && tg.i === 13)) { skipped++; continue; } // a beat or two missed
    const late = (tg.pass === 'watch' ? watchMs : listenMs) / 1000 + 0.004 * gauss(); // a steady player: this checks the arithmetic
    const at = tg.t / rate + late;
    if (cable) pluck(buf, at, tg.ev && tg.ev.s === 3 ? 196 : 146.8);
    else meter.tap((at) * rate, rate);
  }
  if (cable) {
    // song time T is real time T / rate here; the input is exact
    const input = (t0, t1) => {
      const i = Math.round((t0 / rate) * SR), j = Math.round((t1 / rate) * SR);
      if (i < 0 || j > buf.length) return null;
      return { x: buf.subarray(i, j), sr: SR, t0: (i / SR) * rate };
    };
    for (let now = 0; now <= SYNC.END + 1; now += 1 / 60) meter.update(now, rate, input);
  }
  return meter.result(current, cable);
}

let fails = 0;
const check = (name, got, want, tol = 6) => {
  const ok = got !== null && Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got === null ? 'none' : `${got} ms`} (want ${want})`);
};

let r = run({ watchMs: 73, listenMs: 113 });
check('cable: highway offset', r.av, 40);
check('cable: scoring offset', r.input, 73);
console.log(`     heard ${r.heard.watch} + ${r.heard.listen} of ${SYNC.N - SYNC.WARMUP} each`);

r = run({ watchMs: 30, listenMs: 10, current: { av: 25, input: 40 } });
check('cable, from earlier offsets: highway', r.av, 5);
check('cable, from earlier offsets: scoring', r.input, 70);

r = run({ watchMs: 73, listenMs: 113, rate: 0.7 });
check('cable at 70% speed: highway', r.av, 40);
check('cable at 70% speed: scoring', r.input, 73);

r = run({ watchMs: 60, listenMs: 140, cable: false });
check('taps: highway offset', r.av, 80);
if (r.input !== null) { fails++; console.log('FAIL taps must not set the scoring offset'); } else console.log('ok   taps leave the scoring offset alone');

r = run({ watchMs: 300, listenMs: 300 }); // half a beat off: belongs to neither
if (r.av !== null || r.input !== null) { fails++; console.log('FAIL plucks far off the beat must not count'); } else console.log('ok   plucks far off the beat are not counted');

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('check-sync: all good');
