// A demo song (demos.js): "Prowl", written for PumaBass, so there's a song to play
// before you've added any of your own (and one to show PumaBass with that is nobody
// else's). Its chart is written here note by note, and its audio is made here too:
// a plucked-string bass, drums and a rhythm guitar (synth.js), so the notes and the
// sound line up exactly.
//
// E minor, 112 BPM. Riff A sits low (open E, frets 0 to 5); the chorus, Riff B,
// moves up the neck in octave jumps (C, D, E); the solo climbs to the 12th fret
// with a slide, a bend and a harmonic. Below 50% Notes it's quarter notes.

import { hz, pluck, lowpass, kick, snare, metal } from './synth.js';

const BPM = 112, BEAT = 60 / BPM, BAR = 4 * BEAT, SLOT = BEAT / 4; // SLOT: a 16th
const E = 0, A = 1, D = 2, G = 3; // strings, low to high
const OPEN = [28, 33, 38, 43];    // the open strings, MIDI: E1 A1 D2 G2
const LEAD_IN = 2;                // bars before the intro: one quiet, one counted in on sticks
const TAIL = 3;                   // s after the last bar, for the harmonic to ring

/* A riff: its bars, its notes ([16th, string, fret, extras]; extras' sus is in 16ths),
 * the same bars made easy (quarter notes), where the hand sits ([16th, fret, width]),
 * and the guitar's power chords under it ([16th, 16ths, root as MIDI]). */
const RIFF_A = {
  bars: 2,
  notes: [
    [0, E, 0], [3, E, 0], [6, A, 2], [8, A, 3], [10, A, 2], [13, E, 3, { sus: 3, slideTo: 5 }],
    [16, E, 0], [19, E, 0], [22, D, 2], [23, D, 0, { pull: true }], [26, A, 2], [28, A, 0], [30, E, 3],
  ],
  easy: [[0, E, 0], [4, E, 0], [8, E, 0], [12, E, 0], [16, E, 0], [20, E, 0], [24, A, 2], [28, E, 3]],
  anchors: [[0, 1, 4]],
  chords: [[0, 32, 40]],
};
const RIFF_B = {
  bars: 2,
  notes: [
    [0, E, 8], [2, E, 8], [4, D, 10], [6, E, 8], [8, E, 10], [10, E, 10], [12, D, 12], [14, E, 10],
    [16, A, 7], [18, A, 7], [20, D, 9], [22, A, 7], [24, D, 9], [26, D, 7], [28, G, 9, { sus: 4, bend: 1 }],
  ],
  easy: [[0, E, 8], [4, E, 8], [8, E, 10], [12, E, 10], [16, A, 7], [20, A, 7], [24, A, 7], [28, A, 7]],
  anchors: [[0, 8, 5], [16, 7, 4]],
  chords: [[0, 8, 48], [8, 8, 50], [16, 16, 40]],
};
const SOLO = {
  bars: 2,
  notes: [
    [0, D, 9], [2, D, 10, { sus: 1, slideTo: 12 }], [4, G, 9], [6, G, 11], [8, G, 12], [10, G, 11], [12, G, 9], [14, D, 12],
    [16, G, 12, { sus: 8, bend: 1 }], [24, E, 12, { sus: 8, harmonic: true }],
  ],
  easy: [[0, D, 9, { sus: 6 }], [8, G, 9, { sus: 6 }], [16, G, 12, { sus: 6 }], [24, E, 12, { sus: 8, harmonic: true }]],
  anchors: [[0, 9, 4], [16, 12, 4]],
  chords: [[0, 32, 40]],
};
const ENDING = {
  bars: 1,
  notes: [[0, E, 0, { sus: 7 }], [8, E, 12, { sus: 16, harmonic: true }]],
  easy: [[0, E, 0, { sus: 7 }], [8, E, 12, { sus: 16, harmonic: true }]],
  anchors: [[0, 1, 4], [8, 12, 4]],
  chords: [[0, 16, 40]],
};

/* The song, section by section: the riffs in order, and what the band plays. */
const FORM = [
  { name: 'intro', riffs: [RIFF_A, RIFF_A] }, // the bass alone
  { name: 'verse', riffs: [RIFF_A, RIFF_A, RIFF_A, RIFF_A], drums: true },
  { name: 'chorus', riffs: [RIFF_B, RIFF_B], drums: true, guitar: 'chug' },
  { name: 'verse', riffs: [RIFF_A, RIFF_A], drums: true, guitar: 'mute' },
  { name: 'chorus', riffs: [RIFF_B, RIFF_B], drums: true, guitar: 'chug' },
  { name: 'solo', riffs: [SOLO, SOLO], drums: true, guitar: 'stab' },
  { name: 'outro', riffs: [RIFF_A, ENDING], drums: true, guitar: 'mute' },
];

