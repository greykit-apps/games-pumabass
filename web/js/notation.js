// The notation band: standard notation over tab, scrolling smoothly over the top of
// the highway, so you can learn to read music while you play. The chart's notes are
// fitted to its own beats, bar by bar (16ths, or triplets where they fit a beat
// better). A fixed playhead sits a little in from the left: notes cross it as you
// play them, and most of the band is what's coming. The clef and key stay put at
// the left while the bars slide past. The staff, the tab and the note names each
// turn on and off. Drawn by VexFlow (web/vendor/vexflow/, MIT), loaded the first
// time the band is wanted.

import { $, highway } from './core.js';
import { pitchOf, keyOf, noteName, isDownbeat } from './chart.js';
import { prefs } from './store.js';

const TPB = 12;          // ticks per beat: a 16th is 3, a triplet 8th 4
const BEAT_W = 86;       // width of a beat in the score, before SCALE
const SCALE = 1.1;       // the score's size in the band
const HEAD = 0.18;       // where the playhead sits, across the scrolling part
const STRIP = 12;        // bars drawn at a time...
const AHEAD = 7;         // ...drawn afresh once the playhead is this many bars in
const TAB_NUDGE = 5.6;    // VexFlow sets a fret number this far left of its notehead

let VF = null, loading = null;
function loadVexFlow() {
  if (VF) return Promise.resolve(VF);
  return loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'web/vendor/vexflow/vexflow-bravura.js';
    s.onload = async () => {
      try { await document.fonts.ready; } catch (e) { /* draw anyway */ }
      VF = window.VexFlow;
      resolve(VF);
    };
    s.onerror = () => { loading = null; reject(new Error('VexFlow did not load')); };
    document.head.appendChild(s);
  });
}

const state = { chart: null, kind: 'bass', notes: null, bars: [], key: null, strip: null, choice: '', L: null };

/* A new song (or the sync test, which gets no band). */
export function setNotationSong(chart, type) {
  state.chart = chart;
  state.kind = type === 'bass' ? 'bass' : 'guitar';
  state.notes = null; // rebuilt from the highway's notes on the next frame
  state.strip = null;
}

/* Each frame: show or hide the band, draw the next stretch of bars when the
 * playhead nears the end of what's drawn, and slide it under the playhead. */
export function updateNotation(t, on) {
  const band = $('notation');
  const want = on && prefs.notation && state.chart && (prefs.notationStaff || prefs.notationTab);
  band.classList.toggle('hidden', !want);
  if (!want) return;
  if (!VF) { loadVexFlow().catch(() => { prefs.notation = false; }); return; }
  const choice = `${prefs.notationStaff}${prefs.notationTab}${prefs.staffNames}`;
  if (highway.notes !== state.notes || choice !== state.choice) {
    if (highway.notes !== state.notes) {
      state.notes = highway.notes;
      state.bars = buildBars(state.chart, state.notes);
      state.key = keyOf(state.chart, state.notes);
    }
    state.choice = choice;
    state.L = layoutFor();
    state.strip = null;
    drawClef();
  }
  if (!state.bars.length) return;
  const k = barAt(state.bars, t);
  const st = state.strip;
  if (!st || k < st.first + 1 || k >= st.first + AHEAD) drawStrip(Math.max(0, k - 2));
  slide(t);
}

/* ---- from the chart to bars of notatable pieces ---- */

function barAt(bars, t) {
  let lo = 0, hi = bars.length - 1, found = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
}

