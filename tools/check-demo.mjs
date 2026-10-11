// Checks the demo songs (web/js/demos.js): each chart is shaped as the player needs
// (notes in order, each in its phrase and under the hand's position, an easy level
// below 50% Notes), and each synthesized bass plays what its chart says: each note in
// tune, slides and bends arriving where they're written, nothing clipping. No song
// library needed.
//   node tools/check-demo.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demos = await Promise.all(['demo-prowl.js', 'demo-king.js'].map(f => import(pathToFileURL(path.join(root, 'web/js', f)))));
const { DEMOS, demoChart } = await import(pathToFileURL(path.join(root, 'web/js/demos.js')));
const { buildPlayable } = await import(pathToFileURL(path.join(root, 'web/js/chart.js')));
const { tunerPitch, freqToMidi } = await import(pathToFileURL(path.join(root, 'web/js/pitch.js')));

let fails = 0;
const ok = (good, what) => { if (!good) fails++; console.log(`${good ? 'ok  ' : 'FAIL'} ${what}`); };
const OPEN = [28, 33, 38, 43];
const SR = 32000;

ok(DEMOS.length === demos.length && new Set(DEMOS.map(s => s.id)).size === demos.length, `${demos.length} demo songs on the song list, each its own`);

for (const { SONG, chart: makeChart, render, renderBass } of demos) {
  console.log(`\n${SONG.title}`);
  const chart = makeChart();

  // The chart.
  ok(SONG.id === chart.id && Math.abs(SONG.length - chart.songLength) < 1e-9, 'the song list and the chart agree');
  for (const lv of chart.levels) {
    const name = lv.difficulty ? 'the full chart' : 'the easy level';
    ok(lv.notes.every((n, i) => i === 0 || n.t > lv.notes[i - 1].t), `${name}: ${lv.notes.length} notes, in order, none on top of another`);
    ok(lv.notes.every(n => { const it = chart.phraseIterations[n.pi]; return it && n.t >= it.t && n.t < it.end; }), `${name}: every note in its phrase`);
    ok(lv.notes.every(n => n.s >= 0 && n.s < 4 && n.f >= 0 && n.f <= 24), `${name}: every note on a string and a fret`);
    ok(lv.notes.every(n => n.f === 0 || lv.anchors.some(a => a.pi === n.pi && n.t >= a.t && n.t < a.end && n.f >= a.fret && n.f < a.fret + a.width)),
      `${name}: every fretted note under the hand's position (the camera follows it)`);
    ok(lv.notes.every(n => n.t + (n.sus || 0) < chart.songLength), `${name}: every note ends before the song does`);
  }
  const full = buildPlayable(chart, 100).notes.length, easy = buildPlayable(chart, 40).notes.length;
  ok(full === chart.levels[1].notes.length && easy === chart.levels[0].notes.length && easy < full, `Notes 100% plays the full chart (${full}), 40% the easy one (${easy})`);
  const gaps = chart.beats.slice(1).map((b, i) => b.t - chart.beats[i].t);
  ok(chart.beats.every((b, i) => (i === 0 || b.t > chart.beats[i - 1].t) && (i % 4 === 0) === (b.m !== null)),
    `a beat line on every beat, a bar line every fourth (${Math.round(60 / Math.max(...gaps))} to ${Math.round(60 / Math.min(...gaps))} BPM)`);
  ok(chart.sections.every((s, i) => i === 0 || s.t === chart.sections[i - 1].end), `sections back to back: ${chart.sections.map(s => s.name).join(', ')}`);
  const words = demoChart(SONG.id).lyrics || [];
  ok(words.length && words.every((w, i) => w.w && w.d > 0 && (i === 0 || words[i - 1].t + words[i - 1].d <= w.t)) && words.at(-1).t + words.at(-1).d < chart.songLength
    && words.at(-1).w.endsWith('+'), `${words.length} words, in order, one at a time, ending on a whole line before the song does`);

  // The bass: in tune, and where the chart says.
  const bass = renderBass(SR);
  const notes = chart.levels[1].notes;
  const midiOf = n => (n.tech && n.tech.includes('harmonic') ? OPEN[n.s] + 12 : OPEN[n.s] + n.f);
  const pitchAt = (from, to) => {
    const p = tunerPitch(bass.subarray(Math.round(from * SR), Math.round(to * SR)), SR, { minFreq: 30, maxFreq: 400 });
    return p ? freqToMidi(p.freq) : NaN;
  };
  const offs = [];
  notes.forEach((n, i) => {
    const next = notes[i + 1];
    const end = Math.min(next ? next.t : n.t + 1, n.t + (n.sus || 0.3));
    if (n.slideTo !== undefined || n.bend || end - n.t < 0.12) return;
    // From after the note before has faded (it rings into this one for 40 ms, as a real string would).
    const cents = (pitchAt(n.t + 0.045, end - 0.01) - midiOf(n)) * 100;
    offs.push(Number.isFinite(cents) ? Math.abs(cents) : Infinity);
  });
  // A plucked string's overtones vary from pluck to pluck, and a short note's reading with
  // them: a few read some cents out, as a real bass's do. Most must be spot on.
  offs.sort((x, y) => x - y);
  const median = offs[offs.length >> 1], p90 = offs[Math.floor(offs.length * 0.9)];
  ok(median < 2 && p90 < 6 && offs.at(-1) < 20, `${offs.length} plain notes in tune: half within ${median.toFixed(1)} cents, 90% within ${p90.toFixed(1)}, all within ${offs.at(-1).toFixed(1)}`);
  const glides = notes.filter(n => n.slideTo !== undefined || n.bend);
  const arrive = glides.map(n => {
    const want = n.slideTo !== undefined ? OPEN[n.s] + n.slideTo : OPEN[n.s] + n.f + n.bend;
    return Math.abs(pitchAt(n.t + n.sus - 0.08, n.t + n.sus) - want) * 100;
  });
  if (glides.length) ok(arrive.every(c => c < 25), `${glides.length} slides and bends arrive at their notes (worst ${Math.max(...arrive).toFixed(0)} cents off)`);

  // Every pick lands where it's written: its bright attack (the change from sample to sample)
  // starts on the note, not before. Pull-offs aren't picked.
  const bright = (from, to) => { let s = 0; for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) s += (bass[i] - bass[i - 1]) ** 2; return Math.sqrt(s / Math.max(1, Math.round((to - from) * SR))); };
  const picked = notes.filter(n => !(n.tech && n.tech.includes('pull')) && n.t > 0.1);
  const late = picked.filter(n => !(bright(n.t, n.t + 0.008) > 2 * bright(n.t - 0.02, n.t - 0.002)));
  ok(!late.length, `${picked.length} picked notes start on time${late.length ? ` (not: ${late.map(n => n.t).join(', ')})` : ''}`);

  // The whole mix fits, without clipping.
  const mix = render(SR);
  let peak = 0;
  for (let i = 0; i < mix.left.length; i++) peak = Math.max(peak, Math.abs(mix.left[i]), Math.abs(mix.right[i]));
  ok(peak <= 0.9 && peak > 0.8, `the mix peaks at ${(20 * Math.log10(peak)).toFixed(1)} dBFS (${(mix.left.length / SR).toFixed(0)} s)`);
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
