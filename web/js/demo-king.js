// A demo song (demos.js): "In the Hall of the Mountain King", from Edvard Grieg's
// music for Peer Gynt (1875), long out of copyright, arranged here for bass and a
// rock band. Its chart is written here note by note and its audio is made here
// (synth.js), so the arrangement and the recording are PumaBass's own too.
//
// E minor (Grieg's is in B minor), 4/4. The theme goes round low by the open E
// (frets 0 to 3), then in the dominant, B minor (frets 2 to 5), then an octave up
// (frets 5 to 9). Like Grieg's, it speeds up all the way, from 76 BPM to 168,
// and the last two bars stamp it out. Below 50% Notes it's quarter notes.

import { hz, pluck, lowpass, kick, snare, metal } from './synth.js';

const E = 0, A = 1, D = 2, G = 3; // strings, low to high
const OPEN = [28, 33, 38, 43];    // the open strings, MIDI: E1 A1 D2 G2
const LEAD_IN = 2;                // bars before the theme: one quiet, one counted in on sticks
const TAIL = 3;                   // s after the last bar, for the last note to ring
const SLOW = 76, FAST = 168, LAST = 96; // BPM: the start, the end of the build, the last two bars

/* The theme, four bars of it in three places on the neck: its notes ([16th, string,
 * fret, extras]; extras' sus is in 16ths), the same bars made easy (quarter notes),
 * and where the hand sits ([16th, fret, width]). */
const LOW = { // E F# G A B G B, A# F# A#, A F A, E F# G A B G B E, D B G B D
  bars: 4,
  notes: [
    [0, E, 0], [2, E, 2], [4, E, 3], [6, A, 0], [8, A, 2], [10, E, 3], [12, A, 2],
    [16, A, 1], [18, E, 2], [20, A, 1], [24, A, 0], [26, E, 1], [28, A, 0],
    [32, E, 0], [34, E, 2], [36, E, 3], [38, A, 0], [40, A, 2], [42, E, 3], [44, A, 2], [46, D, 2],
    [48, D, 0], [50, A, 2], [52, E, 3], [54, A, 2], [56, D, 0, { sus: 7 }],
  ],
  easy: [
    [0, E, 0], [4, E, 3], [8, A, 2], [12, A, 2], [16, A, 1], [20, A, 1], [24, A, 0], [28, A, 0],
    [32, E, 0], [36, E, 3], [40, A, 2], [44, A, 2], [48, D, 0], [52, E, 3], [56, D, 0, { sus: 7 }],
  ],
  anchors: [[0, 1, 4]],
};
const DOMINANT = { // the same, in B minor: B C# D E F# D F#, E# C# E#, E C E, ..., A F# D F# A
  bars: 4,
  notes: [
    [0, A, 2], [2, A, 4], [4, A, 5], [6, D, 2], [8, D, 4], [10, A, 5], [12, D, 4],
    [16, D, 3], [18, A, 4], [20, D, 3], [24, D, 2], [26, A, 3], [28, D, 2],
    [32, A, 2], [34, A, 4], [36, A, 5], [38, D, 2], [40, D, 4], [42, A, 5], [44, D, 4], [46, G, 4],
    [48, G, 2], [50, D, 4], [52, A, 5], [54, D, 4], [56, G, 2, { sus: 7 }],
  ],
  easy: [
    [0, A, 2], [4, A, 5], [8, D, 4], [12, D, 4], [16, D, 3], [20, D, 3], [24, D, 2], [28, D, 2],
    [32, A, 2], [36, A, 5], [40, D, 4], [44, D, 4], [48, G, 2], [52, A, 5], [56, G, 2, { sus: 7 }],
  ],
  anchors: [[0, 2, 4]],
};
const HIGH = { // LOW an octave up
  bars: 4,
  notes: [
    [0, A, 7], [2, A, 9], [4, D, 5], [6, D, 7], [8, D, 9], [10, D, 5], [12, D, 9],
    [16, D, 8], [18, A, 9], [20, D, 8], [24, D, 7], [26, A, 8], [28, D, 7],
    [32, A, 7], [34, A, 9], [36, D, 5], [38, D, 7], [40, D, 9], [42, D, 5], [44, D, 9], [46, G, 9],
    [48, G, 7], [50, D, 9], [52, D, 5], [54, D, 9], [56, G, 7, { sus: 7 }],
  ],
  easy: [
    [0, A, 7], [4, D, 5], [8, D, 9], [12, D, 9], [16, D, 8], [20, D, 8], [24, D, 7], [28, D, 7],
    [32, A, 7], [36, D, 5], [40, D, 9], [44, D, 9], [48, G, 7], [52, D, 5], [56, G, 7, { sus: 7 }],
  ],
  anchors: [[0, 5, 5]],
};
const ENDING = { // four stamps, E B E B, then the low E rings out
  bars: 2,
  notes: [[0, E, 0, { sus: 2 }], [4, A, 2, { sus: 2 }], [8, E, 0, { sus: 2 }], [12, A, 2, { sus: 2 }], [16, E, 0, { sus: 14 }]],
  easy: [[0, E, 0, { sus: 2 }], [4, A, 2, { sus: 2 }], [8, E, 0, { sus: 2 }], [12, A, 2, { sus: 2 }], [16, E, 0, { sus: 14 }]],
  anchors: [[0, 1, 4]],
};

