// The instrument input in use: choosing it, hearing it, the mix, and the tuner.

import { tuningName, tuningNotes } from './chart.js';
import { alertSheet } from './title.js';
import { InstrumentInput, isRealTone } from './input.js';
import { openTuner, tuningTargets, tuningKey } from './tuner.js';
import { RECORDED_BASS } from './mixer.js';
import { $, mixer, input, esc, screen, songs } from './core.js';
import { title, showTitle, leaveTitle } from './menu.js';
import { chart, song, startScoring, syncPlayerPrefs } from './player.js';
import { KEY_RESUME, KEY_TUNER, load, save, prefs, savePrefs } from './store.js';

/* ---- the instrument input and the tuner ---- */
input.onchange = () => {
  if (screen === 'title' && title && !document.querySelector('.gk-sheet')) { leaveTitle(); showTitle().reveal(); }
  if (screen === 'player') startScoring();
};
export const shortLabel = l => (isRealTone(l) ? 'Real Tone Cable' : String(l || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, ''));
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
export const INPUT_UNSUPPORTED = "This browser won't let PumaBass use audio inputs at this address. Open PumaBass as http://localhost:8014/ on the computer it runs on.";

export function inputStatus() {
  if (!InstrumentInput.supported()) return INPUT_UNSUPPORTED;
  if (!prefs.input) return 'None chosen yet. Plug in the Real Tone Cable and choose it here.';
  return `<b>${esc(shortLabel(prefs.input.label))}</b>${isRealTone(prefs.input.label) ? '' : ` (${esc(prefs.input.label)})`}${input.open ? ' · listening' : ''}`;
}

export function inputError(e) {
  if (e && e.name === 'NotAllowedError') return "PumaBass wasn't allowed to use audio inputs. Allow it in the browser's settings for this site (the icon left of the address), then try again.";
  if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) return "That input isn't connected. Plug it in, or choose another.";
  return (e && e.message) || "The input couldn't be opened.";
}

/* "Hear your bass": the input through the speakers. (The tuner's switch uses
 * volume/last/set: on is 1, off is 0.) */
export const hear = {
  get volume() { return prefs.hear ? 1 : 0; },
  last: 1,
  set(v) {
    prefs.hear = !!v;
    savePrefs();
    applyMix();
    syncPlayerPrefs();
  },
};

/* Everything the mixer does, from prefs: song volume, the recorded bass, and your bass. */
export async function applyMix() {
  mixer.setSongVolume(prefs.volume / 100);
  mixer.setRecordedBass(prefs.recordedBass);
  mixer.setBassBoost(prefs.bassBoost);
  if (prefs.hear && !input.open && prefs.input) await ensureInput({ ask: false });
  mixer.setHearBass(prefs.hear && input.open);
}

export function setRecordedBass(mode) {
  prefs.recordedBass = RECORDED_BASS[mode] ? mode : 'full';
  savePrefs();
  applyMix();
  syncPlayerPrefs();
}


/* Open the chosen input, or the Real Tone Cable if none was chosen and one is
 * plugged in. ask: when nothing suitable is there, offer the list of inputs. */
export async function ensureInput({ ask = true } = {}) {
  if (input.open) return true;
  if (!InstrumentInput.supported()) { if (ask) await alertSheet(INPUT_UNSUPPORTED, 'No instrument input'); return false; }
  try {
    const list = await input.devices();
    const d = prefs.input
      ? list.find(x => x.id === prefs.input.id) || list.find(x => x.label === prefs.input.label)
      : list.find(x => x.realTone);
    if (d) {
      await input.openDevice(d.id);
      prefs.input = { id: d.id, label: d.label };
      savePrefs();
      applyMix();
      return true;
    }
  } catch (e) {
    if (ask) await alertSheet(inputError(e), 'No instrument input');
    return false;
  }
  return ask ? chooseInput() : false;
}

