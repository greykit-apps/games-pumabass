// PumaBass's page: starts the parts (each in its own module) and routes the
// keys to the screen that is up. The parts:
//   core.js            shared elements, audio, highway, input, screen and library state
//   store.js           what is kept in the browser
//   api.js             the server
//   menu.js            the title screen, Settings, Help
//   library-screen.js  the song list and the songs folder
//   lessons-screen.js  Lessons
//   player.js          the player and the frame loop
//   repeater.js        the riff repeater
//   end-screen.js      the end screen
//   takes.js           takes, for tuning scoring
//   sync-test.js       the sync test's flow
//   instrument.js      the input, the mix, the tuner

import { runBoot, bootReloadLine, injectTitleCSS, alertSheet } from './title.js';
import { mountScene } from './scene.js';
import { SERVER_API, SERVER_OLD } from './api.js';
import { $, mixer, highway, input, muted, setMuted, screen, songs, info } from './core.js';
import { applyMix } from './instrument.js';
import { lessonsKey } from './lessons-screen.js';
import { loadLibrary, libraryKey } from './library-screen.js';
import { title, showTitle } from './menu.js';
import { chart, session, openSong, scorer, sync, inputBetween, playerKey } from './player.js';
import { calib, runCalibration, calibKey } from './sync-test.js';
import { saveTake } from './takes.js';

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.gk-sheet')) return; // an open sheet has the keys
  const typing = !!(e.target.closest && e.target.closest('input[type=search],input[type=text],select'));
  if ((e.key === 'm' || e.key === 'M') && !typing) { e.preventDefault(); setMuted(!muted); return; }
  if (calib && screen === 'player' && calibKey(e)) return;
  if (screen === 'library') libraryKey(e, typing);
  else if (screen === 'lessons') lessonsKey(e);
  else if (screen === 'player' && chart && !(e.target.tagName === 'INPUT' && e.target.type === 'range' && e.key.startsWith('Arrow'))) playerKey(e);
});

window.pumabassDebug = { useInput: stream => { input.useStream(stream); applyMix(); }, input, mixer, highway, get session() { return session; }, get scorer() { return scorer; }, get sync() { return sync; }, inputBetween: (a, b) => inputBetween(a, b), get calib() { return calib; }, runCalibration: () => runCalibration(), openSong: title => openSong(songs.find(s => s.title === title && s.type === 'bass' && s.audio)), saveTake: () => saveTake() };

/* ---- start: the boot plays while the song index loads, then the title ---- */
injectTitleCSS();
mountScene($('library').querySelector('.scene'));
const boot = runBoot({ lines: [bootReloadLine(), 'local server: your Rocksmith 2014 install'] });
applyMix();
let startProblem = null;
loadLibrary().catch(e => { startProblem = e.message; }).then(() => {
  const playable = songs.filter(s => s.audio !== false);
  const bass = playable.filter(s => s.type === 'bass').length;
  const waiting = songs.filter(s => s.audio === false && s.type === 'bass').length;
  // A server older than this page: its code changed since it started, or it
  // speaks an older version than this page needs.
  if (!startProblem && (info.stale || !(info.api >= SERVER_API))) startProblem = SERVER_OLD;
  showTitle();
  const lines = startProblem ? ['server: needs attention']
    : !info.libraryDir ? ['no songs folder chosen yet']
    : !info.libraryFound ? ['songs folder not found']
    : [`${new Set(playable.map(s => s.songKey)).size} songs, ${bass} bass parts`, waiting ? `${waiting} bass charts waiting for a recording` : 'every bass chart has its audio'];
  if (!startProblem && !info.vgmstream) lines.push('vgmstream missing: no song audio');
  return boot.finish(lines);
}).then(async () => {
  if (title) title.reveal();
  if (startProblem) await alertSheet(startProblem, 'PumaBass needs a restart');
});
