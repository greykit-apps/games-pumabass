// The title's sound (games-meta STANDARD.md §14, the integrated intro, as PumaBass takes it):
// canon's meow on the boot, the menu's tick, and the theme, a bass groove played live, going
// round under the title for as long as it's up (owner's decision, 2026-10-22). It plays in the
// mixer's AudioContext but beside the mixer, not through it: the Mix's levels are for songs.
//
//   meow, ticks -> effects -------------------------------> Sound -> speakers
//   theme -> its fades (in, out, hushed for the tuner) -> Music ----^
//
// Sound (top right, and M on the title) is the master; Music, beside it, is the theme alone.
// Both are only the title's: a song always plays (Settings has no mute, and M while playing
// is the Mix).

import { mixer } from './core.js';
import { prefs, savePrefs } from './store.js';
import { gkBootSound } from './title.js';

const ac = mixer.ctx;
const master = ac.createGain(), fx = ac.createGain();
fx.connect(master);
master.connect(ac.destination);
master.gain.value = prefs.titleSound === false ? 0 : 1;
const music = ac.createGain(), level = ac.createGain();
level.gain.value = 0;
level.connect(music).connect(master);
music.gain.value = prefs.titleMusic === false ? 0 : 1;

export const titleAudio = () => ac;

/** startIntro's bootSound: canon's meow, as canon plays it, but through the title's Sound
 * switch, so a player who turned the title's sound off boots in silence too. */
export function bootMeow(ctx, out, opts) {
  gkBootSound(ac, fx, opts);
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

/* ---- the theme ----
 * Twelve bars of bass groove, 48 beats at 111.8 BPM, made into a seamless loop from a live take
 * (tools/make-theme.py). It starts as the title comes up, fades out as the title goes (and
 * carries on, if the title comes straight back), and goes quiet while the tuner is up. Its
 * beat is the painting's (themeBeats). */
const AUDIO = name => new URL(`../audio/${name}`, import.meta.url).href;
let theme = null;
const themeReady = Promise.all([
  fetch(AUDIO('theme.m4a')).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)),
  fetch(AUDIO('theme.json')).then(r => r.json()),
]).then(([buffer, m]) => (theme = { buffer, ...m }), () => null);
let src = null, startedAt = 0, wanted = false, hushed = false, ending = 0;
const fade = (to, tc) => { level.gain.cancelScheduledValues(ac.currentTime); level.gain.setTargetAtTime(to, ac.currentTime, tc); };

/** The title is up: the theme from its top (or on, if it's still fading out). */
export function startTheme() {
  wanted = true;
  clearTimeout(ending);
  themeReady.then(() => {
    if (!theme || !wanted) return;
    if (!src) {
      src = ac.createBufferSource();
      src.buffer = theme.buffer;
      src.loop = true;
      src.loopEnd = theme.beat * theme.beats;
      src.connect(level);
      startedAt = ac.currentTime + 0.05;          // a context held back till the press starts it then
      src.start(startedAt);
    }
    fade(hushed ? 0 : 1, 0.25);
  });
}
/** The title has gone: the theme fades out, and stops once it has. */
export function stopTheme() {
  wanted = false;
  fade(0, 0.2);
  clearTimeout(ending);
  ending = setTimeout(() => { if (src && !wanted) { src.stop(); src.disconnect(); src = null; } }, 1200);
}
/** Quiet while the tuner listens, and back after. */
export function hushTheme(on) {
  hushed = on;
  if (src && wanted) fade(on ? 0 : 1, on ? 0.08 : 0.4);
}
/** Where the theme is in its beats, as heard (the output's delay taken off), or null when it isn't
 * playing; and its beat, in seconds. */
export function themeBeats() {
  if (!src || !theme || ac.state !== 'running') return null;
  const heard = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) - startedAt;
  return heard < 0 ? null : (heard / theme.beat) % theme.beats;
}
export const themeBeat = () => (theme ? theme.beat : 60 / 111.78);

/* ---- the switches (gkToggles) ---- */
export const toggles = {
  music: {
    get: () => prefs.titleMusic !== false,
    set: on => { prefs.titleMusic = on; savePrefs(); music.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05); },
  },
  sound: {
    get: () => prefs.titleSound !== false,
    set: on => { prefs.titleSound = on; savePrefs(); master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); },
  },
};
