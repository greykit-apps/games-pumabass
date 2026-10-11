// Checks the demo song (web/js/demos.js): its chart is shaped as the player needs (notes
// in order, each in its phrase and under the hand's position, an easy level below 50%
// Notes), its words are in order, and its recording is there. No song library needed.
//   node tools/check-demo.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demos = await Promise.all(['demo-copybook.js'].map(f => import(pathToFileURL(path.join(root, 'web/js', f)))));
const { DEMOS, demoChart, demoTrack } = await import(pathToFileURL(path.join(root, 'web/js/demos.js')));
const { buildPlayable } = await import(pathToFileURL(path.join(root, 'web/js/chart.js')));

let fails = 0;
const ok = (good, what) => { if (!good) fails++; console.log(`${good ? 'ok  ' : 'FAIL'} ${what}`); };

ok(DEMOS.length === demos.length && new Set(DEMOS.map(s => s.id)).size === demos.length, `${demos.length} demo song${demos.length > 1 ? 's' : ''} on the song list, each its own`);

for (const { SONG } of demos) {
  console.log(`\n${SONG.title}`);
  const chart = demoChart(SONG.id);

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

  // The words.
  const words = chart.lyrics || [];
  ok(words.length && words.every((w, i) => w.w && w.d > 0 && (i === 0 || words[i - 1].t + words[i - 1].d <= w.t)) && words.at(-1).t + words.at(-1).d < chart.songLength
    && words.at(-1).w.endsWith('+'), `${words.length} words, in order, one at a time, ending on a whole line before the song does`);

  // The recording.
  const file = fileURLToPath(demoTrack(SONG.id)), size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  ok(size > 1e6, `its recording is there: ${path.relative(root, file)}, ${(size / 1e6).toFixed(1)} MB`);
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
