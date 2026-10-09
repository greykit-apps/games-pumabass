// The score, in two places. The notation band: standard notation over tab, scrolling
// smoothly over the top of the highway past a fixed playhead, so you can learn to read
// music while you play. And the tab view (V): the tab, large, in place of the highway,
// as a page: the bars stand still, laid out in lines across the screen, and the cyan
// playhead runs along the current line with the next line below it. At the end of a
// line it jumps down to the next, and the lines glide up to bring in the one after. In
// both the tab's notes are chips in their strings' colours, lit by a hit and faded by a
// miss, and the strings are named at the left. The chart's notes are fitted to its own
// beats, bar by bar (16ths, or triplets where they fit a beat better). In the band, the
// staff, the tab and the note names each turn on and off. Drawn by VexFlow
// (web/vendor/vexflow/, MIT), loaded the first time a score is wanted.

import { $, highway } from './core.js';
import { pitchOf, keyOf, noteName, isDownbeat, tuningNotes } from './chart.js';
import { STRING_COLORS } from './highway.js';
import { prefs } from './store.js';

const TPB = 12;          // ticks per beat: a 16th is 3, a triplet 8th 4
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

// The song, as both scores write it.
const song = { chart: null, kind: 'bass', notes: null, bars: [], key: null };

// The band: where it's drawn, how big, and what it shows (staff, tab, names under the
// notes). Its tab lines are further apart than VexFlow's 13, so its chips can be read
// over the highway.
const BAND = { el: $('notation'), part: c => BAND.el.querySelector(`.nt-${c}`), scale: 1.1, beatW: 86, head: 0.18, gap: 17,
  strip: null, choice: '', L: null };

// The tab view: its lines of whole bars, as many as fit, spread to fill the width. A bar
// takes the room its busiest stretch needs to keep its chips apart, so a bar of 16ths is
// wide and a bar of quarter notes narrow, and a line holds a few seconds of the song.
const TAB = { el: $('tabview'), box: $('tabview').querySelector('.tv-lines'), head: $('tabview').querySelector('.nt-head'),
  scale: 1.7, gap: 13, choice: '', L: null, lines: [], drawn: new Map(), cur: -1, lineH: 0 };
const CHIP_ROOM = 14;  // from one chip's centre to the next, at least (a chip is 11 wide; 15 for two digits)
const MIN_BEAT = 24;   // the narrowest a beat may be, before scale
const NAMES_W = 16;    // the strings' names at the start of each line
const LINE_GAP = 34;   // px between lines

/* The tab view (V) is on: the player shows it in place of the highway. */
export const tabView = () => prefs.view === 'tab';

/* A new song (or the sync test, which gets no score). */
export function setNotationSong(chart, type) {
  song.chart = chart;
  song.kind = type === 'bass' ? 'bass' : 'guitar';
  song.notes = null; // rebuilt from the highway's notes on the next frame
  BAND.strip = null;
  BAND.choice = TAB.choice = '';
}

/* Each frame: show the band or the tab view (or neither), and move it on to time t. */
export function updateNotation(t, on) {
  const tab = on && !!song.chart && tabView();
  const band = on && !!song.chart && !tab && prefs.notation && (prefs.notationStaff || prefs.notationTab);
  BAND.el.classList.toggle('hidden', !band);
  TAB.el.classList.toggle('hidden', !tab);
  if (!band && !tab) return;
  if (!VF) { loadVexFlow().catch(() => { prefs.notation = false; prefs.view = 'highway'; }); return; }
  if (highway.notes !== song.notes) {
    song.notes = highway.notes;
    song.bars = buildBars(song.chart, song.notes);
    song.key = keyOf(song.chart, song.notes);
    BAND.choice = TAB.choice = '';
  }
  if (tab) updateTab(t);
  else updateBand(t);
}

/* The band: draw the next stretch of bars when the playhead nears the end of what's
 * drawn, and slide it under the playhead. */
function updateBand(t) {
  const S = BAND;
  const shows = { staff: prefs.notationStaff, tab: prefs.notationTab, names: prefs.notationStaff && prefs.staffNames };
  const choice = `${shows.staff}${shows.tab}${shows.names}`;
  if (choice !== S.choice) {
    S.choice = choice;
    S.L = layoutFor(shows, S.gap);
    S.strip = null;
    drawClef(S);
  }
  if (!song.bars.length) return;
  const k = barAt(song.bars, t);
  const st = S.strip;
  if (!st || k < st.first + 1 || k >= st.first + AHEAD) drawStrip(S, Math.max(0, k - 2));
  slide(S, t);
  if (S.L.tab) markChips(S.strip.chips, t);
}

