#!/usr/bin/env node
// check-camera.mjs -- how the highway camera behaves across every bass chart in
// your library. Run it after tuning the camera constants in web/js/highway.js:
//
//   node tools/check-camera.mjs
//
// Fails if any fretted note is off screen as it lands, or only comes into view
// in its last half second. Reports how fast the view's edges move (lower is
// calmer), how often the camera moves, and how long it spends zoomed out.
// Needs the songs (config.json's libraryDir, or a folder given after the script),
// so it runs locally, not in CI.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const require = createRequire(pathToFileURL(path.join(root, 'server', 'x.js')));
const { Library } = require('./library.js');
const { buildPlayable } = await import(pathToFileURL(path.join(root, 'web/js/chart.js')));
const { Highway } = await import(pathToFileURL(path.join(root, 'web/js/highway.js')));

const cfgFile = path.join(root, 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const libraryDir = process.argv[2] || cfg.libraryDir || cfg.rocksmithDir;
if (!libraryDir) { console.error('no songs folder: choose one in Settings, or pass it: node tools/check-camera.mjs /path/to/songs'); process.exit(1); }
const lib = new Library({ libraryDir, cacheDir: path.join(root, 'cache') });
lib.load();
const songs = lib.songs.filter(s => s.type === 'bass' && s.wem);
if (!songs.length) { console.error('no bass charts with audio found -- nothing checked'); process.exit(1); }

let notes = 0, off = 0, late = 0, moves = 0, moving = 0, wide = 0, frames = 0;
const peaks = [], offBy = {};
for (const s of songs) {
  const p = buildPlayable(lib.chart(s.id), 100);
  const hw = new Highway({ getContext: () => ({}) });
  hw.setChart({ strings: 4 }, p);
  const inView = (f, t) => { const c = hw.camAt(t); return f - 1 >= c.c - c.w / 2 - 0.01 && f <= c.c + c.w / 2 + 0.01; };
  for (const n of p.notes) for (const q of n.notes || [n]) {
    if (!(q.f > 0)) continue;
    notes++;
    if (!inView(q.f, n.t)) { off++; offBy[s.title] = (offBy[s.title] || 0) + 1; }
    else if (!inView(q.f, n.t - 0.5)) late++;
  }
  const end = p.notes.length ? p.notes[p.notes.length - 1].t + 2 : 0;
  let prev = hw.camAt(0), peak = 0, was = false;
  for (let t = 1 / 60; t < end; t += 1 / 60) {
    const c = hw.camAt(t);
    const v = 60 * Math.max(Math.abs((c.c - c.w / 2) - (prev.c - prev.w / 2)), Math.abs((c.c + c.w / 2) - (prev.c + prev.w / 2)));
    peak = Math.max(peak, v);
    const is = v > 0.05;
    if (is) moving++;
    if (is && !was) moves++;
    was = is;
    if (c.w > 13.01) wide++;
    frames++;
    prev = c;
  }
  peaks.push(peak);
}
peaks.sort((a, b) => a - b);
const pct = q => peaks[Math.floor(q * (peaks.length - 1))].toFixed(1);
console.log(`${songs.length} bass charts, ${notes} fretted notes`);
console.log(`off screen as they land: ${off} · in view only in the last half second: ${late}`);
console.log(`peak edge speed (frets/s): median ${pct(0.5)}, 90th percentile ${pct(0.9)}, worst ${pct(1)}`);
console.log(`edge moves per song ${(moves / songs.length).toFixed(1)} · moving ${(100 * moving / frames).toFixed(1)}% of the time · wider than normal ${(100 * wide / frames).toFixed(1)}%`);
if (off || late) {
  console.log('worst: ' + Object.entries(offBy).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e.join(' ')).join(', '));
  process.exit(1);
}