/* The song, section by section: the theme's turns in order, and what the band plays
 * (drums 1 to 3: the beat gets busier; the guitar doubles the bass, muted or ringing). */
const FORM = [
  { name: 'intro', riffs: [LOW, LOW] }, // the bass alone, as Grieg's begins on the low strings
  { name: 'melody', riffs: [LOW, LOW], drums: 1 },
  { name: 'variation', riffs: [DOMINANT, DOMINANT], drums: 2, guitar: 'mute' },
  { name: 'melody', riffs: [HIGH, HIGH], drums: 2, guitar: 'ring' },
  { name: 'buildup', riffs: [DOMINANT, HIGH], drums: 3, guitar: 'ring' },
  { name: 'outro', riffs: [ENDING], drums: 3, guitar: 'ring' },
];

const r3 = x => Math.round(x * 1000) / 1000;

/* Every turn of the theme laid out in bars ({ riff, bar, section, last }), and every
 * bar's tempo: steady through the lead-in, then faster bar by bar, then the end. */
function layout() {
  const blocks = [];
  let bar = LEAD_IN;
  FORM.forEach((sec, i) => sec.riffs.forEach((riff, k) => {
    blocks.push({ riff, bar, section: i, last: k === sec.riffs.length - 1 });
    bar += riff.bars;
  }));
  const bars = bar, build = bars - LEAD_IN - ENDING.bars;
  const bpm = Array.from({ length: bars }, (_, b) => (b < LEAD_IN ? SLOW : b >= bars - ENDING.bars ? LAST
    : SLOW + (FAST - SLOW) * ((b - LEAD_IN) / (build - 1)) ** 1.6));
  const start = [0];
  bpm.forEach((x, b) => start.push(start[b] + 240 / x));
  return { blocks, bars, bpm, start };
}

const { blocks: BLOCKS, bars: BARS, bpm: BPM, start: BAR_START } = layout();
const SONG_LENGTH = r3(BAR_START[BARS] + TAIL);

/* When a 16th falls: slot 16th notes into the bar that starts at bar0 (slots past
 * the bar run on into the next, at its own tempo). */
function at(bar0, slot) {
  const bar = bar0 + Math.floor(slot / 16);
  return bar >= BARS ? BAR_START[BARS] : BAR_START[bar] + (slot % 16) * 15 / BPM[bar];
}

/** Its row in the song list, shaped like the server's. */
export const SONG = {
  id: 'demo:mountain-king', songKey: 'PumaBassMountainKing', title: 'In the Hall of the Mountain King',
  artist: 'Edvard Grieg', album: 'Peer Gynt', year: 1875,
  length: SONG_LENGTH, arrangement: 'Bass', type: 'bass', represent: true, bonus: false,
  tuning: [0, 0, 0, 0, 0, 0], centOffset: 0, capo: 0, difficulty: 0.22, platform: 'pc',
  sources: ['demo'], audio: 'demo', demo: true,
};