/* The tab view: the line t falls in is the current one, at the top, the next below it.
 * Moving on a line glides them up; any other jump (a seek, a loop coming round) is
 * made at once. The playhead runs along the current line. */
function updateTab(t) {
  const S = TAB;
  const width = S.el.clientWidth;
  if (!width) return;
  const choice = `${width}`;
  if (choice !== S.choice) {
    S.choice = choice;
    S.L = layoutFor({ staff: false, tab: true, names: false }, S.gap);
    S.lines = breakLines(width / S.scale);
    for (const d of S.drawn.values()) d.el.remove();
    S.drawn.clear();
    S.cur = -1;
    S.lineH = S.L.height * S.scale + LINE_GAP;
    S.el.style.height = `${2 * S.lineH - LINE_GAP}px`;
    S.head.style.height = `${(S.L.headBottom - S.L.headTop) * S.scale}px`;
  }
  if (!S.lines.length) return;
  let li = 0;
  while (li + 1 < S.lines.length && S.lines[li + 1].start <= t) li++;
  if (li !== S.cur) {
    // what's in view, and what's on its way in or out
    for (const [i, d] of S.drawn) if (i < li - 1 || i > li + 2) { d.el.remove(); S.drawn.delete(i); }
    for (let i = Math.max(0, li - 1); i <= Math.min(S.lines.length - 1, li + 2); i++) if (!S.drawn.has(i)) S.drawn.set(i, drawLine(i));
    S.box.style.transition = li === S.cur + 1 ? '' : 'none';
    S.box.style.transform = `translateY(${-li * S.lineH}px)`;
    S.cur = li;
  }
  const d = S.drawn.get(li);
  S.head.style.top = `${li * S.lineH + S.L.headTop * S.scale}px`;
  S.head.style.left = `${xAt(d.points, t) * S.scale}px`;
  for (const [i, dl] of S.drawn) if (i <= li + 1) markChips(dl.chips, t);
}

// The song's bars in lines: as many whole bars as fit at the room each needs, then
// spread to fill the line. `width` in score units.
function breakLines(width) {
  const room = width - NAMES_W - 4, lines = [];
  const need = song.bars.map(barNeeds);
  for (let i = 0; i < song.bars.length;) {
    let j = i, sum = 0, extra = 0;
    do { sum += need[j]; extra += sigW(j); j++; }
    while (j < song.bars.length && sum + need[j] + extra + sigW(j) <= room);
    const k = (room - extra) / sum;
    lines.push({ first: i, count: j - i, start: song.bars[i].start, widths: need.slice(i, j).map((w, n) => w * k + sigW(i + n)) });
    i = j;
  }
  return lines;
}

// The room a bar needs: its beats at the width that keeps its closest notes' chips apart.
function barNeeds(bar) {
  const at = bar.pieces.filter(pc => pc.parts && !pc.tied);
  let gap = TPB, wide = false;
  at.forEach((pc, i) => {
    if (i) gap = Math.min(gap, pc.start - at[i - 1].start);
    if (pc.parts.some(p => p.f >= 10)) wide = true;
  });
  return bar.n * Math.max(MIN_BEAT, ((wide ? CHIP_ROOM + 2 : CHIP_ROOM) * TPB) / Math.max(1, gap));
}

