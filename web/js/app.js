// PumaBass's page: starts the parts (each in its own module) and routes the
// keys to the screen that is up. The parts:
//   core.js            shared elements, audio, highway, input, screen and library state
//   store.js           what is kept in the browser
//   api.js             the server
//   menu.js            the title screen, Settings, Help
//   library-screen.js  the song list and the songs folder
//   player.js          the player and the frame loop
//   repeater.js        the riff repeater
//   end-screen.js      the end screen
//   takes.js           takes, for tuning scoring
//   sync-test.js       the sync test's flow
//   instrument.js      the input, the mix, the tuner
//   wake.js            keeping the screen on while PumaBass is open

import { runBoot, injectTitleCSS, alertSheet } from './title.js';
import { mountScene } from './scene.js';
import { SERVER_API, SERVER_OLD, WEB } from './api.js';
import { $, mixer, highway, input, screen, songs, ownSongs, info } from './core.js';
import { applyMix } from './instrument.js';
import { loadLibrary, libraryKey } from './library-screen.js';
import { title, showTitle, libraryLabel, sheetKeys, titleEscape } from './menu.js';
import { chart, session, openSong, scorer, sync, inputBetween, playerKey } from './player.js';
import { calib, runCalibration, calibKey } from './sync-test.js';
import { saveTake } from './takes.js';
import { applyScreen } from './store.js';
import { keepScreenOn } from './wake.js';
import { isArrow, moveFocus, nearest } from './spatial.js';

// No browser right-click menu over the game; a text box keeps its own (to paste a search).
document.addEventListener('contextmenu', e => { if (!e.target.closest('input[type=search], input[type=text], textarea')) e.preventDefault(); });

/* Arrow keys move the focus on every screen (web/js/spatial.js), except where the arrows
 * already do something there: a slider's value and a text box's caret (Left/Right), the
 * title menu (the canon's own Up/Down), the song list's rows and groups, the player's
 * seek and speed (until one of its controls has the focus), and the sync test's nudges.
 * First in line (registered before any sheet's own keys), so a move here is final. */