const r3 = x => Math.round(x * 1000) / 1000;

/* Every riff laid out in time: { riff, t, section, last } (last: the section's last riff). */
function layout() {
  const out = [];
  let bar = LEAD_IN;
  FORM.forEach((sec, i) => sec.riffs.forEach((riff, k) => {
    out.push({ riff, t: bar * BAR, section: i, last: k === sec.riffs.length - 1 });
    bar += riff.bars;
  }));
  return { blocks: out, bars: bar };
}

const { blocks: BLOCKS, bars: BARS } = layout();
const SONG_LENGTH = r3(BARS * BAR + TAIL);

/** Its row in the song list, shaped like the server's. */
export const SONG = {
  id: 'demo:prowl', songKey: 'PumaBassProwl', title: 'Prowl', artist: 'PumaBass', album: 'Demo', year: 2026,
  length: SONG_LENGTH, arrangement: 'Bass', type: 'bass', represent: true, bonus: false,
  tuning: [0, 0, 0, 0, 0, 0], centOffset: 0, capo: 0, difficulty: 0.15, platform: 'pc',
  sources: ['demo'], audio: 'demo', demo: true,
};

/* A chart note from a riff's note, at time t0 in phrase iteration pi. */
function chartNote([slot, s, f, x = {}], t0, pi) {
  const n = { t: r3(t0 + slot * SLOT), pi, s, f };
  if (x.sus) n.sus = r3(x.sus * SLOT);
  if (x.slideTo !== undefined) n.slideTo = x.slideTo;
  if (x.bend) { n.bend = x.bend; n.bends = [[0.2, x.bend]]; }
  const tech = [x.pull && 'pull', x.hammer && 'hammer', x.harmonic && 'harmonic'].filter(Boolean);
  if (tech.length) n.tech = tech;
  return n;
}

/** The chart, shaped like the server's (server/library.js: buildChart). */
export function chart() {
  const phrases = [{ name: 'COUNT', maxDifficulty: 0 }];
  const phraseOf = new Map();
  for (const sec of FORM) if (!phraseOf.has(sec.name)) { phraseOf.set(sec.name, phrases.length); phrases.push({ name: sec.name, maxDifficulty: 1 }); }
  phrases.push({ name: 'END', maxDifficulty: 0 });
  // A phrase iteration per section, between the count-in and the end.
  const starts = FORM.map((_, i) => BLOCKS.find(b => b.section === i).t);
  const ends = FORM.map((_, i) => (i + 1 < FORM.length ? starts[i + 1] : BARS * BAR));
  const phraseIterations = [
    { phrase: 0, t: 0, end: r3(starts[0]) },
    ...FORM.map((sec, i) => ({ phrase: phraseOf.get(sec.name), t: r3(starts[i]), end: r3(ends[i]) })),
    { phrase: phrases.length - 1, t: r3(BARS * BAR), end: SONG_LENGTH },
  ];
  const sections = FORM.map((sec, i) => ({ name: sec.name, t: r3(starts[i]), end: r3(ends[i]) }));

  const level = (difficulty, pick) => {
    const notes = [], anchors = [
      { t: 0, end: r3(starts[0]), fret: 1, width: 4, pi: 0 },
      { t: r3(BARS * BAR), end: SONG_LENGTH, fret: 1, width: 4, pi: phraseIterations.length - 1 },
    ];
    for (const b of BLOCKS) {
      const pi = b.section + 1, end = b.t + b.riff.bars * BAR;
      for (const n of pick(b.riff)) notes.push(chartNote(n, b.t, pi));
      b.riff.anchors.forEach(([slot, fret, width], k, all) => {
        const next = all[k + 1];
        anchors.push({ t: r3(b.t + slot * SLOT), end: r3(next ? b.t + next[0] * SLOT : end), fret, width, pi });
      });
    }
    return { difficulty, notes, anchors: anchors.sort((a, b) => a.t - b.t), handShapes: [] };
  };

  const beats = [];
  for (let k = 0; k * BEAT < SONG_LENGTH; k++) beats.push({ t: r3(k * BEAT), m: k % 4 === 0 ? k / 4 : null });
  return {
    id: SONG.id, title: SONG.title, artist: SONG.artist, album: SONG.album, year: SONG.year,
    arrangement: 'Bass', type: 'bass', strings: 4, tuning: [0, 0, 0, 0], centOffset: 0, capo: 0,
    songLength: SONG_LENGTH, beats, sections, phrases, phraseIterations, chordTemplates: [], maxDifficulty: 1,
    levels: [level(0, r => r.easy), level(1, r => r.notes)],
  };
}

/* ---- the sound ---- */