// One line of the tab view, drawn and placed in the stack of lines.
function drawLine(i) {
  const S = TAB, line = S.lines[i];
  const el = document.createElement('div');
  el.className = 'tv-line';
  el.style.top = `${i * S.lineH}px`;
  S.box.append(el);
  const ctx = svgIn(S, el, NAMES_W + line.widths.reduce((a, b) => a + b, 0) + 2);
  drawStringNames(ctx, S.L, NAMES_W / 2);
  return { el, ...drawBars(S, el, ctx, line.first, line.count, line.widths, NAMES_W) };
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
        for (const p of r.e.notes || [r.e]) if (!at.parts.some(q => q.s === p.s)) at.parts.push({ s: p.s, f: p.f, mute: (r.e.tech || p.tech || []).includes('mute'), ev: r.e });
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

const clefName = () => (song.kind === 'bass' ? 'bass' : 'treble');
const writtenPitch = p => pitchOf(song.chart, p.s, p.f) + 12; // written an octave above where it sounds
const steps = m => Math.floor(m / 12) * 7 + 'CDEFGAB'.indexOf(noteName(m, song.key.flats)[0]); // diatonic steps from C-1

// Where things sit, set per song (and per choice of staff, tab and names) from the
// part's highest and lowest written notes: a low note never runs into the tab, a
// high one has room, and the band doesn't shift about as it scrolls. In score units
// (a staff space is 10, a tab line `gap`).
function layoutFor({ staff, tab, names }, gap) {
  const [bottomLine, topLine] = clefName() === 'bass' ? [steps(43), steps(57)] : [steps(64), steps(77)]; // G2, A3; E4, F5
  let lo = Infinity, hi = -Infinity;
  for (const bar of song.bars) for (const pc of bar.pieces) for (const p of pc.parts || []) {
    const d = steps(writtenPitch(p)); lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  if (lo === Infinity) lo = hi = bottomLine + 4;
  // Room for ledger lines (5 a step), and below for stems pointing down and the names
  // under the notes (each as close under its own note as it fits: drawStrip).
  const above = staff ? Math.min(60, Math.max(16, (hi - topLine) * 5 + 14)) : 0;
  const clear = staff ? Math.min(70, Math.max(26, (bottomLine - lo) * 5 + 12)) : 0;
  const below = clear + (names ? 18 : 0);
  const staffTop = 4 + above, staffBottom = staffTop + 40, namesMax = staffBottom + below - 3;
  const tabTop = staff ? staffBottom + below + 8 : 12, tabBottom = tabTop + gap * (song.chart.strings - 1);
  return { gap, staff, tab, names, namesMax, staffTop, tabTop, height: (tab ? tabBottom + 12 : staffBottom + below + 8) + 2,
    headTop: (staff ? staffTop : tabTop) - 6, headBottom: (tab ? tabBottom : staffBottom) + 6 };
}

function svgIn(S, el, width) {
  el.innerHTML = '';
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width * S.scale, S.L.height * S.scale);
  const ctx = renderer.getContext();
  ctx.scale(S.scale, S.scale);
  ctx.setFillStyle('#dbe4fb');
  ctx.setStrokeStyle('#dbe4fb');
  return ctx;
}
const staveAt = (L, x, w) => new VF.Stave(x, L.staffTop, w, { spaceAboveStaffLn: 0 });
const tabAt = (L, x, w) => new VF.TabStave(x, L.tabTop, w, { numLines: song.chart.strings, spaceAboveStaffLn: 0, spacingBetweenLinesPx: L.gap });

// The clef and key, fixed at the left of the score; the score sized to what it holds.
function drawClef(S) {
  const L = S.L;
  const w = L.staff ? staveAt(L, 0, 400).addClef(clefName()).addKeySignature(song.key.name).getNoteStartX() + 6 : 14;
  const ctx = svgIn(S, S.part('clef'), w);
  if (L.staff) staveAt(L, 0, w).addClef(clefName()).addKeySignature(song.key.name).setContext(ctx).draw();
  if (L.tab) drawStringNames(ctx, L, w / 2); // under the clef, with the staff up
  S.el.style.height = `${L.height * S.scale}px`;
  S.part('view').style.left = `${w * S.scale}px`;
  S.part('head').style.top = `${L.headTop * S.scale}px`;
  S.part('head').style.height = `${(L.headBottom - L.headTop) * S.scale}px`;
}

// The strings named, each in its colour, centred on x, top line the highest string.
function drawStringNames(ctx, L, x) {
  const nStr = song.chart.strings, names = tuningNotes(song.chart.tuning, nStr);
  ctx.openGroup('ntstrings');
  ctx.setFont('Saira', L.gap * 0.58, 'bold'); // in points
  for (let line = 0; line < nStr; line++) {
    const s = nStr - 1 - line;
    ctx.setFillStyle(STRING_COLORS[s] || '#999');
    ctx.fillText(names[s], x, L.tabTop + line * L.gap);
  }
  ctx.closeGroup();
}

// A time signature takes room at the start of its bar: the song's first, and wherever it changes.
const sigW = bi => (bi === 0 || song.bars[bi - 1].n !== song.bars[bi].n ? 26 : 0);

// STRIP bars from bar `first`, side by side at a steady width per beat, for the band to slide.
function drawStrip(S, first) {
  const count = Math.min(STRIP, song.bars.length - first);
  const widths = song.bars.slice(first, first + count).map((b, i) => b.n * S.beatW + sigW(first + i));
  const el = S.part('strip');
  const ctx = svgIn(S, el, widths.reduce((a, b) => a + b, 0) + 2);
  S.strip = { first, ...drawBars(S, el, ctx, first, count, widths, 0) };
}

// `count` bars from bar `first`, side by side from x0 at the given widths, into el's
// svg. Returns, for each beat, its song time and where it sits (for the playhead), and
// the tab's chips with their notes (for markChips).
function drawBars(S, el, ctx, first, count, widths, x0) {
  const { StaveNote, TabNote, GhostNote, Voice, Formatter, Beam, Tuplet, StaveTie, Accidental, Dot, Fraction } = VF;
  const L = S.L;
  const bars = song.bars.slice(first, first + count);
  const sig = bi => sigW(bi) > 0;
  const clef = clefName(), nStr = song.chart.strings, flats = song.key.flats;
  const points = [], fretted = [];
  // The staves first, to know where each bar's first beat sits: a bar's beats are
  // spread evenly from its first beat to the next bar's, notes placed by their time
  // in that span, so the score scrolls at a steady pace (VexFlow's own spacing,
  // made for reading on paper, would make it surge and slow).
  let x = x0;
  const staves = bars.map((bar, i) => {
    const stave = staveAt(L, x, widths[i]);
    if (sig(first + i)) stave.addTimeSignature(`${bar.n}/4`);
    const tab = tabAt(L, x, widths[i]);
    x += widths[i];
    return { stave, tab };
  });
  const starts = staves.map(({ stave }) => stave.getNoteStartX());
  const spans = starts.map((s0, i) => (i + 1 < starts.length ? starts[i + 1] : x + (s0 - staves[i].stave.getX())) - s0);
  bars.forEach((bar, i) => {
    const { stave, tab } = staves[i];
    if (L.staff) stave.setContext(ctx).draw();
    if (L.tab) tab.setContext(ctx).draw();

    const notes = [], tabs = [], ties = [], tuplets = [], startOf = new Map(), named = [];
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
        const ps = [...pc.parts].sort((a, b) => pitchOf(song.chart, a.s, a.f) - pitchOf(song.chart, b.s, b.f));
        const keys = ps.map(p => {
          const m = writtenPitch(p);
          return `${noteName(m, flats).toLowerCase()}/${Math.floor(m / 12) - 1}${p.mute ? '/x2' : ''}`;
        });
        sn = new StaveNote({ keys, duration: dur, clef, dots, autoStem: true });
        tn = pc.tied ? new GhostNote({ duration: dur, dots }) : new TabNote({ positions: ps.map(p => ({ str: nStr - p.s, fret: p.mute ? 'X' : p.f })), duration: dur, dots });
        if (!pc.tied) { named.push({ sn, pc, ps }); fretted.push({ tn, ps }); }
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
    if (sv) Accidental.applyAccidentals([sv], song.key.name);
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
    // Each name centred under its own note, once the beams have set the stems'
    // lengths: just below the staff, or lower when the note (its notehead, or its stem's
    // tip when that points down) reaches lower, so never on a beam; but never into the tab.
    if (sv && L.names) {
      ctx.openGroup('ntnames');
      const floor = stave.getYForLine(4) + 3;
      for (const { sn, pc, ps } of named) {
        let low = Math.max(floor, Math.max(...sn.getYs()) + 5);
        if (sn.getStemDirection() < 0) low = Math.max(low, sn.getStemExtents().topY + 3);
        const name = ps.map(p => noteName(pitchOf(song.chart, p.s, p.f), flats)).join(' ');
        ctx.fillText(name, starts[i] + (pc.start / (bar.n * TPB)) * spans[i], Math.min(low + 11, L.namesMax));
      }
      ctx.closeGroup();
    }
    for (let j = 0; j < bar.n; j++) points.push([bar.beats[j], starts[i] + (j / bar.n) * spans[i]]);
  });
  const last = bars.length - 1;
  points.push([bars[last].end, starts[last] + spans[last]]);
  // Each fret number centred under its note, where the playhead crosses it, and on
  // its line: drawn bold and larger (style.css), it's anchored by its middle so it
  // grows about the same point.
  const partsOf = new Map(fretted.map(({ tn, ps }) => [tn.getSVGElement(), ps]));
  const chips = [];
  for (const g of el.querySelectorAll('.vf-tabnote')) {
    g.setAttribute('transform', `translate(${TAB_NUDGE} 0)`);
    for (const text of g.querySelectorAll('text')) {
      const b = text.getBBox();
      const line = Math.round((b.y + b.height / 2 - L.tabTop) / L.gap);
      text.setAttribute('x', (b.x + b.width / 2).toFixed(2));
      text.setAttribute('y', (L.tabTop + line * L.gap).toFixed(2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      const str = nStr - 1 - line, p = (partsOf.get(g) || []).find(q => q.s === str);
      chips.push({ g: chip(text, str, L.gap), ev: p && p.ev, state: '' });
    }
  }
  return { points, chips };
}

// Each fret number sits on a chip in its string's colour, as the highway's notes
// are: a darker edge, dark ink. A muted note's X is on grey.
// Chip and number together in a group, which shows how the note went (markChips).
function chip(text, s, gap) {
  text.style.fontSize = `${gap * 0.7}px`; // sized to the chip, which is sized to the lines
  const b = text.getBBox(), muted = text.textContent === 'X', color = muted ? '#777' : STRING_COLORS[s] || '#999';
  const h = gap * 0.85, w = Math.max(h, b.width + gap * 0.38);
  const NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g'), r = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: b.x + b.width / 2 - w / 2, y: Number(text.getAttribute('y')) - h / 2, width: w, height: h, rx: gap * 0.19 }))
    r.setAttribute(k, typeof v === 'number' ? v.toFixed(2) : v);
  r.setAttribute('class', 'nt-chip');
  r.style.fill = color;
  r.style.stroke = shade(color, 0.55);
  g.setAttribute('class', 'nt-note');
  g.style.setProperty('--c', color);
  text.before(g);
  g.append(r, text);
  if (muted) text.classList.add('muted');
  return g;
}

// How each chip's note went, from scoring's verdicts (the highway's): a hit pulses
// and stays bright until it's gone from view; a miss fades back. A note scoring is
// still listening for keeps its colour until its verdict, as long as the highway would
// wait for it; with nothing scored, a note fades as it crosses the line. A hit stays
// lit after scoring lets go of its verdict (it keeps only the last few seconds'), and
// a note is fresh again once play goes back before it.
const WAIT = 0.6;
function markChips(chips, t) {
  for (const c of chips) {
    if (!c.ev || (c.ev.t > t + 0.05 && !c.state)) continue;
    const v = highway.verdicts.get(c.ev);
    const state = c.ev.t > t + 0.05 ? '' : v ? (v.hit ? 'hit' : 'missed') : c.state === 'hit' ? 'hit'
      : t > c.ev.t + (highway.judging ? WAIT : 0) ? 'missed' : '';
    if (state === c.state) continue;
    c.g.classList.toggle('hit', state === 'hit');
    c.g.classList.toggle('missed', state === 'missed');
    // a hit drawn afresh (a new strip or line) doesn't pulse again
    c.g.classList.toggle('settled', state === 'hit' && performance.now() - v.wall > 450);
    c.state = state;
  }
}
const shade = (hex, k) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;

// Where song time t sits, from the beats' places: between two beats, in proportion.
function xAt(pts, t) {
  let lo = 0, hi = pts.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) lo = mid; else hi = mid; }
  const [ta, xa] = pts[lo], [tb, xb] = pts[hi];
  return xa + (xb - xa) * Math.min(1, Math.max(0, (t - ta) / Math.max(1e-6, tb - ta)));
}

// Slide the strip so song time t sits under the playhead.
function slide(S, t) {
  const st = S.strip;
  if (!st) return;
  const x = xAt(st.points, t);
  const view = S.part('view');
  const head = view.clientWidth * S.head;
  S.part('strip').style.transform = `translateX(${(head - x * S.scale).toFixed(1)}px)`;
  S.part('head').style.left = `${view.offsetLeft + head}px`;
}
