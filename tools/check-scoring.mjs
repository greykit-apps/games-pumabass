#!/usr/bin/env node
// check-scoring.mjs -- the scorer against synthesized performances of real
// charts from your library: mostly right notes, with human timing, stiff
// strings and weak fundamentals, and some deliberate mistakes (skipped
// notes, wrong frets, the octave above, badly early or late plucks).
//   node tools/check-scoring.mjs [songs folder] [--sloppy]
// --sloppy plays like a real learner through a real cable: timing that drags
// behind the beat and wanders more, notes left ringing into the next, an open
// string ringing under it all, soft fingerstyle plucks, strings a little sharp.
// Reports how many right notes are scored as hits and how many mistakes are
// let through, by kind. Fails if right notes are missed more than 5% of the
// time, or mistakes let through more than 10%. Needs the songs, so it runs
// locally, not in CI.
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(pathToFileURL(path.join(root, 'server', 'x.js')));
const { Library } = require('./library.js');
const { buildPlayable } = await import(pathToFileURL(path.join(root, 'web/js/chart.js')));
const { Scorer, noteFreq, onsets, EARLY, LATE } = await import(pathToFileURL(path.join(root, 'web/js/scoring.js')));

const cfgFile = path.join(root, 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const SLOPPY = process.argv.includes('--sloppy');
const libraryDir = process.argv.slice(2).find(a => !a.startsWith('--')) || cfg.libraryDir || cfg.rocksmithDir;
if (!libraryDir) { console.error('no songs folder: pass one, or choose it in Settings'); process.exit(1); }
const lib = new Library({ libraryDir, cacheDir: path.join(root, 'cache') });
lib.load();

const SR = 48000, SECONDS = 150;
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

/** A plucked (or hammered) string, added into buf from time t for dur seconds. */
function voice(buf, t, dur, freq, { click = true, weak = false, amp = 0.25, clickAmp = 1, cents = 0 } = {}) {
  freq *= 2 ** (cents / 1200);
  const i0 = Math.round(t * SR), n = Math.round((dur + 0.02) * SR);
  const harm = weak ? [0.3, 1, 0.6, 0.4, 0.25, 0.15] : [1, 0.65, 0.4, 0.25, 0.15, 0.1];
  // A plucked string's harmonics start in step: its waveform has a sharp spike
  // once a period, which a low note spaces far apart (and a pluck detector must
  // not take for plucks).
  const B = 0.00025, ph = harm.map(() => 0);
  for (let k = 0; k < n && i0 + k < buf.length; k++) {
    if (i0 + k < 0) continue;
    const tt = k / SR;
    let v = 0;
    for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(2 * Math.PI * freq * (h + 1) * Math.sqrt(1 + B * (h + 1) ** 2) * tt + ph[h]);
    const env = Math.exp(-tt / 1.4) * Math.min(1, (dur + 0.02 - tt) / 0.02); // decay, and a quick release at the end
    v *= env * amp * 0.4;
    if (click && tt < 0.004) v += clickAmp * amp * 0.5 * (rnd() * 2 - 1) * (1 - tt / 0.004); // the pick's click
    buf[i0 + k] += v;
  }
}
function thud(buf, t) { // a muted note: a click, no pitch
  const i0 = Math.round(t * SR);
  for (let k = 0; k < 0.04 * SR && i0 + k < buf.length; k++) buf[i0 + k] += 0.12 * (rnd() * 2 - 1) * Math.exp(-k / (0.008 * SR));
}

const diag = [];
const kinds = {}; // kind -> { should: 'hit'|'miss', hits, n }
const tally = (kind, should, hit) => { const k = kinds[kind] || (kinds[kind] = { should, hits: 0, n: 0 }); k.n++; if (hit) k.hits++; };

for (const title of ['Wires', 'Sweet Emotion', 'Snarling of Beasts', 'The Seeker', '"Little" Fugue in G minor', 'Killed By Death']) {
  const s = lib.songs.find(x => x.title === title && x.type === 'bass' && x.wem);
  if (!s) { console.log(`(skipping ${title}: not in this library)`); continue; }
  const chart = lib.chart(s.id);
  const notes = buildPlayable(chart, 100).notes.filter(n => n.t < SECONDS - 1);
  const buf = new Float32Array(SR * SECONDS);
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * (rnd() * 2 - 1); // the cable's hiss

  // Decide what the "player" does with each note, then render it.
  // A badly timed pluck only where it lands in the clear: 340 ms off in a
  // fast riff would land on the neighbouring note, and a right note with a
  // stray one on top of it is a mess either way (that case is checked below).
  const roomy = notes.map((ev, i) => (i === 0 || ev.t - notes[i - 1].t > 0.7) && (i === notes.length - 1 || notes[i + 1].t - ev.t > 0.7));
  const plan = notes.map((ev, idx) => {
    const parts = ev.notes || [ev];
    const tech = ev.tech || parts[0].tech || [];
    const legato = tech.some(t => ['hammer', 'pull', 'tap'].includes(t));
    const pluckOnly = parts.length > 1 || tech.some(t => ['mute', 'harmonic', 'pinch'].includes(t));
    const r = rnd();
    let kind;
    if (r < 0.75) kind = 'right';
    else if (r < 0.83) kind = 'skipped';
    else if (r < 0.90 && !pluckOnly) kind = 'wrong fret';
    else if (r < 0.94 && !pluckOnly) kind = 'octave above';
    else if (r < 0.97 && !legato && roomy[idx]) kind = 'too early';
    else if (r < 1 && !legato && roomy[idx]) kind = 'too late';
    else kind = 'right';
    const jitter = SLOPPY ? Math.max(-0.12, Math.min(0.17, 0.04 + 0.045 * gauss())) : Math.max(-0.08, Math.min(0.08, 0.012 + 0.022 * gauss()));
    const shift = kind === 'too early' ? -0.32 : kind === 'too late' ? 0.34 : jitter;
    const semis = kind === 'wrong fret' ? (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 4)) : kind === 'octave above' ? 12 : 0;
    const cat = legato ? 'legato' : parts.length > 1 ? 'chord' : tech.includes('mute') ? 'muted' : 'plucked';
    return { ev, parts, tech, legato, kind, at: ev.t + shift, semis, cat };
  });
  // In the order they are actually played: each note rings until the next
  // one starts (the player's next pluck, or left hand, stops it).
  const played = plan.filter(p => p.kind !== 'skipped').sort((a, b) => a.at - b.at);
  played.forEach((p, i) => {
    const next = played[i + 1];
    let dur = Math.max(0.06, Math.min((next ? next.at : p.at + 1) - p.at, Math.max(p.ev.sus || 0, 0.05) + 0.6));
    if (SLOPPY && rnd() < 0.5) dur += 0.25; // not muted in time: it rings on under the next note
    const weak = rnd() < 0.4;
    if (p.tech.includes('mute')) return thud(buf, p.at);
    const soft = SLOPPY && rnd() < 0.35 ? 0.3 : 1; // fingerstyle: hardly any click
    for (const part of p.parts) voice(buf, p.at, dur, noteFreq(part, chart) * 2 ** (p.semis / 12), { click: !p.legato, weak, amp: p.legato ? 0.18 : 0.25, clickAmp: soft, cents: SLOPPY ? 8 + 6 * gauss() : 0 });
  });
  // An open string nobody muted, ringing quietly under it all, set going again now and then.
  if (SLOPPY) for (let t = 0.5; t < SECONDS - 4; t += 4 + 3 * rnd()) voice(buf, t, 4, noteFreq({ s: 1, f: 0 }, chart), { click: false, amp: 0.05 });

  // Score it, the way the player does: notes judged as their windows close.
  const sectionOf = t => chart.sections.findIndex(x => x.t <= t && t < x.end);
  const scorer = new Scorer(chart, notes, sectionOf);
  const input = (t0, t1) => ({ x: buf.subarray(Math.max(0, Math.round(t0 * SR)), Math.min(buf.length, Math.round(t1 * SR))), sr: SR, t0: Math.max(0, t0) });
  const byEv = new Map(plan.map(p => [p.ev, p]));
  scorer.update(SECONDS, 1, input, (ev, r) => {
    const p = byEv.get(ev);
    // A hammer-on or pull-off straight after a skipped note isn't really
    // played: the string never left the pitch. Reported, but not counted.
    const i = notes.indexOf(ev), afterSkip = p.kind === 'right' && p.legato && i > 0 && byEv.get(notes[i - 1]).kind === 'skipped';
    const should = afterSkip ? 'either' : p.kind === 'right' ? 'hit' : 'miss';
    tally(afterSkip ? 'legato after a skipped note' : p.kind === 'right' ? `right: ${p.cat}` : `mistake: ${p.kind}`, should, r.hit);
    if (process.env.DIAG2 && (should === 'hit') !== r.hit && title === 'Sweet Emotion' && diag.length < 6) {
      const t0 = ev.t - 0.3, seg = buf.subarray(Math.round(t0 * SR), Math.round((ev.t + 0.3) * SR));
      const heard = onsets(seg, SR).map(o => Math.round((t0 + o - ev.t) * 1000));
      const real = played.filter(q => Math.abs(q.at - ev.t) < 0.3).map(q => `${Math.round((q.at - ev.t) * 1000)}${q.legato ? 'L' : ''}${q.ev === ev ? '*' : ''}`);
      diag.push(`t=${ev.t.toFixed(2)} f=${noteFreq(p.parts[0], chart).toFixed(0)} heard plucks (ms from note): ${heard.join(' ')} | really played: ${real.join(' ')} | judged pluck ${r.offset === null ? '-' : Math.round(r.offset * 1000)}`);
    }
    if (process.env.DIAG && (should === 'hit') !== r.hit) diag.push(`${should === 'hit' ? 'MISSED right' : 'LET THROUGH ' + p.kind}${p.semis ? ' ' + (p.semis > 0 ? '+' : '') + p.semis : ''} f=${noteFreq(p.parts[0], chart).toFixed(1)} why=${r.why || '-'}${r.pitch ? ` at=${r.pitch.at.toFixed(2)} oct=${r.pitch.octave.toFixed(2)} c=${r.pitch.cents === null ? '-' : Math.round(r.pitch.cents)}` : ''} off=${r.offset === null ? '-' : Math.round(r.offset * 1000)}ms shift=${Math.round((p.at - ev.t) * 1000)} | ${title} t=${ev.t.toFixed(2)} tech=${p.tech.join('+') || '-'} slide=${p.parts[0].slideTo ?? '-'} gapNext=${(() => { const i = notes.indexOf(ev); return i + 1 < notes.length ? Math.round((notes[i + 1].t - ev.t) * 1000) : '-'; })()}ms nextKind=${(() => { const i = notes.indexOf(ev); return i + 1 < notes.length ? byEv.get(notes[i + 1]).kind : '-'; })()} prevKind=${(() => { const i = notes.indexOf(ev); return i > 0 ? byEv.get(notes[i - 1]).kind : '-'; })()}`);
  });
  console.log(`${title}: ${notes.length} notes, ${Math.round(100 * scorer.accuracy)}% scored (true ${Math.round(100 * plan.filter(p => p.kind === 'right').length / plan.length)}%)`);
}