/* The audio inputs to choose from, the Real Tone Cable marked. Resolves true once one is open. */
export function chooseInput() {
  return new Promise(async resolve => {
    if (document.querySelector('.gk-sheet')) return resolve(false);
    if (!InstrumentInput.supported()) { await alertSheet(INPUT_UNSUPPORTED, 'No instrument input'); return resolve(false); }
    const back = document.activeElement;
    const el = document.createElement('div');
    el.className = 'gk-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Instrument input');
    const frame = body => `<div class="gk-box"><div class="gk-head"><h2>Instrument input</h2><button data-x aria-label="Close">&times;</button></div><div class="gk-body">${body}</div></div>`;
    el.innerHTML = frame('<p>Looking for audio inputs\u2026 The browser may ask to let PumaBass use them.</p>');
    document.body.appendChild(el);
    const close = v => { document.removeEventListener('keydown', onKey, true); el.remove(); if (back && back.isConnected) back.focus({ preventScroll: true }); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } else e.stopPropagation(); };
    document.addEventListener('keydown', onKey, true);
    let list;
    try { list = await input.devices(); } catch (e) {
      el.innerHTML = frame(`<p>${esc(inputError(e))}</p><div class="gk-row"><button data-x>OK</button></div>`);
      el.addEventListener('click', ev => { if (ev.target === el || ev.target.closest('[data-x]')) close(false); });
      el.querySelector('[data-x]').focus();
      return;
    }
    list.sort((a, b) => b.realTone - a.realTone);
    const draw = (note = '') => {
      el.innerHTML = frame(`<p>${list.some(d => d.realTone) ? 'Your Real Tone Cable is listed first.' : 'No Real Tone Cable is plugged in. Plug it in and press Look again, or choose another input.'}</p>
        <div class="folders">${list.map(d => `<button data-id="${esc(d.id)}" aria-pressed="${!!(prefs.input && prefs.input.id === d.id)}">${esc(d.label)}${d.realTone ? ' \u00b7 Real Tone Cable' : ''}</button>`).join('') || '<p class="gk-note">No audio inputs found.</p>'}</div>
        ${note ? `<p class="gk-note warn">${esc(note)}</p>` : ''}
        <div class="gk-row"><button data-again>Look again</button><button data-x>Cancel</button></div>`);
      (el.querySelector('.folders button') || el.querySelector('[data-again]')).focus();
    };
    el.addEventListener('click', async ev => {
      if (ev.target === el) return close(false);
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-x')) return close(false);
      if (b.hasAttribute('data-again')) { list = (await input.devices()).sort((a, c) => c.realTone - a.realTone); return draw(); }
      if (b.dataset.id) {
        try {
          await input.openDevice(b.dataset.id);
          prefs.input = { id: b.dataset.id, label: list.find(d => d.id === b.dataset.id).label };
          savePrefs();
          applyMix();
          close(true);
        } catch (e) { draw(inputError(e)); }
      }
    });
    draw();
  });
}

/* The tuning the tuner aims for: the open song's, else the last song you played, else standard. */
export function tunerContext() {
  const ofSong = s => ({ tuning: s.tuning, strings: s.strings || (s.type === 'bass' ? 4 : 6), centOffset: s.centOffset || 0 });
  const resume = load(KEY_RESUME, null);
  const last = resume && songs.find(x => x.id === resume.id);
  const c = chart ? ofSong(chart) : last ? ofSong(last) : { tuning: [0, 0, 0, 0, 0, 0], strings: prefs.type === 'lead' || prefs.type === 'rhythm' ? 6 : 4, centOffset: 0 };
  const name = tuningName(c.tuning, c.strings);
  const notes = tuningNotes(c.tuning, c.strings).join(' ');
  c.label = name.endsWith('Standard') || name.startsWith('Drop') ? `${name} · ${notes}` : name;
  if (chart && song) c.label += ` · for ${song.title}`;
  else if (last) c.label += ` · as ${last.title}, your last song`;
  return c;
}

export async function showTuner() {
  if (document.querySelector('.gk-sheet')) return;
  if (!(await ensureInput())) return;
  const c = tunerContext();
  const result = await openTuner({
    input, label: c.label, centOffset: c.centOffset, hear,
    targets: tuningTargets(c.tuning, c.strings, c.centOffset),
    onInput: async () => { input.close(); if (await chooseInput()) showTuner(); },
  });
  save(KEY_TUNER, { day: today(), tuning: tuningKey(c.tuning, c.strings, c.centOffset) });
  return result;
}

/* The tuner by itself: on the day's first song, and when the tuning changes.
 * Only when an input was chosen before and is plugged in now: never a nag. */
export async function maybeAutoTune() {
  if (!prefs.autoTune || !prefs.input || !chart) return;
  const last = load(KEY_TUNER, {});
  if (last.day === today() && last.tuning === tuningKey(chart.tuning, chart.strings, chart.centOffset)) return;
  if (await ensureInput({ ask: false })) await showTuner();
}

// The browser lets audio start only after a click or key.
document.addEventListener('pointerdown', () => mixer.resume(), true);
document.addEventListener('keydown', () => mixer.resume(), true);
// For tests: feed any MediaStream in as the instrument (e.g. an oscillator).
