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
import { STRING_COLORS } from './highway.js';

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
  colorName($('title-host').querySelector('h1'));
  return title;
}
/* The name in the wordmark's colors, BASS in the accent like the player's
 * corner. The canon writes the h1 as plain text and its decode ends by writing
 * it again, so the colors go in whenever it settles on the bare name. */
function colorName(h1) {
  if (!h1) return;
  const paint = () => { if (h1.textContent === 'PumaBass' && !h1.firstElementChild) h1.innerHTML = 'Puma<b>Bass</b>'; };
  paint();
  new MutationObserver(paint).observe(h1, { childList: true });
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
/* Settings that read better as a picture than a name: drawn the way the game draws
 * them, the name kept as the button's tooltip and label. Drawn on 72 x 40, shown a
 * quarter larger. */
const SVG = body => `<svg viewBox='0 0 72 40' width='90' height='50' aria-hidden='true'>${body}</svg>`;
const SC = STRING_COLORS;
// A glass note of the A string, carrying a fret number, a note name, or nothing.
const gemPic = t => SVG(`<rect x='14' y='8' width='44' height='24' rx='5' fill='${SC[1]}' fill-opacity='.42' stroke='${SC[1]}' stroke-width='2'/>${t
  ? `<text x='36' y='26.5' text-anchor='middle' font-size='17' font-weight='700' fill='#fff' font-family='Saira, system-ui, sans-serif'>${t}</text>` : ''}`);
// The four strings, low E (red) on top or at the bottom.
const stringsPic = lowOnTop => SVG((lowOnTop ? [0, 1, 2, 3] : [3, 2, 1, 0]).map((st, i) => `<text x='6' y='${10.5 + i * 9}' text-anchor='middle'
  font-size='9' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>${'EADG'[st]}</text>
<line x1='14' y1='${7 + i * 9}' x2='70' y2='${7 + i * 9}' stroke='${SC[st]}' stroke-width='3'/>`).join(''));
// A staff (five lines from y0, gap apart); a note head with its stem.
const staff = (y0, gap) => [0, 1, 2, 3, 4].map(i => `<line x1='4' y1='${y0 + i * gap}' x2='68' y2='${y0 + i * gap}' stroke='currentColor' stroke-opacity='.6'/>`).join('');
const head = (x, y, stem) => `<ellipse cx='${x}' cy='${y}' rx='4.6' ry='3.4' transform='rotate(-20 ${x} ${y})' fill='currentColor'/><line x1='${x + 4.2}' y1='${y}' x2='${x + 4.2}' y2='${y - stem}' stroke='currentColor' stroke-width='1.3'/>`;
const tabNum = (n, x, y) => `<text x='${x}' y='${y + 4}' text-anchor='middle' font-size='12' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>${n}</text>`;
const PICS = {
  fret: gemPic('5'), name: gemPic('D'), off: gemPic(''),
  lowTop: stringsPic(true), lowBottom: stringsPic(false),
  notationStaff: SVG(staff(8, 6) + head(26, 26, 18) + head(46, 17, 16)),
  // tab: four lines, broken where its fret numbers sit
  notationTab: SVG([9, 17, 25, 33].map(y => y === 25 ? `<line x1='4' y1='${y}' x2='20' y2='${y}' stroke='currentColor' stroke-opacity='.6'/><line x1='32' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`
    : y === 17 ? `<line x1='4' y1='${y}' x2='42' y2='${y}' stroke='currentColor' stroke-opacity='.6'/><line x1='54' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`
    : `<line x1='4' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`).join('') + tabNum(5, 26, 25) + tabNum(7, 48, 17)),
  staffNames: SVG(staff(4, 4.5) + head(36, 15.25, 13) + `<text x='36' y='37' text-anchor='middle' font-size='11' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>D</text>`),
};
const picBtn = (attrs, label, pic) => `<button class='pic' ${attrs} title='${label}' aria-label='${label}'>${pic}</button>`;

export function settingsHTML() {
  const pick = (set, opts, cur) => `<div class='gk-row'>${opts.map(([v, l, pic]) => pic
    ? picBtn(`data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'`, l, pic)
    : `<button data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'>${l}</button>`).join('')}</div>`;
  const where = !info.libraryDir ? 'No songs folder chosen yet.'
    : `<code>${esc(info.libraryDir)}</code> · ${info.libraryFound ? libraryLabel() : 'that folder is missing'}`;
  // Two columns, so it all fits on the TV without scrolling (style.css: .set-cols).
  return `<div class='set-cols'><div class='set-col'>