function buildBars(chart, notes) {
  const beats = chart.beats, downs = [];
  beats.forEach((b, i) => { if (isDownbeat(beats, i)) downs.push(i); });
  const bars = [];
  for (let k = 0; k < downs.length; k++) {
    const i0 = downs[k], i1 = k + 1 < downs.length ? downs[k + 1] : beats.length;
    const times = beats.slice(i0, i1).map(b => b.t);
    const step = times.length > 1 ? times[times.length - 1] - times[times.length - 2] : 0.5;
    const end = i1 < beats.length ? beats[i1].t : times[times.length - 1] + step;
    bars.push({ start: times[0], end, n: times.length, beats: [...times, end], raw: [], onsets: new Map(), triplets: new Set() });
  }
  if (!bars.length) return bars;
  // Each note to its bar and beat, as a fraction through the beat.
  for (const e of notes) {
    if (e.t < bars[0].start - 0.1 || e.t >= bars[bars.length - 1].end) continue;
    const bar = bars[barAt(bars, e.t)];
    let j = 0;
    while (j < bar.n - 1 && bar.beats[j + 1] <= e.t) j++;
    const len = bar.beats[j + 1] - bar.beats[j];
    bar.raw.push({ e, j, frac: Math.max(0, (e.t - bar.beats[j]) / len), beatLen: len });
  }
  // Per beat: 16ths, or triplets where they fit clearly better. Then snap.
  bars.forEach((bar, k) => {
    const byBeat = new Map();
    for (const r of bar.raw) (byBeat.get(r.j) || byBeat.set(r.j, []).get(r.j)).push(r);
    for (const [j, rs] of byBeat) {
      const err = slots => rs.reduce((s, r) => s + Math.abs(r.frac * slots - Math.round(r.frac * slots)) / slots, 0);
      const trip = rs.some(r => [1, 2].includes(Math.round(r.frac * 3)) && Math.abs(r.frac * 3 - Math.round(r.frac * 3)) < 0.15) && err(3) < err(4) * 0.6;
      if (trip) bar.triplets.add(j);
      const slots = trip ? 3 : 4;
      for (const r of rs) {
        let tick = j * TPB + Math.round(r.frac * slots) * (TPB / slots);
        let target = bar;
        if (tick >= bar.n * TPB) { target = bars[k + 1]; tick = 0; if (!target) continue; }
        const at = target.onsets.get(tick) || target.onsets.set(tick, { parts: [], sus: 0 }).get(tick);
        for (const p of r.e.notes || [r.e]) if (!at.parts.some(q => q.s === p.s)) at.parts.push({ s: p.s, f: p.f, mute: (r.e.tech || p.tech || []).includes('mute') });
        at.sus = Math.max(at.sus, ((r.e.sus || 0) / r.beatLen) * TPB);
      }
    }
    delete bar.raw;
  });
  for (const bar of bars) bar.pieces = piecesOf(bar);
  return bars;
}

// A bar's notes and rests as notatable pieces: split at beat boundaries (bar a
// note starting on a beat and lasting whole beats), tied where a note is split.
function piecesOf(bar) {
  const ticks = bar.n * TPB, segs = [];
  const onsets = [...bar.onsets].sort((a, b) => a[0] - b[0]);
  let cur = 0;
  onsets.forEach(([tick, at], i) => {
    if (tick > cur) segs.push({ start: cur, len: tick - cur });
    const gap = (i + 1 < onsets.length ? onsets[i + 1][0] : ticks) - tick;
    // A short gap: the note lasts until the next. A long one: as long as it rings
    // (at least a beat), then a rest.
    const len = gap <= TPB ? gap : Math.min(gap, Math.max(TPB, Math.round(at.sus / TPB) * TPB));
    segs.push({ start: tick, len, parts: at.parts });
    cur = tick + len;
  });
  if (cur < ticks) segs.push({ start: cur, len: ticks - cur });
  const out = [];
  for (const seg of segs) {
    let s = seg.start, first = true;
    const e = seg.start + seg.len;
    while (s < e) {
      let len;
      if (s % TPB === 0 && e - s >= TPB) {
        const whole = Math.floor((e - s) / TPB);
        len = [4, 3, 2, 1].find(k => k <= whole) * TPB;
      } else len = Math.min(e, (Math.floor(s / TPB) + 1) * TPB) - s;
      out.push({ start: s, len, parts: seg.parts, tied: !first, triplet: len < TPB && bar.triplets.has(Math.floor(s / TPB)) });
      s += len; first = false;
    }
  }
  return out;
}

const DURATIONS = { 3: ['16', 0], 6: ['8', 0], 9: ['8', 1], 12: ['q', 0], 24: ['h', 0], 36: ['h', 1], 48: ['w', 0] };
const TRIPLETS = { 4: ['8', 0], 8: ['q', 0] };


/* ---- drawing ---- */

const clefName = () => (state.kind === 'bass' ? 'bass' : 'treble');
const writtenPitch = p => pitchOf(state.chart, p.s, p.f) + 12; // written an octave above where it sounds
const steps = m => Math.floor(m / 12) * 7 + 'CDEFGAB'.indexOf(noteName(m, state.key.flats)[0]); // diatonic steps from C-1

