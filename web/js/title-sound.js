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
 * The Macintosh's startup chord as the later Macs played it, F-sharp major, on a piano: both
 * hands spread across three octaves, F#2 C#3 F#3 under A#3 C#4 F#4 A#4, the notes a few
 * milliseconds apart from the bottom up as hands strike. (Jim Reekes's first, for the Quadra in
 * 1991, was C major, after the long chord that ends the Beatles' "A Day in the Life".)
 * Synthesized, so nothing is fetched. Each note is two strings a cent or two apart, so they
 * beat as a piano's unisons do; its tone darkens as it rings (a lowpass closing, standing in
 * for the high partials dying first); it falls fast, then rings on long, the bass longest; a
 * thump of the hammer starts it; and a small room carries it. */
const CHORD = [92.5, 138.59, 185.0, 233.08, 277.18, 369.99, 466.16]; // F#2 C#3 F#3 A#3 C#4 F#4 A#4
const ROLL = 0.008; // seconds between one note's strike and the next, bottom up
let pianoWave = null, room = null;
function pianoRoom() {
  if (room) return room;
  // A small room: 1.8 s of noise falling away.
  const len = Math.round(ac.sampleRate * 1.8), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  room = ac.createConvolver();
  room.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.22;
  room.connect(wet).connect(fx);
  return room;
}
// A struck string's partials: strong low ones, the rest falling away, the even ones a little
// weaker where the hammer strikes.
function pianoTone() {
  if (pianoWave) return pianoWave;
  const n = 14, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.7) / Math.pow(k, 1.35);
  return (pianoWave = ac.createPeriodicWave(re, im));
}
function pianoNote(f, at, level) {
  const bass = 110 / f;                                  // > 1 below A2: rings longer
  const lp = ac.createBiquadFilter(), g = ac.createGain();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(Math.min(12000, f * 14), at);
  lp.frequency.setTargetAtTime(Math.max(f * 2.2, 500), at + 0.02, 0.6);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.003);
  g.gain.setTargetAtTime(level * 0.4, at + 0.003, 0.18);                         // the prompt sound
  g.gain.setTargetAtTime(0, at + 0.4, 1.1 * Math.pow(bass, 0.4) + 0.4);           // the aftersound
  lp.connect(g);
  g.connect(fx);
  g.connect(pianoRoom());
  for (const cents of [-1.2, 1.4]) {
    const o = ac.createOscillator();
    o.setPeriodicWave(pianoTone());
    o.frequency.value = f;
    o.detune.value = cents;
    o.connect(lp);
    o.start(at);
    o.stop(at + 7);
  }
  // the hammer: a few milliseconds of felt-dulled noise
  const n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 0.025 | 0, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  n.buffer = buf;
  const bp = ac.createBiquadFilter(), hg = ac.createGain();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(3000, f * 6);
  bp.Q.value = 0.8;
  hg.gain.value = level * 0.5;
  n.connect(bp).connect(hg).connect(fx);
  n.start(at);
}

/** Strike the chime at `at` (the context's time), into the title's effects. */
export function chime(at = null) {
  // Struck inside the press that lets sound play, the context may be a moment from running.
  if (ac.state !== 'running') { if (at === null) ac.resume().then(() => { if (ac.state === 'running') chime(); }, () => {}); return; }
  if (at === null) at = ac.currentTime + 0.02;
  // The low notes carry the weight, the top A-sharp sings over the middle.
  CHORD.forEach((f, i) => pianoNote(f, at + i * ROLL, (i < 3 ? 0.044 : 0.032) * (i === CHORD.length - 1 ? 1.25 : 1)));
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
