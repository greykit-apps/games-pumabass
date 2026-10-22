// The title's sound (games-meta STANDARD.md §14, the integrated intro, as PumaBass takes it):
// the chime the boot plays and the menu's tick. No title music, on purpose: you come to the
// title on the way to a song you want to play, and a tune of its own every time would wear
// thin (owner's decision, 2026-10-21). It plays in the mixer's AudioContext but beside the
// mixer, not through it: the Mix's levels are for songs.
//
//   chime, ticks -> effects -> Sound (the title's switch) -> speakers
//
// Sound is the title's one switch, top right, and M on the title; it is only the title's: a
// song always plays (Settings has no mute, and M while playing is the Mix).

import { mixer } from './core.js';
import { prefs, savePrefs } from './store.js';

const ac = mixer.ctx;
const master = ac.createGain(), fx = ac.createGain();
fx.connect(master);
master.connect(ac.destination);
master.gain.value = prefs.titleSound === false ? 0 : 1;

export const titleAudio = () => ac;

/* ---- the chime ----
 * The Macintosh's startup chord as the later Macs played it, F-sharp major, on an upright bass:
 * all four strings plucked in one roll of the thumb from the low E up, a shape that sits under
 * the hand at the second to fourth frets (E string F#1, A string C#2, D string F#2, G string
 * A#2). (Jim Reekes's first chime, for the Quadra in 1991, was C major, after the long chord
 * that ends the Beatles' "A Day in the Life".)
 * Each string is a plucked-string model (Karplus-Strong), worked out once into a buffer: a
 * round finger's pluck a fifth of the way along the string, travelling up and down it and
 * losing its top end each time, so the note starts woody and rings warm, the low strings
 * longest. Then the instrument's body: a bump in the low mids where the wood resonates, and
 * the top rolled off. Nothing is fetched. */
const STRINGS = [46.25, 69.3, 92.5, 116.54]; // F#1 C#2 F#2 A#2: the E, A, D and G strings
const ROLL = 0.028;                          // seconds from one string to the next, under the thumb
const RING = [5, 4.5, 4, 3.5];               // seconds each string's fundamental takes to fall 60 dB
const plucks = new Map();
function pluck(f, ring) {
  const key = f + '/' + ring;
  if (plucks.has(key)) return plucks.get(key);
  const sr = ac.sampleRate, len = Math.round(sr * (ring + 0.2)), n = Math.round(sr / f);
  const out = new Float32Array(len), line = new Float32Array(n);
  // The pluck: the string pulled into a triangle, its peak a fifth of the way along, with a
  // little roughness from the fingertip, smoothed.
  const at = Math.round(n / 5);
  for (let i = 0; i < n; i++) line[i] = (i < at ? i / at : (n - i) / (n - at)) + (Math.random() * 2 - 1) * 0.06;
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n; i++) line[i] = 0.5 * (line[i] + line[i - 1]);
  let mean = 0;
  for (const v of line) mean += v / n;
  for (let i = 0; i < n; i++) line[i] -= mean;
  // Round the string: each pass averages neighbours (the top end goes first) and loses what
  // takes it 60 dB down in `ring` seconds.
  const loss = Math.pow(10, -3 / (ring * f));
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const j = i % n, v = line[j];
    out[i] = v;
    line[j] = loss * 0.5 * (v + prev);
    prev = v;
  }
  const buf = ac.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  plucks.set(key, buf);
  return buf;
}
let body = null;
function bassBody() {
  if (body) return body;
  // The wood: a resonance in the low mids, a little presence where the finger meets the
  // string, and the top rolled off.
  const wood = ac.createBiquadFilter(), bite = ac.createBiquadFilter(), top = ac.createBiquadFilter();
  wood.type = 'peaking'; wood.frequency.value = 180; wood.Q.value = 1.1; wood.gain.value = 6;
  bite.type = 'peaking'; bite.frequency.value = 900; bite.Q.value = 0.9; bite.gain.value = 6;
  top.type = 'lowpass'; top.frequency.value = 2600; top.Q.value = 0.5;
  wood.connect(bite).connect(top).connect(fx);
  return (body = wood);
}

/** Strike the chime at `at` (the context's time), into the title's effects. */
export function chime(at = null) {
  // Struck inside the press that lets sound play, the context may be a moment from running.
  if (ac.state !== 'running') { if (at === null) ac.resume().then(() => { if (ac.state === 'running') chime(); }, () => {}); return; }
  if (at === null) at = ac.currentTime + 0.02;
  STRINGS.forEach((f, i) => {
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = pluck(f, RING[i]);
    g.gain.value = 0.22;
    src.connect(g).connect(bassBody());
    src.start(at + i * ROLL);
  });
}

/* When canon's logo pulses (gk-intro.js: it glints from 1.15 s to GK_LOGO_END, 1.85 s). */
const LOGO_PULSE = 1.15, LOGO_END = 1.85;
let chimed = false;
/** startIntro's bootSound: the chime, struck as the face pulses. */
export function bootChime(ctx, out, { since = 0 } = {}) {
  if (since > LOGO_END) return;
  chimed = true;
  chime(ac.currentTime + Math.max(0.02, LOGO_PULSE - since));
}
/** The press after a cold load: the boot was silent, so the chime comes now, as the title
 * comes up. */
export function chimeOnce() {
  if (chimed) return;
  chimed = true;
  chime();
}

/* ---- the menu's tick: a pick on a muted string ----
 * A click of the pick and a short damped note under it, pitched along the A minor pentatonic
 * from the top of the menu down, so a run down the rows plays a little scale. */
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // A3 C4 D4 E4 G4 A4 C5 D5
export function tick(row = 0) {
  if (ac.state !== 'running') return;
  const t = ac.currentTime, f = SCALE[Math.max(0, Math.min(SCALE.length - 1, row))];
  const bus = ac.createGain();
  bus.gain.value = 0.16;
  bus.connect(fx);
  // the pick: a few ms of noise, bright
  const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 0.008 | 0, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  n.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = ac.createGain();
  ng.gain.value = 0.35;
  n.connect(hp).connect(ng).connect(bus);
  n.start(t);
  // the string, palm-muted: gone in a tenth of a second
  const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.value = f;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * 6, t);
  lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  o.connect(lp).connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.13);
}

/* ---- the switches (gkToggles) ---- */
export const toggles = {
  sound: {
    get: () => prefs.titleSound !== false,
    set: on => { prefs.titleSound = on; savePrefs(); master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); },
  },
};
