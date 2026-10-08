// What every part of PumaBass shares: the page's elements, the song's audio
// element and the mixer it plays through, the highway, the instrument input,
// what is on screen, and the
// song library as the server last listed it.

import { Highway } from './highway.js';
import { InstrumentInput } from './input.js';
import { Mixer } from './mixer.js';

export const $ = id => document.getElementById(id);
export const audio = $('audio');
// The song and your bass both play through the mixer, so they can be balanced.
export const mixer = new Mixer();
mixer.attachSong(audio);
export const highway = new Highway($('highway'));
// The instrument input: the Real Tone Cable (web/js/input.js).
export const input = new InstrumentInput(mixer);


export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- timing ---- */
export const fmtMs = ms => `${ms > 0 ? '+' : ms < 0 ? '\u2212' : ''}${Math.abs(Math.round(ms))} ms`;


export let toastTimer = 0;
export function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1400);
}


/* ---- what is on screen, and the song library: read anywhere, changed through these ---- */
export let screen = 'title';
export let songs = [];
export let info = {};
export function setScreen(s) { screen = s; }
export function setLibrary(list, about) { songs = list; info = about; }
export function setInfo(about) { info = about; }
