// The title screen, its Settings sheet, and Help.

import { formatTime } from './chart.js';
import { mountTitle, alertSheet, confirmSheet } from './title.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT } from './help.js';
import { api } from './api.js';
import { $, highway, esc, fmtMs, songs, info, setScreen } from './core.js';
import { shortLabel, inputStatus, chooseInput, showTuner } from './instrument.js';
import { pickLibrary, loadLibrary, showLibrary } from './library-screen.js';
import { openSong, syncPlayerPrefs } from './player.js';
import { KEY_RESUME, load, prefs, savePrefs, forgetEverything, applyScreen } from './store.js';
import { runCalibration } from './sync-test.js';

export let title = null; // the title screen, while it is up

export function titleCfg() {
  const resume = load(KEY_RESUME, null);
  const rs = resume && songs.find(s => s.id === resume.id && s.audio !== false);
  const parts = playableParts().length;
  return {
    name: 'PumaBass',
    items: [
      rs && { act: 'resume', label: 'Resume game', key: 'R', meta: `${rs.title} · ${formatTime(resume.t)}` },
      { act: 'new', label: 'Learn a song', key: 'N', meta: songs.length ? partsLabel(parts) : 'choose your songs folder' },
      { act: 'tuner', label: 'Tuner', key: 'T', meta: prefs.input ? shortLabel(prefs.input.label) : 'Real Tone Cable' },
      { act: 'sync', label: 'Sync', key: 'Y', meta: prefs.avOffset || prefs.inputOffset ? `notes ${fmtMs(prefs.avOffset)}${prefs.inputOffset ? ` \u00b7 cable ${fmtMs(prefs.inputOffset)}` : ''}` : 'line up sound and picture' },
      'gap',
      { act: 'settings', label: 'Settings', key: 'S' },
      { act: 'help', label: 'Help', key: '?' },
      { act: 'about', label: 'About', key: 'A' },
    ],
    primary: rs ? 'resume' : 'new',
    scene: el => mountScene(el),
    help: HELP,
    about: ABOUT,
    settings: { html: settingsHTML, onClick: settingsClick },
    onAct: act => {
      if (act === 'resume' && rs) { leaveTitle(); openSong(rs, resume.t, { resumed: true }); }
      if (act === 'tuner') showTuner();
      if (act === 'sync') runCalibration();
      if (act === 'new' && !songs.length) pickLibrary();
      else if (act === 'new') { leaveTitle(); showLibrary(); }
    },
  };
}

export function showTitle() {
  setScreen('title');
  $('library').classList.add('hidden');
  $('player').classList.add('hidden');
  title = mountTitle($('title-host'), titleCfg());
  return title;
}
export function leaveTitle() {
  if (title) title.unmount();
  title = null;
  $('title-host').innerHTML = '';
}

/* How many songs and parts the library holds, in the same words everywhere:
 * the menu, the song list, Settings and the boot ("315 bass parts"). */
export function partsLabel(n) {
  return `${n} ${prefs.type === 'all' ? '' : prefs.type + ' '}${n === 1 ? 'part' : 'parts'}`;
}
const playableParts = () => songs.filter(s => (prefs.type === 'all' || s.type === prefs.type) && s.audio !== false);
/* "299 songs, 315 bass parts": the boot and Settings. */
export function libraryLabel() {
  const playable = songs.filter(s => s.audio !== false);
  return `${new Set(playable.map(s => s.songKey)).size} songs, ${partsLabel(playableParts().length)}`;
}

/* Settings is for setting up: the songs, the input, the screen, the highway.
 * What changes from song to song (the mix, recorded bass, scoring) lives in the
 * player's Mix panel. */
export function settingsHTML() {
  const pick = (set, opts, cur) => `<div class='gk-row'>${opts.map(([v, l]) =>
    `<button data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'>${l}</button>`).join('')}</div>`;
  const where = !info.libraryDir ? 'No songs folder chosen yet.'
    : `<code>${esc(info.libraryDir)}</code> · ${info.libraryFound ? libraryLabel() : 'that folder is missing'}`;
  return `<h3>Song library</h3>
<p class='gk-note'>${where}</p>
<div class='gk-row'><button data-set='library'>${info.libraryDir ? 'Change folder' : 'Choose folder'}</button><button data-set='rescan'>Rescan</button></div>
<p class='gk-note'>Your Rocksmith 2014 song files (<code>.psarc</code>), in this folder or the folders inside it. Rescan after adding songs.</p>
<h3>Instrument input</h3>
<p class='gk-note'>${inputStatus()}</p>
<div class='gk-row'><button data-set='input'>Choose input</button><button data-set='tuner'>Tuner</button></div>
<p class='gk-note'>Scoring, hearing your bass and the mix are in the player's Mix panel (<kbd>,</kbd>).</p>
<h3>Screen</h3>
${pick('screen', [['couch', 'TV, across the room'], ['desk', 'Computer, up close']], prefs.screen)}
<p class='gk-note'>On a big screen, TV draws everything larger so it reads from the couch.</p>
<h3>Highway</h3>
${pick('lookahead', [[2, '2s'], [3, '3s'], [4, '4s'], [5, '5s']], prefs.lookahead)}
${pick('invert', [['true', 'Low string on top'], ['false', 'Low string at the bottom']], prefs.invert)}
${pick('labels', [['fret', 'Fret numbers'], ['name', 'Note names'], ['off', 'Plain notes']], prefs.noteLabels)}
<p class='gk-note'>How far ahead the notes appear, which way up the strings go, and what the notes carry: fret numbers, note names, or nothing.</p>
<h3>Notation</h3>
${pick('notation', [['true', 'On'], ['false', 'Off']], prefs.notation)}
${pick('notationStaff', [['true', 'Standard notation'], ['false', 'No standard notation']], prefs.notationStaff)}
${pick('notationTab', [['true', 'Tab'], ['false', 'No tab']], prefs.notationTab)}
${pick('staffNames', [['true', 'Note names under the notes'], ['false', 'No names']], prefs.staffNames)}
<p class='gk-note'>The part scrolling over the top of the highway: standard notation, tab, or both, each on or off. <kbd>N</kbd> steps through standard notation, tab, both and off while you play.</p>
<h3>Speed</h3>
${pick('speed', [[50, '50%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']], prefs.startSpeed)}
<p class='gk-note'>The speed every song starts at. <kbd>Up</kbd> and <kbd>Down</kbd> change it while you play.</p>
<h3>This browser</h3>
<div class='gk-row'><button data-set='forget'>Forget everything</button></div>
<p class='gk-note'>Clears everything PumaBass keeps in this browser: your favorites, play counts, each song's audio offset, which songs you played last, where you left off, and these settings. Your songs, your recordings and the decoded audio on disk are not touched.</p>`;
}

