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
 * The Macintosh's startup chime as Jim Reekes made it for the Quadra (1991): a C major chord
 * spread wide, with a high E in the top voice, struck, swelling a moment and ringing away. He
 * named the Beatles' "A Day in the Life" as where it came from: the long chord that ends it.
 * Synthesized, so nothing is fetched: per voice two slightly detuned oscillators of a few
 * harmonics, through a lowpass that opens on the strike and closes as it rings, into a
 * short room. */
const CHORD = [65.41, 98.0, 130.81, 196.0, 261.63, 329.63, 392.0, 523.25, 659.26]; // C2 G2 C3 G3 C4 E4 G4 C5 E5
let chimeWave = null, room = null;
function chimeRoom() {
  if (room) return room;
  // A small hall: 2.4 s of noise falling away, a little brighter at the start.
  const len = Math.round(ac.sampleRate * 2.4), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  room = ac.createConvolver();
  room.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.32;
  room.connect(wet).connect(fx);
  return room;
}

/** Strike the chime at `at` (the context's time), into the title's effects. */
export function chime(at = null) {
  // Struck inside the press that lets sound play, the context may be a moment from running.
  if (ac.state !== 'running') { if (at === null) ac.resume().then(() => { if (ac.state === 'running') chime(); }, () => {}); return; }
  if (at === null) at = ac.currentTime + 0.02;
  if (!chimeWave) chimeWave = ac.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.42, 0.2, 0.09, 0.04]));
  const bus = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(5200, at + 0.05);
  lp.frequency.exponentialRampToValueAtTime(1400, at + 2.6);
  bus.gain.value = 0.55;
  lp.connect(bus);
  bus.connect(fx);
  bus.connect(chimeRoom());
  CHORD.forEach((f, i) => {
    // The low voices carry the weight, the top E rings out over them.
    const level = (i < 2 ? 0.07 : 0.05) * (i === CHORD.length - 1 ? 1.3 : 1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.012);
    g.gain.setTargetAtTime(level * 0.7, at + 0.012, 0.12);
    g.gain.setTargetAtTime(0, at + 0.5, 0.9 + (CHORD.length - i) * 0.06); // the low notes ring longest
    g.connect(lp);
    for (const cents of [-4, 4]) {
      const o = ac.createOscillator();
      o.setPeriodicWave(chimeWave);
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(g);
      o.start(at);
      o.stop(at + 6);
    }
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