// Where things sit, set per song (and per choice of staff, tab and names) from the
// part's highest and lowest written notes: a low note never runs into the tab, a
// high one has room, and the band doesn't shift about as it scrolls. In score units
// (a staff space is 10, a tab line 13).
function layoutFor() {
  const staff = prefs.notationStaff, tab = prefs.notationTab, names = staff && prefs.staffNames;
  const [bottomLine, topLine] = clefName() === 'bass' ? [steps(43), steps(57)] : [steps(64), steps(77)]; // G2, A3; E4, F5
  let lo = Infinity, hi = -Infinity;
  for (const bar of state.bars) for (const pc of bar.pieces) for (const p of pc.parts || []) {
    const d = steps(writtenPitch(p)); lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  if (lo === Infinity) lo = hi = bottomLine + 4;
  // Room for ledger lines (5 a step) and stems; below, for the names too.
  const above = staff ? Math.min(60, Math.max(16, (hi - topLine) * 5 + 14)) : 0;
  // (A name goes under the note, or under the tip of a stem pointing down.)
  const below = staff ? Math.min(70, Math.max(26, (bottomLine - lo) * 5 + 12)) + (names ? 22 : 0) : 0;
  const staffTop = 4 + above, staffBottom = staffTop + 40;
  const tabTop = staff ? staffBottom + below + 8 : 12, tabBottom = tabTop + 13 * (state.chart.strings - 1);
  return { staff, tab, names, staffTop, tabTop, height: (tab ? tabBottom + 12 : staffBottom + below + 8) + 2,
    headTop: (staff ? staffTop : tabTop) - 6, headBottom: (tab ? tabBottom : staffBottom) + 6 };
}

function svgIn(el, width) {
  el.innerHTML = '';
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width * SCALE, state.L.height * SCALE);
  const ctx = renderer.getContext();
  ctx.scale(SCALE, SCALE);
  ctx.setFillStyle('#dbe4fb');
  ctx.setStrokeStyle('#dbe4fb');
  return ctx;
}
const staveAt = (x, w) => new VF.Stave(x, state.L.staffTop, w, { spaceAboveStaffLn: 0 });
const tabAt = (x, w) => new VF.TabStave(x, state.L.tabTop, w, { numLines: state.chart.strings, spaceAboveStaffLn: 0 });

// The clef and key, fixed at the left of the band; the band sized to what it holds.
function drawClef() {
  const L = state.L;
  const w = L.staff ? staveAt(0, 400).addClef(clefName()).addKeySignature(state.key.name).getNoteStartX() + 6 : 8;
  const ctx = svgIn($('nt-clef'), w);
  if (L.staff) staveAt(0, w).addClef(clefName()).addKeySignature(state.key.name).setContext(ctx).draw();
  if (L.tab) {
    // VexFlow's TAB mark is drawn for six strings: on fewer it hangs below the lines.
    const tab = tabAt(0, w);
    if (state.chart.strings >= 6) tab.addClef('tab');
    tab.setContext(ctx).draw();
  }
  $('notation').style.height = `${L.height * SCALE}px`;
  $('nt-view').style.left = `${w * SCALE}px`;
  $('nt-head').style.top = `${L.headTop * SCALE}px`;
  $('nt-head').style.height = `${(L.headBottom - L.headTop) * SCALE}px`;
}