export async function settingsClick(b, sheet) {
  const v = b.dataset.v;
  switch (b.dataset.set) {
    case 'lookahead': prefs.lookahead = Number(v); highway.lookahead = prefs.lookahead; break;
    case 'invert': prefs.invert = v === 'true'; highway.invert = prefs.invert; break;
    case 'labels': prefs.noteLabels = v; highway.labels = prefs.noteLabels; break;
    case 'notation': prefs.notation = v === 'true'; break;
    case 'staffNames': prefs.staffNames = v === 'true'; break;
    case 'notationStaff': prefs.notationStaff = v === 'true'; break;
    case 'notationTab': prefs.notationTab = v === 'true'; break;
    case 'speed': prefs.startSpeed = Number(v); break;
    case 'screen': prefs.screen = v; applyScreen(); break;
    case 'rescan':
      b.textContent = 'Scanning';
      try { await api('/api/rescan'); await loadLibrary(); }
      catch (e) { sheet.close(); await alertSheet(e.message, "Can't rescan"); return; }
      break;
    case 'library':
      sheet.close();
      pickLibrary();
      return;
    case 'input':
      sheet.close();
      chooseInput();
      return;
    case 'tuner':
      sheet.close();
      showTuner();
      return;
    case 'forget':
      if (await sheet.confirm('Forget everything PumaBass has saved in this browser: your favorites and play counts, every audio offset, your recent songs and where you left off, and your settings? This cannot be undone.', 'Forget everything')) forgetEverything();
      return;
    default: return;
  }
  savePrefs();
  syncPlayerPrefs();
  sheet.refresh();
}


/* A sheet of the title's style over the song list or the player: Help and
 * Settings away from the title. Tab stays inside it; Esc, × or a click
 * outside closes it, and focus goes back where it was. */
function openSheet(name, draw, onClick) {
  if (document.querySelector('.gk-sheet')) return null;
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'gk-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', name);
  const paint = () => { el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>${esc(name)}</h2><button data-x aria-label="Close">&times;</button></div>${draw()}</div>`; };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };
  const onKey = e => {
    if ([...document.querySelectorAll('.gk-sheet')].pop() !== el) return; // a question asked over it has the keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const bs = [...el.querySelectorAll('button, input, select')], i = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
    e.stopPropagation();
  };
  const sheet = { el, close, refresh: () => { const f = document.activeElement && document.activeElement.dataset; const at = f && JSON.stringify({ ...f }); paint(); const same = at && [...el.querySelectorAll('button')].find(b => JSON.stringify({ ...b.dataset }) === at); (same || el.querySelector('[data-x]')).focus({ preventScroll: true }); },
    confirm: (q, yes) => confirmSheet(q, yes) };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) return close();
    onClick(b, sheet);
  });
  paint();
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  return sheet;
}

/* Help from the song list or the player. */
export function openHelp() {
  let tab = 0;
  const sheet = openSheet('Help', () => `<div class="gk-tabs" role="tablist">${HELP.map(([t], i) => `<button role="tab" data-tab="${i}" aria-selected="${i === tab}" aria-pressed="${i === tab}">${esc(t)}</button>`).join('')}</div>
      <div class="gk-body">${HELP[tab][1]}</div>`, (b, sh) => {
    if (b.dataset.tab !== undefined) { tab = Number(b.dataset.tab); sh.refresh(); sh.el.querySelector(`[data-tab="${tab}"]`).focus(); }
  });
  if (sheet) sheet.el.querySelector('[aria-selected="true"]').focus();
}

/* Settings from the song list or the player: the title's own, in a sheet of their own. */
export function openSettings() {
  const sheet = openSheet('Settings', () => `<div class="gk-body">${settingsHTML()}</div>`, settingsClick);
  if (sheet) (sheet.el.querySelector('.gk-body button') || sheet.el.querySelector('[data-x]')).focus();
}
