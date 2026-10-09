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
import { SERVER_API, SERVER_OLD } from './api.js';
import { $, mixer, highway, input, screen, songs, info } from './core.js';
import { applyMix } from './instrument.js';
import { loadLibrary, libraryKey } from './library-screen.js';
import { title, showTitle, libraryLabel, sheetKeys } from './menu.js';
import { chart, session, openSong, scorer, sync, inputBetween, playerKey } from './player.js';
import { calib, runCalibration, calibKey } from './sync-test.js';
import { saveTake } from './takes.js';
import { applyScreen } from './store.js';
import { keepScreenOn } from './wake.js';

// No browser right-click menu over the game; a text box keeps its own (to paste a search).
document.addEventListener('contextmenu', e => { if (!e.target.closest('input[type=search], input[type=text], textarea')) e.preventDefault(); });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.gk-sheet')) return; // an open sheet has the keys
  const typing = !!(e.target.closest && e.target.closest('input[type=search],input[type=text],select'));
  if (calib && screen === 'player' && calibKey(e)) return;
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
const boot = runBoot({ lines: ['PumaBass', 'reading your songs folder'] });
applyMix();
let startProblem = null;
loadLibrary().catch(e => { startProblem = e.message; }).then(() => {
  const waiting = songs.filter(s => s.audio === false && s.type === 'bass').length;
  // A server older than this page: its code changed since it started, or it
  // speaks an older version than this page needs.
  if (!startProblem && (info.stale || !(info.api >= SERVER_API))) startProblem = SERVER_OLD;
  showTitle();
  const lines = startProblem ? ['server: needs attention']
    : !info.libraryDir ? ['no songs folder chosen yet']
    : !info.libraryFound ? ['songs folder not found']
    : [libraryLabel(), waiting ? `${waiting} bass charts waiting for a recording` : 'every bass chart has its audio'];
  if (!startProblem && !info.vgmstream) lines.push('vgmstream missing: no song audio');
  return boot.finish(lines);
}).then(async () => {
  if (title) title.reveal();
  if (startProblem) await alertSheet(startProblem, 'PumaBass needs a restart');
});