document.addEventListener('keydown', e => {
  if (!isArrow(e.key) || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
  const t = e.target, side = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
  if (side && t.matches && t.matches('input[type=range]')) return; // its value
  // A text box keeps Left/Right for its caret, until the caret is at that end of the text.
  if (side && t.matches && t.matches('input[type=search], input[type=text], input:not([type]), textarea')
    && (e.key === 'ArrowLeft' ? t.selectionStart > 0 : t.selectionEnd < t.value.length)) return;
  const done = () => { e.preventDefault(); e.stopPropagation(); };
  const sheet = [...document.querySelectorAll('.gk-sheet')].pop();
  if (sheet) {
    // Left/Right along a row of tabs switch tabs, as tabs do.
    if (side && t.getAttribute && t.getAttribute('role') === 'tab' && sheet.contains(t)) {
      const tabs = [...sheet.querySelectorAll('[role=tab]')], i = tabs.indexOf(t);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      done(); next.click();
      const now = sheet.querySelector(`[data-tab="${next.dataset.tab}"]`); if (now) now.focus();
      return;
    }
    // Up/Down: to the next control that way, unless there's text that way to read first.
    const body = sheet.querySelector('.gk-body'), down = e.key === 'ArrowDown';
    const to = sheet.contains(t) && t !== sheet ? nearest(sheet, t, e.key) : null;
    const canScroll = body && !side && (down ? body.scrollTop + body.clientHeight < body.scrollHeight - 2 : body.scrollTop > 0);
    if (canScroll && !(to && body.contains(to))) {
      done();
      body.scrollBy({ top: down ? 60 : -60, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    if (moveFocus(sheet, e.key) || sheet.contains(t)) done();
    return;
  }
  if (screen === 'library') {
    // The rows and the search box have their own arrows (libraryKey); the controls around them move.
    if (t.closest && (t.closest('#song-list') || t === document.body || (t.id === 'search' && !side))) return;
    if (moveFocus($('library').querySelector('.pb'), e.key)) done();
    return;
  }
  if (screen === 'player' && !calib) {
    const mix = $('settings');
    if (!mix.classList.contains('hidden') && mix.contains(t)) { done(); moveFocus(mix, e.key); return; }
    // With one of the player's controls focused, the arrows go round the controls; otherwise
    // they seek and change speed (playerKey). Esc hands them back to the highway.
    const bars = [...$('player').querySelectorAll('.p-top, .p-bottom')];
    if (bars.some(b => b.contains(t)) && !(side && t.matches('input[type=range]'))) { done(); moveFocus(bars, e.key); }
  }
}, true);

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (document.querySelector('.gk-sheet')) return; // an open sheet has the keys
  const typing = !!(e.target.closest && e.target.closest('input[type=search],input[type=text],select'));
  if (calib && screen === 'player' && calibKey(e)) return;
  if (screen === 'title' && title && e.key === 'Escape') { e.preventDefault(); titleEscape(); return; } // twice: quit
  if (screen === 'library') libraryKey(e, typing);
  else if (screen === 'player' && chart && !(e.target.tagName === 'INPUT' && e.target.type === 'range' && e.key.startsWith('Arrow'))) playerKey(e);
});

/* Tab stays inside an open sheet, whichever made it (the title's own, Settings, Help, a question):
 * at either end it wraps round, and from outside it comes back in. Sheets that already keep Tab
 * themselves have handled it by the time it bubbles up here. */
window.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const sheet = [...document.querySelectorAll('.gk-sheet')].pop();
  if (!sheet) return;
  if (sheetKeys(e, sheet)) return; // the title's own sheets scroll and switch tabs by keys too
  if (e.key !== 'Tab') return;
  const items = [...sheet.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const to = i < 0 ? items[0] : e.shiftKey && i === 0 ? items[items.length - 1] : !e.shiftKey && i === items.length - 1 ? items[0] : null;
  if (to) { e.preventDefault(); to.focus(); }
});

window.pumabassDebug = { useInput: stream => { input.useStream(stream); applyMix(); }, input, mixer, highway, get session() { return session; }, get scorer() { return scorer; }, get sync() { return sync; }, inputBetween: (a, b) => inputBetween(a, b), get calib() { return calib; }, runCalibration: () => runCalibration(), openSong: title => openSong(songs.find(s => s.title === title && s.type === 'bass' && s.audio)), saveTake: () => saveTake() };

/* ---- start: the boot plays while the song index loads, then the title ---- */
applyScreen();
keepScreenOn();
injectTitleCSS();
mountScene($('library').querySelector('.scene'), 'pb-beam-list');
const boot = runBoot({ lines: ['PumaBass', 'reading your songs'] });
applyMix();
let startProblem = null;
loadLibrary().catch(e => { startProblem = e.message; }).then(() => {
  const waiting = songs.filter(s => s.audio === false && s.type === 'bass').length;
  // A server older than this page: its code changed since it started, or it
  // speaks an older version than this page needs.
  if (!startProblem && (info.stale || !(info.api >= SERVER_API))) startProblem = SERVER_OLD;
  showTitle();
  const lines = startProblem ? ['server: needs attention']
    : WEB ? ['the web demo', 'two songs, made for PumaBass']
    : !ownSongs().length ? ['no songs yet: the demo songs are ready']
    : [libraryLabel(), info.libraryDir && !info.libraryFound ? 'your Rocksmith folder is missing'
      : waiting ? `${waiting} bass charts waiting for a recording` : 'every bass chart has its audio'];
  if (!startProblem && !info.vgmstream) lines.push('vgmstream missing: no song audio');
  return boot.finish(lines);
}).then(async () => {
  if (title) title.reveal();
  if (startProblem) await alertSheet(startProblem, 'PumaBass needs a restart');
});