/* A chart note from a riff's note, in the turn starting at bar0, phrase iteration pi. */
function chartNote([slot, s, f, x = {}], bar0, pi) {
  const t = at(bar0, slot), n = { t: r3(t), pi, s, f };
  if (x.sus) n.sus = r3(at(bar0, slot + x.sus) - t);
  return n;
}

/** The chart, shaped like the server's (server/library.js: buildChart). */
export function chart() {
  const phrases = [{ name: 'COUNT', maxDifficulty: 0 }];
  const phraseOf = new Map();
  for (const sec of FORM) if (!phraseOf.has(sec.name)) { phraseOf.set(sec.name, phrases.length); phrases.push({ name: sec.name, maxDifficulty: 1 }); }
  phrases.push({ name: 'END', maxDifficulty: 0 });
  // A phrase iteration per section, between the count-in and the end.
  const starts = FORM.map((_, i) => BAR_START[BLOCKS.find(b => b.section === i).bar]);
  const ends = FORM.map((_, i) => (i + 1 < FORM.length ? starts[i + 1] : BAR_START[BARS]));
  const phraseIterations = [
    { phrase: 0, t: 0, end: r3(starts[0]) },
    ...FORM.map((sec, i) => ({ phrase: phraseOf.get(sec.name), t: r3(starts[i]), end: r3(ends[i]) })),
    { phrase: phrases.length - 1, t: r3(BAR_START[BARS]), end: SONG_LENGTH },
  ];
  const sections = FORM.map((sec, i) => ({ name: sec.name, t: r3(starts[i]), end: r3(ends[i]) }));

  const level = (difficulty, pick) => {
    const notes = [], anchors = [
      { t: 0, end: r3(starts[0]), fret: 1, width: 4, pi: 0 },
      { t: r3(BAR_START[BARS]), end: SONG_LENGTH, fret: 1, width: 4, pi: phraseIterations.length - 1 },
    ];
    for (const b of BLOCKS) {
      const pi = b.section + 1;
      for (const n of pick(b.riff)) notes.push(chartNote(n, b.bar, pi));
      b.riff.anchors.forEach(([slot, fret, width], k, all) => {
        const next = all[k + 1];
        anchors.push({ t: r3(at(b.bar, slot)), end: r3(at(b.bar, next ? next[0] : b.riff.bars * 16)), fret, width, pi });
      });
    }
    return { difficulty, notes, anchors: anchors.sort((a, b) => a.t - b.t), handShapes: [] };
  };

  // A beat line on every beat, a bar line every fourth; past the last bar, at its tempo.
  const beats = [];
  for (let b = 0; b < BARS; b++) for (let k = 0; k < 4; k++) beats.push({ t: r3(BAR_START[b] + k * 60 / BPM[b]), m: k ? null : b });
  for (let k = 0; BAR_START[BARS] + k * 60 / LAST < SONG_LENGTH; k++) beats.push({ t: r3(BAR_START[BARS] + k * 60 / LAST), m: k % 4 ? null : BARS + k / 4 });
  return {
    id: SONG.id, title: SONG.title, artist: SONG.artist, album: SONG.album, year: SONG.year,
    arrangement: 'Bass', type: 'bass', strings: 4, tuning: [0, 0, 0, 0], centOffset: 0, capo: 0,
    songLength: SONG_LENGTH, beats, sections, phrases, phraseIterations, chordTemplates: [], maxDifficulty: 1,
    levels: [level(0, r => r.easy), level(1, r => r.notes)],
  };
}

/* ---- the sound ---- */

/* Each note of the full chart, how long it sounds: until the next (or for its sustain). */
const sounding = notes => notes.map((n, i) => {
  const next = notes[i + 1], gap = next ? next.t - n.t : 2;
  return n.sus ? n.sus : Math.min(gap - 0.012, 0.9);
});

/** The bass alone: every note of the full chart. */
export function renderBass(sr = 32000) {
  const len = Math.ceil(SONG_LENGTH * sr), bass = new Float32Array(len);
  const notes = chart().levels[1].notes, dur = sounding(notes);
  notes.forEach((n, i) => pluck(bass, sr, n.t, dur[i], () => hz(OPEN[n.s] + n.f), { amp: 0.85, bright: 0.32, t60: 3.2, seed: 11 + i }));
  lowpass(bass, sr, 2400);
  for (let i = 0; i < len; i++) bass[i] = Math.tanh(1.6 * bass[i]) / 1.3;
  return bass;
}