/** The bass alone: every note of the full chart, each ringing until the next (or for its sustain). */
export function renderBass(sr = 32000) {
  const len = Math.ceil(SONG_LENGTH * sr), bass = new Float32Array(len);
  let seed = 11;
  const notes = chart().levels[1].notes;
  notes.forEach((n, i) => {
    const next = notes[i + 1], gap = next ? next.t - n.t : 2;
    const dur = n.sus ? n.sus : Math.min(gap - 0.012, 0.9);
    const base = n.tech && n.tech.includes('harmonic') ? OPEN[n.s] + 12 : OPEN[n.s] + n.f;
    const slide = n.slideTo !== undefined ? n.slideTo - n.f : 0;
    const freqAt = tr => {
      let st = 0;
      if (slide) st = slide * Math.min(1, tr / Math.max(0.05, (n.sus || SLOT) * 0.8));
      if (n.bend) st = n.bend * Math.min(1, Math.max(0, tr - 0.02) / 0.18);
      return hz(base + st);
    };
    const soft = n.tech && n.tech.includes('pull');
    const harm = n.tech && n.tech.includes('harmonic');
    pluck(bass, sr, n.t, dur, freqAt, { amp: soft ? 0.55 : harm ? 0.6 : 0.85, bright: harm ? 0.12 : soft ? 0.2 : 0.32, t60: harm ? 5 : 2.6, seed: seed++ });
  });
  lowpass(bass, sr, 2400);
  for (let i = 0; i < len; i++) bass[i] = Math.tanh(1.6 * bass[i]) / 1.3;
  return bass;
}

/** Its audio: { sr, left, right }, about a minute and a quarter. */
export function render(sr = 32000) {
  const len = Math.ceil(SONG_LENGTH * sr);
  const bass = renderBass(sr), drums = new Float32Array(len), hats = new Float32Array(len);
  const crash = new Float32Array(len), gl = new Float32Array(len), gr = new Float32Array(len);
  let seed = 1000;

  // Sticks count in on the bar before the intro.
  for (let b = 0; b < 4; b++) metal(hats, sr, (LEAD_IN - 1) * BAR + b * BEAT, 0.9, 0.012, 90 + b);

  for (const blk of BLOCKS) {
    const sec = FORM[blk.section], first = BLOCKS.find(x => x.section === blk.section) === blk;
    for (let bar = 0; bar < blk.riff.bars; bar++) {
      const t0 = blk.t + bar * BAR, end = blk.riff === ENDING;
      const fill = blk.last && bar === blk.riff.bars - 1 && !end;
      if (sec.drums) {
        if (end) { kick(drums, sr, t0, 0.9); metal(crash, sr, t0, 0.5, 1.4, 70); continue; }
        if (first && bar === 0) metal(crash, sr, t0, 0.45, 1.1, 71);
        for (const s of fill ? [0, 8] : [0, 8, 10]) kick(drums, sr, t0 + s * SLOT, 0.9);
        for (const s of fill ? [4, 12, 13, 14, 15] : [4, 12]) snare(drums, sr, t0 + s * SLOT, s > 12 ? 0.4 : 0.6, seed++);
        for (let s = 0; s < (fill ? 12 : 16); s += 2) metal(hats, sr, t0 + s * SLOT, s % 4 ? 0.14 : 0.2, 0.035, seed++);
      }
      if (!sec.guitar) continue;
      // The guitar: power chords (root, fifth, octave), doubled left and right.
      for (const [slot, slots, root] of blk.riff.chords) {
        const lo = bar * 16, hi = lo + 16;
        for (let s = Math.max(slot, lo); s < Math.min(slot + slots, hi); s++) {
          const ring = end || (sec.guitar === 'stab' && (s % 16 === 0 || s % 16 === 10));
          if (!ring && (sec.guitar === 'stab' || s % 2)) continue;
          const mute = sec.guitar === 'mute' && !end;
          const dur = ring ? (end ? 2.5 : 5 * SLOT) : 2 * SLOT - 0.02;
          [gl, gr].forEach((out, side) => [0, 7, 12].forEach(iv => pluck(out, sr, blk.t + s * SLOT + side * 0.007, dur, () => hz(root + iv),
            { amp: 0.32, bright: mute ? 0.3 : 0.75, t60: mute ? 0.25 : 1.6, seed: seed++, release: 0.03 })));
        }
      }
    }
  }
  // Drive the guitars, then take the fizz off.
  for (const g of [gl, gr]) { for (let i = 0; i < len; i++) g[i] = Math.tanh(5 * g[i]) * 0.45; lowpass(g, sr, 3200); }

  // The mix: the bass, kick and snare in the middle (where Recorded bass cuts), the guitars
  // either side, the cymbals a little off centre.
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
