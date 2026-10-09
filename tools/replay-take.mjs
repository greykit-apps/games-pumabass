// Replays a saved take (takes/*.json + .wav, from "Save take" in the player)
// through scoring, exactly as it ran live, and reports why notes were missed:
// by string, by fret range, by reason, and the timing of the plucks it heard.
//   node tools/replay-take.mjs "takes/<name>.json" [--notes] [--shift ms]
//     --notes     list every note's verdict
//     --shift ms  replay as if the cable's offset were this much larger
//
// Takes are your own playing: they stay on this computer (takes/ is ignored by git).

import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Scorer, onsets, noteFreq, pitchPresent } = await import(pathToFileURL(path.join(root, 'web/js/scoring.js')));

const args = process.argv.slice(2);
const file = args.find(a => a.endsWith('.json'));
if (!file) { console.error('usage: node tools/replay-take.mjs takes/<name>.json [--notes] [--shift ms]'); process.exit(1); }
const listNotes = args.includes('--notes');
const shift = args.includes('--shift') ? Number(args[args.indexOf('--shift') + 1]) / 1000 : 0;

const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
const wav = fs.readFileSync(file.replace(/\.json$/, '.wav'));
const sr = meta.sampleRate;
const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1);
const x = Float32Array.from(pcm, v => v / 32767);

// Where each chunk starts, in samples and on the audio clock.
const starts = [];
let k = 0;
meta.chunks.forEach((n, i) => { starts.push({ k, t0: meta.t0s[i] }); k += n; });
function at(c) { // sample index of audio-clock time c
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m].t0 <= c) lo = m; else hi = m - 1; }
  return starts[lo].k + Math.round((c - starts[lo].t0) * sr);
}

const chart = meta.chart, notes = meta.notes;
const lat = meta.latency + meta.inputOffset / 1000 + shift;
let sync = null;
function inputBetween(t0, t1) {
  const ctxOf = T => sync.ctx - (sync.song - T) / sync.rate + lat;
  const c0 = ctxOf(t0), c1 = ctxOf(t1);
  if (c0 < starts[0].t0) return null;
  const i = at(c0), j = at(c1);
  if (i < 0 || j > x.length || j <= i) return null;
  const c0x = starts[0].t0; // (only the song time of x[0] matters)
  void c0x;
  return { x: x.subarray(i, j), sr, t0: t0 };
}

const sectionOf = t => chart.sections.findIndex(s => s.t <= t && t < s.end);
const scorer = new Scorer(chart, notes, sectionOf, meta.soundcheck || null); // the noise floor it was scored with
const verdicts = new Map();
let last = null;
for (const [song, ctx, rate] of meta.syncs) {
  if (last && Math.abs((song - last[0]) - (ctx - last[1]) * rate) > 0.25) scorer.seek(song); // a jump
  if (!last) scorer.seek(song);
  last = [song, ctx, rate];
  sync = { song, ctx, rate };
  scorer.update(song, rate, inputBetween, (ev, r) => verdicts.set(ev, r));
}

// What went wrong, and where.
const STR = ['E', 'A', 'D', 'G', 'B', 'e'];
const kind = ev => {
  const parts = ev.notes || [ev], tech = ev.tech || parts[0].tech || [];
  if (parts.length > 1) return 'chord';
  if (tech.some(t => ['hammer', 'pull', 'tap'].includes(t))) return 'legato';
  if (tech.includes('mute')) return 'muted';
  return 'plucked';
};
const groups = {};
const add = (g, key, r) => { const o = (groups[g] ||= {}); const e = (o[key] ||= { n: 0, hit: 0, why: {} }); e.n++; if (r.hit) e.hit++; else e.why[r.why || '?'] = (e.why[r.why || '?'] || 0) + 1; };
const offs = [];
for (const [ev, r] of verdicts) {
  const p = ev.notes ? ev.notes[0] : ev;
  add('by kind', kind(ev), r);
  if (!ev.notes) {
    add('by string', STR[p.s] || p.s, r);
    add('by fret', p.f === 0 ? 'open' : p.f <= 4 ? '1-4' : p.f <= 9 ? '5-9' : p.f <= 14 ? '10-14' : '15+', r);
  }
  add('all', 'notes', r);
  if (r.offset !== null && r.offset !== undefined) offs.push(r.offset * 1000);
}
console.log(`${meta.title}: ${meta.input} · cable offset ${Math.round(lat * 1000 - meta.latency * 1000)} ms${shift ? ` (shifted ${shift * 1000})` : ''} · ${(x.length / sr).toFixed(0)} s of input`);
const live = meta.verdicts.filter(v => v[1]).length;
console.log(`live: ${live} of ${meta.verdicts.length} hit · replay: ${[...verdicts.values()].filter(r => r.hit).length} of ${verdicts.size}`);
for (const [g, o] of Object.entries(groups)) {
  console.log(`\n${g}`);
  for (const [key, e] of Object.entries(o)) {
    console.log(`  ${key.padEnd(8)} ${String(e.hit).padStart(4)}/${String(e.n).padEnd(4)} ${Math.round((100 * e.hit) / e.n).toString().padStart(3)}%  ${Object.entries(e.why).map(([w, c]) => `${w} ${c}`).join(', ')}`);
  }
}
if (offs.length) {
  offs.sort((a, b) => a - b);
  const q = f => Math.round(offs[Math.floor(f * (offs.length - 1))]);
  console.log(`\npluck timing (ms, + late): 10% ${q(0.1)} · median ${q(0.5)} · 90% ${q(0.9)}`);
}

// Every note, with what was heard around it: the plucks found within half a
// second, and the pitch's correlation just after the nearest one.
if (listNotes) {
  console.log('\n  time    str fret  Hz     verdict        plucks heard (ms from the note)   pitch');
  for (const [ev, r] of verdicts) {
    const p = ev.notes ? ev.notes[0] : ev;
    const seg = (() => { const ctxT = T => { const s = meta.syncs.reduce((a, b) => (Math.abs(b[0] - T) < Math.abs(a[0] - T) ? b : a)); return s[1] - (s[0] - T) / s[2] + lat; }; const i = at(ctxT(ev.t - 0.5)), j = at(ctxT(ev.t + 0.5)); return i >= 0 && j <= x.length ? x.subarray(i, j) : null; })();
    const heard = seg ? onsets(seg, sr, { noise: meta.soundcheck || null }).map(o => Math.round((o - 0.5) * 1000)).filter(o => Math.abs(o) <= 400) : [];
    let pitch = '';
    if (seg && !ev.notes) {
      const f = noteFreq(p, chart), near = heard.length ? heard.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)) : 0;
      const i = Math.round((0.5 + near / 1000 + 0.015) * sr), n = Math.round((3.5 / f + 0.1) * sr);
      if (i + n <= seg.length) { const q = pitchPresent(seg.subarray(i, i + n), sr, f); pitch = `corr ${q.at.toFixed(2)} ${q.cents === null ? '' : `${q.cents > 0 ? '+' : ''}${Math.round(q.cents)}c`} oct ${q.octave.toFixed(2)}`; }
    }
    console.log(`  ${ev.t.toFixed(2).padStart(7)}  ${ev.notes ? 'chd' : (STR[p.s] || p.s).padEnd(3)} ${String(p.f).padStart(3)}  ${ev.notes ? '' : noteFreq(p, chart).toFixed(0).padStart(4)}   ${(r.hit ? 'hit' : `miss: ${r.why}`).padEnd(14)} ${heard.join(' ').padEnd(32)}  ${pitch}`);
  }
}
