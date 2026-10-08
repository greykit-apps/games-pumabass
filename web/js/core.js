// What every part of PumaBass shares: the page's elements, the song's audio
// element and the mixer it plays through, the highway, the instrument input,
// the sound switch (games-meta STANDARD.md §8), what is on screen, and the
// song library as the server last listed it.

import { Highway } from './highway.js';
import { InstrumentInput } from './input.js';
import { Mixer } from './mixer.js';
import { KEY_MUTED } from './store.js';

export const $ = id => document.getElementById(id);
export const audio = $('audio');
// The song and your bass both play through the mixer, so they can be balanced.
export const mixer = new Mixer();
mixer.attachSong(audio);
export const highway = new Highway($('highway'));
// The instrument input: the Real Tone Cable (web/js/input.js).
export const input = new InstrumentInput(mixer);


export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- sound (games-meta STANDARD.md §8): M anywhere, saved as "1" or "0".
 * PumaBass's only sound is the song, so muting it mutes the song. */
export let muted = (() => { try { return localStorage.getItem(KEY_MUTED) === '1'; } catch (e) { return false; } })();
mixer.setMuted(muted);
export function setMuted(m) {
  muted = m;
  mixer.setMuted(m);
  try { localStorage.setItem(KEY_MUTED, m ? '1' : '0'); } catch (e) { /* no storage */ }
  renderSoundButtons();
}
/* The header's sound switch: always named Sound, pressed while it is on. */
export function soundButton() {
  const waves = muted ? '<path d="M11 6l4 4M15 6l-4 4"/>' : '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3a7 7 0 0 1 0 10"/>';
  return `<button class="snd" data-act="mute" aria-label="Sound" aria-pressed="${!muted}" title="Sound ${muted ? 'off' : 'on'} (M)"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="spk" d="M2 6h3l4-3v10l-4-3H2z"/>${waves}</svg></button>`;
}
export function renderSoundButtons() { for (const el of document.querySelectorAll('.snd-slot')) el.innerHTML = soundButton(); }
document.addEventListener('click', e => { if (e.target.closest('.snd')) setMuted(!muted); });
renderSoundButtons();


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
