// The title screen, its Settings sheet, and Help.

import { formatTime } from './chart.js';
import { mountTitle, alertSheet } from './title.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT } from './help.js';
import { RECORDED_BASS } from './mixer.js';
import { api } from './api.js';
import { $, highway, esc, muted, setMuted, fmtMs, screen, songs, info, setScreen } from './core.js';
import { shortLabel, inputStatus, hear, setRecordedBass, chooseInput, showTuner } from './instrument.js';
import { pickLibrary, loadLibrary, showLibrary } from './library-screen.js';
import { openSong, startScoring, syncPlayerPrefs } from './player.js';
import { KEY_RESUME, load, prefs, savePrefs, forgetEverything } from './store.js';
import { runCalibration } from './sync-test.js';

export let title = null; // the title screen, while it is up

export function titleCfg() {
  const resume = load(KEY_RESUME, null);
  const rs = resume && songs.find(s => s.id === resume.id && s.audio !== false);
  const parts = songs.filter(s => (prefs.type === 'all' || s.type === prefs.type) && s.audio !== false).length;
  return {
    name: 'PumaBass',
    items: [
      rs && { act: 'resume', label: 'Resume game', key: 'R', meta: `${rs.title} · ${formatTime(resume.t)}` },
      { act: 'new', label: 'Learn a song', key: 'N', meta: songs.length ? `${parts} ${prefs.type === 'all' ? '' : prefs.type + ' '}parts` : 'choose your songs folder' },
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

export function settingsHTML() {
  const pick = (set, opts, cur) => `<div class='gk-row'>${opts.map(([v, l]) =>
    `<button data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'>${l}</button>`).join('')}</div>`;
  const missing = songs.filter(s => s.audio === false).length;
  const where = !info.libraryDir ? 'No songs folder chosen yet.'
    : `<code>${esc(info.libraryDir)}</code> · ${info.libraryFound ? `${info.archives} song ${info.archives === 1 ? 'file' : 'files'}` : 'that folder is missing'}`;
  return `<h3>Song library</h3>
<p class='gk-note'>${where}</p>
<div class='gk-row'><button data-set='library'>${info.libraryDir ? 'Change folder' : 'Choose folder'}</button><button data-set='rescan'>Rescan</button></div>
<p class='gk-note'>The folder with your Rocksmith 2014 song files (<code>.psarc</code>); the folders inside it are searched too. Rescan after adding songs.</p>
<h3>Instrument input</h3>
<p class='gk-note'>${inputStatus()}</p>
<div class='gk-row'><button data-set='input'>Choose input</button><button data-set='tuner'>Tuner</button></div>
<h3>Hear your bass</h3>
${pick('hear', [['false', 'Off'], ['true', 'On']], prefs.hear)}
<p class='gk-note'>Plays the input through PumaBass, for a bass plugged into the cable rather than an amp. There is a short delay on the way. Its level is in the player's Mix (<kbd>,</kbd>).</p>
<h3>Recorded bass</h3>
${pick('rb', Object.entries(RECORDED_BASS).map(([k, v]) => [k, v.label]), prefs.recordedBass)}
<p class='gk-note'>The song's own bass can't be taken out of the record, but Reduced and Cut pull it well down so yours stands out. <kbd>B</kbd> switches it while you play.</p>
<h3>Scoring</h3>
${pick('scoring', [['true', 'On'], ['false', 'Off']], prefs.scoring)}
<p class='gk-note'>Listens to the instrument input and marks each note hit or missed: the right note, plucked on time. It only runs while an input is open, so playing through an amp is never marked wrong; turn it off to practise without the marks.</p>
<h3>Tune before playing</h3>
${pick('autotune', [['true', 'On'], ['false', 'Off']], prefs.autoTune)}
<p class='gk-note'>Opens the tuner on your first song of the day, and when a song needs a different tuning from the last.</p>
<h3>Riff repeater</h3>
${pick('repfrom', [[50, 'Start at 50%'], [60, '60%'], [70, '70%'], [80, '80%']], prefs.repeatFrom)}
${pick('repstep', [[2, 'Up 2% a time'], [5, '5%'], [10, '10%']], prefs.repeatStep)}
<p class='gk-note'>In the player, <kbd>R</kbd> loops the section and plays it a little faster each time round, up to full speed. With scoring on, a time round only counts with 70% of its notes hit.</p>
<h3>Highway</h3>
${pick('lookahead', [[2, '2s'], [3, '3s'], [4, '4s'], [5, '5s']], prefs.lookahead)}
<p class='gk-note'>How far ahead the notes appear. Longer gives more warning; shorter spreads them out.</p>
<h3>Strings</h3>
${pick('invert', [['false', 'Low string at the bottom'], ['true', 'Low string on top']], prefs.invert)}
<h3>Song list</h3>
${pick('missing', [['false', 'Hide charts without audio'], ['true', 'Show them']], prefs.showMissing)}
<p class='gk-note'>${missing} ${missing === 1 ? 'chart has' : 'charts have'} no audio. Recordings go in <code>${esc(info.musicDir || 'music')}</code>, named like <code>Artist - Title.mp3</code>; then Rescan.</p>
<h3>Sound</h3>
${pick('sound', [['on', 'On'], ['off', 'Off']], muted ? 'off' : 'on')}
<p class='gk-note'><kbd>M</kbd> switches it anywhere, and the player's header has a switch too.</p>
<h3>Speed</h3>
${pick('speed', [[50, '50%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']], prefs.startSpeed)}
<p class='gk-note'>The speed every song starts at. <kbd>Up</kbd> and <kbd>Down</kbd> change it while you play.</p>
<h3>This browser</h3>
<div class='gk-row'><button data-set='forget'>Forget everything</button></div>
<p class='gk-note'>Clears everything PumaBass keeps in this browser: your favorites, play counts, each song's audio offset, which songs you played last and where you left off, these settings and the sound switch. Your songs, your recordings and the decoded audio on disk are not touched.</p>`;
}

export async function settingsClick(b, sheet) {
  const v = b.dataset.v;
  switch (b.dataset.set) {
    case 'lookahead': prefs.lookahead = Number(v); highway.lookahead = prefs.lookahead; break;
    case 'invert': prefs.invert = v === 'true'; highway.invert = prefs.invert; break;
    case 'missing': prefs.showMissing = v === 'true'; break;
    case 'speed': prefs.startSpeed = Number(v); break;
    case 'sound': setMuted(v === 'off'); break;
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
    case 'hear': hear.set(v === 'true'); break;
    case 'rb': setRecordedBass(v); break;
    case 'autotune': prefs.autoTune = v === 'true'; break;
    case 'scoring': prefs.scoring = v === 'true'; break;
    case 'repfrom': prefs.repeatFrom = Number(v); break;
    case 'repstep': prefs.repeatStep = Number(v); break;
    case 'forget':
      if (await sheet.confirm('Forget everything PumaBass has saved in this browser: your favorites and play counts, every audio offset, your recent songs and where you left off, and your settings? This cannot be undone.', 'Forget everything')) forgetEverything();
      return;
    default: return;
  }
  savePrefs();
  syncPlayerPrefs();
  if (screen === 'player') startScoring();
  sheet.refresh();
}


/* Help from the song list or the player, in the title's sheet style. */
export function openHelp() {
  if (document.querySelector('.gk-sheet')) return;
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'gk-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Help');
  let tab = 0;
  const draw = () => {
    el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>Help</h2><button data-x aria-label="Close">&times;</button></div>
      <div class="gk-tabs" role="tablist">${HELP.map(([t], i) => `<button role="tab" data-tab="${i}" aria-selected="${i === tab}" aria-pressed="${i === tab}">${esc(t)}</button>`).join('')}</div>
      <div class="gk-body">${HELP[tab][1]}</div></div>`;
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) return close();
    if (b.dataset.tab !== undefined) { tab = Number(b.dataset.tab); draw(); el.querySelector(`[data-tab="${tab}"]`).focus(); }
  });
  draw();
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  el.querySelector('[aria-selected="true"]').focus();
}