if (process.env.DIAG || process.env.DIAG2) console.log(diag.join(String.fromCharCode(10)));
// The timing windows: well-spaced notes played early or late by a known
// amount (real time), at full speed and slowed to 70%.
for (const rate of [1, 0.7]) {
  const s = lib.songs.find(x => x.type === 'bass' && x.wem);
  const chart = lib.chart(s.id);
  const offs = [-0.25, -0.18, -0.145, -0.12, -0.06, 0, 0.06, 0.12, 0.14, 0.165, 0.22];
  const notes = [];
  for (let r = 0; r < 6; r++) offs.forEach((o, i) => notes.push({ t: 1 + (r * offs.length + i) * 0.9, s: r % 4, f: 3 + (i % 5), pi: 0, off: o }));
  // At a slower speed a note at song time t is heard at real time t / rate.
  const buf = new Float32Array(Math.ceil((notes[notes.length - 1].t / rate + 2) * SR));
  for (let i = 0; i < buf.length; i++) buf[i] = 0.002 * (rnd() * 2 - 1);
  for (const n of notes) voice(buf, n.t / rate + n.off, 0.6, noteFreq(n, chart), { weak: rnd() < 0.4 });
  const scorer = new Scorer(chart, notes, () => 0);
  const input = (t0, t1) => { const a = Math.max(0, Math.round((t0 / rate) * SR)); return { x: buf.subarray(a, Math.min(buf.length, Math.round((t1 / rate) * SR))), sr: SR, t0: (a / SR) * rate }; };
  const wrong = [];
  scorer.update(notes[notes.length - 1].t + 2, rate, input, (ev, r) => {
    const inside = ev.off >= -EARLY && ev.off <= LATE;
    tally(`timing ${inside ? 'inside' : 'outside'} window${rate < 1 ? ' at 70%' : ''}`, inside ? 'hit' : 'miss', r.hit);
    if (inside !== r.hit) wrong.push(`${Math.round(ev.off * 1000)} ms`);
  });
  const t = scorer.timing();
  console.log(`timing at ${rate * 100}%: ${wrong.length ? 'misjudged at ' + wrong.join(', ') : 'every note judged right'}; reported typical offset ${t ? Math.round(t.ms) + ' ms' : '-'}`);
}

