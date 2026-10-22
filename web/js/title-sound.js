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
 * Both of the Macintosh's startup chords, one after the other: C major with a high E on top, as
 * Jim Reekes made it for the Quadra (1991) after the long chord that ends the Beatles' "A Day in
 * the Life", then F-sharp major, as the later Macs played it. Played as chiptune, on the three
 * voices of an 8-bit console, each changing note as a chip's channel does: a pulse picks up G
 * and C and lands on the high E as the logo pulses, steps up to F-sharp and holds it with a
 * vibrato; a second pulse plays each chord the chiptune way, arpeggiated a couple of frames a
 * note, too fast to hear as notes; and the triangle holds the root underneath. Every volume
 * falls in sixteen steps, as those chips' did. Synthesized, so nothing is fetched, and dry:
 * those machines had no room. */
const N = { C3: 130.81, Fs3: 185.0, G4: 392.0, C4: 261.63, E4: 329.63, Fs4: 369.99, As4: 466.16, C5: 523.25, Cs5: 554.37, E5: 659.26, Fs5: 739.99 };
const CHORDS = [
  { lead: N.E5, arp: [N.C4, N.E4, N.G4, N.C5], bass: N.C3 },      // C major
  { lead: N.Fs5, arp: [N.Fs4, N.As4, N.Cs5, N.Fs5], bass: N.Fs3 }, // F-sharp major
];
const FRAME = 1 / 60, NEXT = 0.4, RING = 2; // seconds to the second chord, and its ring
const pulses = {};
// A pulse wave of the given duty (0.125, 0.25, 0.5), as the chips' square channels made them.
function pulse(duty) {
  if (pulses[duty]) return pulses[duty];
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI); im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI); }
  return (pulses[duty] = ac.createPeriodicWave(re, im));
}
// One voice: full at t0, a step down on the first chord, then from `fall` to nothing in sixteen
// steps over RING seconds.
function voice(wave, t0, peak, at, fall) {
  const o = ac.createOscillator(), g = ac.createGain();
  if (wave === 'triangle') o.type = 'triangle'; else o.setPeriodicWave(pulse(wave));
  g.gain.setValueAtTime(peak, t0);
  g.gain.setValueAtTime(peak * 0.8, at + NEXT / 2);
  for (let k = 0; k <= 15; k++) g.gain.setValueAtTime(peak * (15 - k) / 15, fall + (RING * k) / 15);
  o.connect(g).connect(fx);
  o.start(t0);
  o.stop(fall + RING + 0.05);
  return o;
}

/** Strike the chime at `at` (the context's time), into the title's effects: the high E lands
 * then, its pickup a moment before, and the F-sharp chord NEXT seconds after. */
export function chime(at = null) {
  // Struck inside the press that lets sound play, the context may be a moment from running.
  if (ac.state !== 'running') { if (at === null) ac.resume().then(() => { if (ac.state === 'running') chime(); }, () => {}); return; }
  if (at === null) at = ac.currentTime + 0.12;
  const pick = Math.max(ac.currentTime + 0.01, at - 6 * FRAME), at2 = at + NEXT;
  // Pulse 1 (25%): the pickup, G4 then C5, three frames each, onto the high E; then up to the
  // F-sharp, held and wavering.
  const lead = voice(0.25, pick, 0.075, at, at2);
  lead.frequency.setValueAtTime(N.G4, pick);
  lead.frequency.setValueAtTime(N.C5, pick + 3 * FRAME);
  CHORDS.forEach((c, i) => lead.frequency.setValueAtTime(c.lead, i ? at2 : at));
  const lfo = ac.createOscillator(), depth = ac.createGain();
  lfo.frequency.value = 6;
  depth.gain.setValueAtTime(0, at);
  depth.gain.setValueAtTime(18, at2 + 0.3); // cents, once the last note has sounded plain
  lfo.connect(depth).connect(lead.detune);
  lfo.start(at);
  lfo.stop(at2 + RING + 0.1);
  // Pulse 2 (12.5%): each chord round and round, two frames a note.
  const arp = voice(0.125, at, 0.06, at, at2);
  for (let k = 0; at + k * 2 * FRAME < at2 + RING; k++) {
    const t = at + k * 2 * FRAME, c = CHORDS[t < at2 ? 0 : 1];
    arp.frequency.setValueAtTime(c.arp[k % 4], t);
  }
  // The triangle: each chord's root underneath.
  const bass = voice('triangle', at, 0.2, at, at2);
  CHORDS.forEach((c, i) => bass.frequency.setValueAtTime(c.bass, i ? at2 : at));
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