<section><h3>Song library</h3>
<p class='gk-note'>${where}</p>
<div class='gk-row'><button data-set='library'>${info.libraryDir ? 'Change folder' : 'Choose folder'}</button><button data-set='rescan'>Rescan</button></div>
<p class='gk-note'>Your Rocksmith 2014 song files (<code>.psarc</code>), here or in folders inside. Rescan after adding songs.</p></section>
<section><h3>Instrument input</h3>
<p class='gk-note'>${inputStatus()}</p>
<div class='gk-row'><button data-set='input'>Choose input</button><button data-set='tuner'>Tuner</button><button data-set='sync'>Sync</button></div>
<p class='gk-note'>Scoring, hearing your bass and the mix: the Mix panel (<kbd>M</kbd>) in a song.</p></section>
<section><h3>Screen</h3>
${pick('screen', [['couch', 'TV, across the room'], ['desk', 'Computer, up close']], prefs.screen)}
<p class='gk-note'>TV draws everything larger, to read from the couch.</p></section>
<section><h3>This browser</h3>
<div class='gk-row'><button data-set='forget'>Forget everything</button></div>
<p class='gk-note'>Clears your favorites, play counts, audio offsets, recent songs, where you left off and these settings. Your songs, recordings and decoded audio are not touched.</p></section>
</div><div class='set-col'>
<section><h3>Highway</h3>
${pick('lookahead', [[2, '2s'], [3, '3s'], [4, '4s'], [5, '5s']], prefs.lookahead)}
${pick('invert', [['true', 'Low string on top', PICS.lowTop], ['false', 'Low string at the bottom', PICS.lowBottom]], prefs.invert)}
${pick('labels', [['off', 'Plain notes', PICS.off], ['fret', 'Fret numbers', PICS.fret], ['name', 'Note names', PICS.name]], prefs.noteLabels)}</section>
<section><h3>Notation</h3>
<div class='gk-row'><span class='join'>${picBtn(`data-set='notationStaff' aria-pressed='${prefs.notation && prefs.notationStaff}'`, 'Standard notation', PICS.notationStaff)}${
  picBtn(`data-set='staffNames' aria-pressed='${prefs.staffNames}'${prefs.notation && prefs.notationStaff ? '' : ' disabled'}`, 'Names under the notes', PICS.staffNames)}</span>${
  picBtn(`data-set='notationTab' aria-pressed='${prefs.notation && prefs.notationTab}'`, 'Tab', PICS.notationTab)}</div></section>
<section><h3>Start speed</h3>
${pick('speed', [[50, '50%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']], prefs.startSpeed)}
<p class='gk-note'>Every song starts at this speed. <kbd>Up</kbd> and <kbd>Down</kbd> change it while you play.</p></section>
</div></div>`;
}

export async function settingsClick(b, sheet) {
  const v = b.dataset.v;
  switch (b.dataset.set) {
    case 'lookahead': prefs.lookahead = Number(v); highway.lookahead = prefs.lookahead; break;
    case 'invert': prefs.invert = v === 'true'; highway.invert = prefs.invert; break;
    case 'labels': prefs.noteLabels = v; highway.labels = prefs.noteLabels; break;
    case 'staffNames': prefs.staffNames = !prefs.staffNames; break;
    case 'notationStaff': case 'notationTab': {
      // One toggle each; the band shows while either is on (N may have turned the band off with both set).
      const k = b.dataset.set;
      if (!prefs.notation) { prefs.notationStaff = prefs.notationTab = false; prefs[k] = true; }
      else prefs[k] = !prefs[k];
      prefs.notation = prefs.notationStaff || prefs.notationTab;
      break;
    }
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
    case 'sync':
      sheet.close();
      runCalibration();
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


/* Keys inside any sheet: Up/Down, Page Up/Down (and Space when no button has it)
 * scroll its body; Left/Right on a tab switch tabs. true when the key was one of these. */
export function sheetKeys(e, el) {
  const t = e.target, body = el.querySelector('.gk-body');
  if (t.closest && t.closest('input, select, textarea')) return false;
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.getAttribute && t.getAttribute('role') === 'tab') {
    const tabs = [...el.querySelectorAll('[role=tab]')], i = tabs.indexOf(t);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    e.preventDefault(); next.click();
    const now = el.querySelector(`[data-tab="${next.dataset.tab}"]`); if (now) now.focus();
    return true;
  }
  if (!body) return false;
  const step = { ArrowDown: 60, ArrowUp: -60, PageDown: body.clientHeight * 0.85, PageUp: -body.clientHeight * 0.85 }[e.key]
    ?? (e.key === ' ' && !(t.closest && t.closest('button')) ? body.clientHeight * 0.85 : null);
  if (step === null) return false;
  e.preventDefault();
  body.scrollBy({ top: step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
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
    if (sheetKeys(e, el)) { e.stopPropagation(); return; }
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