/** Its audio: { sr, left, right }, about a minute and a half. */
export function render(sr = 32000) {
  const len = Math.ceil(SONG_LENGTH * sr);
  const bass = renderBass(sr), drums = new Float32Array(len), hats = new Float32Array(len);
  const crash = new Float32Array(len), gl = new Float32Array(len), gr = new Float32Array(len);
  let seed = 1000;

  // Sticks count in on the bar before the theme.
  for (let b = 0; b < 4; b++) metal(hats, sr, BAR_START[LEAD_IN - 1] + b * 60 / SLOW, 0.9, 0.012, 90 + b);

  // The drums, bar by bar, busier as the song goes; a fill to end each section.
  for (const blk of BLOCKS) {
    const sec = FORM[blk.section], first = BLOCKS.find(x => x.section === blk.section) === blk;
    if (!sec.drums) continue;
    for (let k = 0; k < blk.riff.bars; k++) {
      const bar = blk.bar + k, t = s => at(bar, s);
      if (blk.riff === ENDING) { // a hit with each stamp, then the last one
        for (const s of k ? [0] : [0, 4, 8, 12]) { kick(drums, sr, t(s), 0.9); snare(drums, sr, t(s), 0.5, seed++); }
        metal(crash, sr, t(0), 0.5, k ? 1.6 : 0.8, 70 + k);
        continue;
      }
      if ((first && k === 0) || (sec.drums === 3 && k % 4 === 0)) metal(crash, sr, t(0), 0.45, 1.1, 71 + k);
      const fill = blk.last && k === blk.riff.bars - 1;
      const kicks = sec.drums === 1 ? [0, 8] : sec.drums === 2 ? [0, 8, 10] : [0, 4, 8, 12, 14];
      for (const s of fill ? [0, 8] : kicks) kick(drums, sr, t(s), 0.9);
      const snares = sec.drums === 1 ? [] : [4, 12];
      for (const s of fill ? [4, 12, 13, 14, 15] : snares) snare(drums, sr, t(s), s > 12 ? 0.4 : 0.6, seed++);
      const step = sec.drums === 1 ? 4 : 2;
      for (let s = 0; s < (fill ? 12 : 16); s += step) metal(hats, sr, t(s), s % 4 ? 0.14 : 0.2, 0.035, seed++);
    }
  }

  // The guitar doubles the bass line in power chords (root, fifth, octave), left and right:
  // muted chugs in the variation, ringing after that.
  const notes = chart().levels[1].notes, dur = sounding(notes);
  notes.forEach((n, i) => {
    const sec = FORM[n.pi - 1];
    if (!sec || !sec.guitar) return;
    const mute = sec.guitar === 'mute', root = OPEN[n.s] + n.f + 12;
    [gl, gr].forEach((out, side) => [0, 7, 12].forEach(iv => pluck(out, sr, n.t + side * 0.007, mute ? Math.min(dur[i], 0.12) : dur[i], () => hz(root + iv),
      { amp: 0.3, bright: mute ? 0.3 : 0.75, t60: mute ? 0.25 : 1.6, seed: seed++, release: 0.03 })));
  });
  // Drive the guitars, then take the fizz off.
  for (const g of [gl, gr]) { for (let i = 0; i < len; i++) g[i] = Math.tanh(5 * g[i]) * 0.45; lowpass(g, sr, 3200); }

  // The mix, as Prowl's: the bass, kick and snare in the middle (where Recorded bass cuts),
  // the guitars either side, the cymbals a little off centre.
  const left = new Float32Array(len), right = new Float32Array(len);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const mid = bass[i] + 0.75 * drums[i];
    left[i] = mid + 0.8 * gl[i] + 0.3 * gr[i] + 0.5 * hats[i] + 0.35 * crash[i];
    right[i] = mid + 0.8 * gr[i] + 0.3 * gl[i] + 0.7 * hats[i] + 0.25 * crash[i];
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const g = 0.89 / (peak || 1);
  for (let i = 0; i < len; i++) { left[i] *= g; right[i] *= g; }
  return { sr, left, right };
}