let rightN = 0, rightHit = 0, wrongN = 0, wrongHit = 0;
console.log('');
for (const [kind, k] of Object.entries(kinds).sort()) {
  const pct = Math.round((100 * k.hits) / k.n);
  console.log(`${kind.padEnd(28)} ${String(k.n).padStart(5)} notes   scored as hit ${String(pct).padStart(3)}%   ${k.should === 'hit' ? '(want ~100)' : k.should === 'miss' ? '(want ~0)' : '(either: not counted)'}`);
  if (k.should === 'hit') { rightN += k.n; rightHit += k.hits; } else if (k.should === 'miss') { wrongN += k.n; wrongHit += k.hits; }
}
const missedRight = 1 - rightHit / rightN, letThrough = wrongHit / wrongN;
console.log(`\nright notes missed: ${(100 * missedRight).toFixed(1)}%   mistakes let through: ${(100 * letThrough).toFixed(1)}%   (windows: ${EARLY * 1000} ms early, ${LATE * 1000} ms late)`);
// A careful player: right notes almost never missed. A learner (--sloppy): most right notes still
// count, and scoring stays forgiving without waving mistakes through.
const [maxMissed, maxThrough] = SLOPPY ? [0.25, 0.15] : [0.05, 0.10];
if (missedRight > maxMissed || letThrough > maxThrough) { console.log('check-scoring: FAILED'); process.exit(1); }
console.log('check-scoring: ok');