// STRIP bars from bar `first`, side by side at a steady width per beat. Records,
// for each note and rest, its song time and where it sits, for slide().
function drawStrip(first) {
  const { StaveNote, TabNote, GhostNote, Voice, Formatter, Beam, Tuplet, StaveTie, Annotation, Accidental, Dot, Fraction } = VF;
  const L = state.L;
  const bars = state.bars.slice(first, first + STRIP);
  const sig = bi => bi === 0 || state.bars[bi - 1].n !== state.bars[bi].n;
  const widths = bars.map((b, i) => b.n * BEAT_W + (sig(first + i) ? 26 : 0));
  const ctx = svgIn($('nt-strip'), widths.reduce((a, b) => a + b, 0) + 2);
  const clef = clefName(), nStr = state.chart.strings, flats = state.key.flats;
  const points = [];
  // The staves first, to know where each bar's first beat sits: a bar's beats are
  // spread evenly from its first beat to the next bar's, notes placed by their time
  // in that span, so the score scrolls at a steady pace (VexFlow's own spacing,
  // made for reading on paper, would make it surge and slow).
  let x = 0;
  const staves = bars.map((bar, i) => {
    const stave = staveAt(x, widths[i]);
    if (sig(first + i)) stave.addTimeSignature(`${bar.n}/4`);
    const tab = tabAt(x, widths[i]);
    x += widths[i];
    return { stave, tab };
  });
  const starts = staves.map(({ stave }) => stave.getNoteStartX());
  const spans = starts.map((s0, i) => (i + 1 < starts.length ? starts[i + 1] : x + (s0 - staves[i].stave.getX())) - s0);
  bars.forEach((bar, i) => {
    const { stave, tab } = staves[i];
    if (L.staff) stave.setContext(ctx).draw();
    if (L.tab) tab.setContext(ctx).draw();

    const notes = [], tabs = [], ties = [], tuplets = [], startOf = new Map();
    let open = null, group = [], groupTab = [], groupBeat = -1;
    const flush = () => {
      if (group.length) { tuplets.push(new Tuplet(group, { numNotes: 3, notesOccupied: 2 })); new Tuplet(groupTab, { numNotes: 3, notesOccupied: 2 }); }
      group = []; groupTab = []; groupBeat = -1;
    };
    for (const pc of bar.pieces) {
      const [dur, dots] = (pc.triplet ? TRIPLETS : DURATIONS)[pc.len] || ['16', 0];
      let sn, tn;
      if (!pc.parts) {
        sn = new StaveNote({ keys: [clef === 'bass' ? 'd/3' : 'b/4'], duration: dur + 'r', clef, dots });
        tn = new GhostNote({ duration: dur, dots });
        open = null;
      } else {
        const ps = [...pc.parts].sort((a, b) => pitchOf(state.chart, a.s, a.f) - pitchOf(state.chart, b.s, b.f));
        const keys = ps.map(p => {
          const m = writtenPitch(p);
          return `${noteName(m, flats).toLowerCase()}/${Math.floor(m / 12) - 1}${p.mute ? '/x2' : ''}`;
        });
        sn = new StaveNote({ keys, duration: dur, clef, dots, autoStem: true });
        tn = pc.tied ? new GhostNote({ duration: dur, dots }) : new TabNote({ positions: ps.map(p => ({ str: nStr - p.s, fret: p.mute ? 'X' : p.f })), duration: dur, dots });
        if (L.names && !pc.tied) {
          sn.addModifier(new Annotation(ps.map(p => noteName(pitchOf(state.chart, p.s, p.f), flats)).join(' '))
            .setVerticalJustification(Annotation.VerticalJustify.BOTTOM).setFont('Academico', 11), 0);
        }
        if (pc.tied && open) ties.push(new StaveTie({ firstNote: open, lastNote: sn, firstIndexes: keys.map((_, n) => n), lastIndexes: keys.map((_, n) => n) }));
        open = sn;
      }
      if (dots) Dot.buildAndAttach([sn], { all: true });
      const beat = Math.floor(pc.start / TPB);
      if (pc.triplet) { if (beat !== groupBeat) flush(); group.push(sn); groupTab.push(tn); groupBeat = beat; } else flush();
      notes.push(sn); tabs.push(tn); startOf.set(sn, pc.start).set(tn, pc.start);
    }
    flush();
    // Only what's shown is laid out: the staff's voice, the tab's, or both together.
    const sv = L.staff && new Voice({ numBeats: bar.n, beatValue: 4 }).setStrict(false).addTickables(notes);
    const tv = L.tab && new Voice({ numBeats: bar.n, beatValue: 4 }).setStrict(false).addTickables(tabs);
    const voices = [sv, tv].filter(Boolean);
    if (sv) Accidental.applyAccidentals([sv], state.key.name);
    const beams = sv ? Beam.generateBeams(notes, { groups: [new Fraction(1, 4)] }) : [];
    const fmt = new Formatter();
    voices.forEach(v => fmt.joinVoices([v]));
    fmt.format(voices, stave.getNoteEndX() - stave.getNoteStartX() - 8);
    // Then each note (and the tab under it) moved to its time in the bar: its
    // notehead's centre on the line the playhead will be on at that moment.
    notes.forEach(n => n.setStave(stave));
    tabs.forEach(n => n.setStave(tab));
    const tcs = fmt.getTickContexts();
    for (const tick of tcs.list) {
      const tc = tcs.map[tick], lead = tc.getTickables().find(n => startOf.has(n));
      if (!lead) continue;
      const want = starts[i] + (startOf.get(lead) / (bar.n * TPB)) * spans[i] - 5;
      tc.setX(tc.getX() + want - lead.getAbsoluteX());
    }
    if (sv) {
      sv.draw(ctx, stave);
      beams.forEach(b => b.setContext(ctx).draw());
      tuplets.forEach(tp => tp.setContext(ctx).draw());
      ties.forEach(ti => ti.setContext(ctx).draw());
    }
    if (tv) tv.draw(ctx, tab);
    for (let j = 0; j < bar.n; j++) points.push([bar.beats[j], starts[i] + (j / bar.n) * spans[i]]);
  });
  const last = bars.length - 1;
  points.push([bars[last].end, starts[last] + spans[last]]);
  // Each fret number under the centre of its note, where the playhead crosses it.
  for (const g of $('nt-strip').querySelectorAll('.vf-tabnote')) g.setAttribute('transform', `translate(${TAB_NUDGE} 0)`);
  state.strip = { first, points };
}

// Slide the strip so song time t sits under the playhead.
function slide(t) {
  const st = state.strip;
  if (!st) return;
  const pts = st.points;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) lo = mid; else hi = mid; }
  const [ta, xa] = pts[lo], [tb, xb] = pts[hi];
  const x = xa + (xb - xa) * Math.min(1, Math.max(0, (t - ta) / Math.max(1e-6, tb - ta)));
  const view = $('nt-view');
  const head = view.clientWidth * HEAD;
  $('nt-strip').style.transform = `translateX(${(head - x * SCALE).toFixed(1)}px)`;
  $('nt-head').style.left = `${view.offsetLeft + head}px`;
}
