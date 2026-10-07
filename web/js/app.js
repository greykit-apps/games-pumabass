import { Highway } from './highway.js';
import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel } from './chart.js';
import { runBoot, mountTitle, bootReloadLine, injectTitleCSS, alertSheet } from './title.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT } from './help.js';
import { InstrumentInput, isRealTone } from './input.js';
import { openTuner, tuningTargets, tuningKey } from './tuner.js';

const $ = id => document.getElementById(id);
const audio = $('audio');
const highway = new Highway($('highway'));

/* ---- storage (games-meta STANDARD.md §5): every key is pumabass_<feature>_v<n>,
 * so Forget everything (§2) can find them all by the prefix. */
const KEY_PREFS = 'pumabass_prefs_v1';      // song-list filters and player preferences
const KEY_OFFSETS = 'pumabass_offsets_v1';  // per-song audio offset, ms
const KEY_RECENT = 'pumabass_recent_v1';    // per-song last-opened time
const KEY_RESUME = 'pumabass_resume_v1';    // the song and spot you left off at
const KEY_MUTED = 'pumabass_muted_v1';      // "1" muted, "0" not (§8)
const KEY_TUNER = 'pumabass_tuner_v1';      // the day and tuning you last tuned to

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function save(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window */ }
}

/* Before the standard, settings lived under "pb:<name>". Read them once into the
 * new keys, then drop them, so nobody loses their offsets. */
(function migrateOldKeys() {
  try {
    const old = {};
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('pb:')) continue;
      try { old[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* unreadable */ }
      localStorage.removeItem(k);
    }
    if (!Object.keys(old).length) return;
    const p = load(KEY_PREFS, {}), offsets = load(KEY_OFFSETS, {});
    for (const n of ['type', 'sort', 'showMissing', 'difficulty', 'lookahead', 'invert', 'volume']) if (n in old && !(n in p)) p[n] = old[n];
    for (const [n, v] of Object.entries(old)) if (n.startsWith('offset:')) offsets[n.slice(7)] = v;
    save(KEY_PREFS, p);
    save(KEY_OFFSETS, offsets);
    if (old.recent) save(KEY_RECENT, old.recent);
  } catch (e) { /* no storage */ }
})();

const prefs = Object.assign({
  type: 'bass', sort: 'artist', showMissing: false, difficulty: 100, lookahead: 3, invert: false, volume: 100, startSpeed: 100,
  input: null,      // { id, label } of the instrument input
  hear: 0,          // play the input through the speakers, 0..1
  hearLast: 0.6,    // the volume "Hear your bass" comes back on at
  autoTune: true,   // open the tuner on the day's first song and when the tuning changes
}, load(KEY_PREFS, {}));
const savePrefs = () => save(KEY_PREFS, prefs);

/* Settings' "Forget everything" (games-meta STANDARD.md §2): every key PumaBass
 * owns, found by its prefix, and only those -- every game on greykit.com shares
 * one origin, so one storage. */
function forgetEverything() {
  for (const area of ['localStorage', 'sessionStorage']) {
    try {
      const s = window[area];
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k && k.startsWith('pumabass')) s.removeItem(k);
      }
    } catch (e) { /* no storage */ }
  }
  location.reload();
}

/* Every request to the PumaBass server goes through api(). When one fails it
 * throws an Error whose message is ready to show the player: the server isn't
 * running, or it is older than this page (the page is always read fresh from
 * disk, the server only when it starts). Nothing fails silently. */
const START_AGAIN = 'start it again (start.bat on Windows, ./start.sh on Linux)';
const SERVER_DOWN = `PumaBass can't reach its server: its window may have been closed. Please ${START_AGAIN} and leave that window open.`;
const SERVER_API = 2; // must match API_VERSION in server/server.js
const SERVER_OLD = `PumaBass was updated while it was running. To finish the update, close its window and ${START_AGAIN}.`;
async function api(path, opts) {
  let res;
  try { res = await fetch(path, opts); } catch (e) { throw new Error(SERVER_DOWN); }
  let body = null;
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  if (res.status === 404 && !body) throw new Error(SERVER_OLD); // an address this server doesn't know yet
  if (!res.ok) throw new Error((body && body.error) || `The PumaBass server answered ${res.status}.`);
  return body;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- sound (games-meta STANDARD.md §8): M anywhere, saved as "1" or "0".
 * PumaBass's only sound is the song, so muting it mutes the song. */
let muted = (() => { try { return localStorage.getItem(KEY_MUTED) === '1'; } catch (e) { return false; } })();
audio.muted = muted;
function setMuted(m) {
  muted = m;
  audio.muted = m;
  try { localStorage.setItem(KEY_MUTED, m ? '1' : '0'); } catch (e) { /* no storage */ }
  renderSoundButtons();
}
/* The header's sound switch: always named Sound, pressed while it is on. */
function soundButton() {
  const waves = muted ? '<path d="M11 6l4 4M15 6l-4 4"/>' : '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3a7 7 0 0 1 0 10"/>';
  return `<button class="snd" data-act="mute" aria-label="Sound" aria-pressed="${!muted}" title="Sound ${muted ? 'off' : 'on'} (M)"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="spk" d="M2 6h3l4-3v10l-4-3H2z"/>${waves}</svg></button>`;
}
function renderSoundButtons() { for (const el of document.querySelectorAll('.snd-slot')) el.innerHTML = soundButton(); }
document.addEventListener('click', e => { if (e.target.closest('.snd')) setMuted(!muted); });
renderSoundButtons();

/* ---- screens: the title, the song list, the player ---- */
let screen = 'title';
let songs = [];
let info = {};
let title = null;

function titleCfg() {
  const resume = load(KEY_RESUME, null);
  const rs = resume && songs.find(s => s.id === resume.id && s.audio !== false);
  const parts = songs.filter(s => (prefs.type === 'all' || s.type === prefs.type) && s.audio !== false).length;
  return {
    name: 'PumaBass',
    items: [
      rs && { act: 'resume', label: 'Resume game', key: 'R', meta: `${rs.title} · ${formatTime(resume.t)}` },
      { act: 'new', label: 'Learn a song', key: 'N', meta: songs.length ? `${parts} ${prefs.type === 'all' ? '' : prefs.type + ' '}parts` : 'choose your songs folder' },
      { act: 'tuner', label: 'Tuner', key: 'T', meta: prefs.input ? shortLabel(prefs.input.label) : 'Real Tone Cable' },
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
      if (act === 'resume' && rs) { leaveTitle(); openSong(rs, resume.t); }
      if (act === 'tuner') showTuner();
      if (act === 'new' && !songs.length) pickLibrary();
      else if (act === 'new') { leaveTitle(); showLibrary(); }
    },
  };
}

function showTitle() {
  screen = 'title';
  $('library').classList.add('hidden');
  $('player').classList.add('hidden');
  title = mountTitle($('title-host'), titleCfg());
  return title;
}
function leaveTitle() {
  if (title) title.unmount();
  title = null;
  $('title-host').innerHTML = '';
}

function settingsHTML() {
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
${pick('hear', [[0, 'Off'], [0.35, 'Quiet'], [0.6, 'Medium'], [0.9, 'Loud']], prefs.hear)}
<p class='gk-note'>Plays the input through PumaBass, for a bass plugged into the cable rather than an amp. There is a short delay on the way.</p>
<h3>Tune before playing</h3>
${pick('autotune', [['true', 'On'], ['false', 'Off']], prefs.autoTune)}
<p class='gk-note'>Opens the tuner on your first song of the day, and when a song needs a different tuning from the last.</p>
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
<p class='gk-note'>Clears everything PumaBass keeps in this browser: each song's audio offset, which songs you played last and where you left off, these settings and the sound switch. Your songs, your recordings and the decoded audio on disk are not touched.</p>`;
}

async function settingsClick(b, sheet) {
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
    case 'hear': hear.set(Number(v)); break;
    case 'autotune': prefs.autoTune = v === 'true'; break;
    case 'forget':
      if (await sheet.confirm('Forget everything PumaBass has saved in this browser: every audio offset, your recent songs and where you left off, and your settings? This cannot be undone.', 'Forget everything')) forgetEverything();
      return;
    default: return;
  }
  savePrefs();
  syncPlayerPrefs();
  sheet.refresh();
}

/* ---- the instrument input and the tuner ---- */
const input = new InstrumentInput();
input.onchange = () => { if (screen === 'title' && title && !document.querySelector('.gk-sheet')) { leaveTitle(); showTitle().reveal(); } };
const shortLabel = l => (isRealTone(l) ? 'Real Tone Cable' : String(l || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, ''));
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const INPUT_UNSUPPORTED = "This browser won't let PumaBass use audio inputs at this address. Open PumaBass as http://localhost:8014/ on the computer it runs on.";

function inputStatus() {
  if (!InstrumentInput.supported()) return INPUT_UNSUPPORTED;
  if (!prefs.input) return 'None chosen yet. Plug in the Real Tone Cable and choose it here.';
  return `<b>${esc(shortLabel(prefs.input.label))}</b>${isRealTone(prefs.input.label) ? '' : ` (${esc(prefs.input.label)})`}${input.open ? ' · listening' : ''}`;
}

function inputError(e) {
  if (e && e.name === 'NotAllowedError') return "PumaBass wasn't allowed to use audio inputs. Allow it in the browser's settings for this site (the icon left of the address), then try again.";
  if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) return "That input isn't connected. Plug it in, or choose another.";
  return (e && e.message) || "The input couldn't be opened.";
}

/* "Hear your bass": the input through the speakers, at prefs.hear. */
const hear = {
  get volume() { return prefs.hear; },
  get last() { return prefs.hearLast; },
  set(v) {
    prefs.hear = v;
    if (v) prefs.hearLast = v;
    savePrefs();
    applyHear();
  },
};
async function applyHear() {
  if (prefs.hear > 0 && !input.open) await ensureInput({ ask: false });
  input.setMonitor(prefs.hear);
}

/* Open the chosen input, or the Real Tone Cable if none was chosen and one is
 * plugged in. ask: when nothing suitable is there, offer the list of inputs. */
async function ensureInput({ ask = true } = {}) {
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
      input.setMonitor(prefs.hear);
      return true;
    }
  } catch (e) {
    if (ask) await alertSheet(inputError(e), 'No instrument input');
    return false;
  }
  return ask ? chooseInput() : false;
}

/* The audio inputs to choose from, the Real Tone Cable marked. Resolves true once one is open. */
function chooseInput() {
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
          input.setMonitor(prefs.hear);
          close(true);
        } catch (e) { draw(inputError(e)); }
      }
    });
    draw();
  });
}

/* The tuning the tuner aims for: the open song's, else the last song you played, else standard. */
function tunerContext() {
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

async function showTuner() {
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
async function maybeAutoTune() {
  if (!prefs.autoTune || !prefs.input || !chart) return;
  const last = load(KEY_TUNER, {});
  if (last.day === today() && last.tuning === tuningKey(chart.tuning, chart.strings, chart.centOffset)) return;
  if (await ensureInput({ ask: false })) await showTuner();
}

// The browser lets audio start only after a click or key.
document.addEventListener('pointerdown', () => input.resume(), true);
document.addEventListener('keydown', () => input.resume(), true);
// For tests: feed any MediaStream in as the instrument (e.g. an oscillator).
window.pumabassDebug = { useInput: stream => { input.useStream(stream); input.setMonitor(prefs.hear); }, input };

/* The songs folder, picked from this computer's folders through the server,
 * then scanned. From Settings, the title (with no songs yet) or the empty list. */
async function pickLibrary() {
  let chosen;
  try {
    chosen = await chooseFolder();
    if (!chosen) return;
    await loadLibrary();
  } catch (e) {
    await alertSheet(e.message, "Can't choose the songs folder");
    return;
  }
  const playable = songs.filter(s => s.audio !== false);
  const bass = playable.filter(s => s.type === 'bass').length;
  await alertSheet(chosen.songs
    ? `Found ${new Set(playable.map(s => s.songKey)).size} songs with ${bass} bass parts in ${chosen.archives} song ${chosen.archives === 1 ? 'file' : 'files'}.`
    : `No Rocksmith 2014 songs were found in ${chosen.libraryDir} or the folders inside it. Choose the folder that holds your .psarc song files.`, 'Songs folder');
  if (screen === 'title') { leaveTitle(); showTitle().reveal(); }
  else if (screen === 'library') renderLibrary();
}

function chooseFolder() {
  return new Promise(async (resolve, reject) => {
    if (document.querySelector('.gk-sheet')) return resolve(null);
    const back = document.activeElement;
    // Up at once, so a click always shows something, then filled in.
    const el = document.createElement('div');
    el.className = 'gk-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Songs folder');
    el.innerHTML = '<div class="gk-box"><div class="gk-head"><h2>Songs folder</h2></div><div class="gk-body"><p>Reading your folders…</p></div></div>';
    document.body.appendChild(el);
    let roots, start;
    try { ({ roots, start } = await api('/api/folders')); } catch (e) { el.remove(); return reject(e); }
    const home = roots[0];
    let cur = null, err = '';
    const into = d => cur.path + (cur.path.endsWith(cur.sep) ? '' : cur.sep) + d;
    const draw = () => {
      const n = cur.psarc, k = cur.dirs.length;
      el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>Songs folder</h2><button data-x aria-label="Close">&times;</button></div>
      <div class="gk-body">
        <p>Pick the folder with your Rocksmith 2014 song files (<code>.psarc</code>). The folders inside it are searched too,
        so a whole Rocksmith folder, a copied <code>dlc</code> folder or a USB stick all work.</p>
        <div class="gk-row">${roots.map(r => `<button data-go="${esc(r)}">${esc(r === home ? 'Home' : r)}</button>`).join('')}</div>
        <form class="folder-path"><input name="p" value="${esc(cur.path)}" aria-label="Folder" spellcheck="false" autocomplete="off"><button>Go</button></form>
        ${err ? `<p class="gk-note warn">${esc(err)}</p>` : ''}
        <p class="gk-note">${n ? `<b>${n}</b> song ${n === 1 ? 'file' : 'files'} right here` : 'No song files right here'}${k ? `, and ${k} ${k === 1 ? 'folder' : 'folders'} inside` : ''}.</p>
        <div class="folders">${cur.parent ? `<button data-go="${esc(cur.parent)}">.. up</button>` : ''}${cur.dirs.map(d => `<button data-go="${esc(into(d))}">${esc(d)}</button>`).join('')}</div>
        <div class="gk-row"><button class="primary" data-use>Use this folder</button><button data-x>Cancel</button></div>
      </div></div>`;
      (el.querySelector('.folders button') || el.querySelector('[data-use]')).focus({ preventScroll: true });
    };
    const go = async dir => {
      const j = await api(`/api/folders?path=${encodeURIComponent(dir)}`).catch(e => ({ error: e.message }));
      if (j.error) err = j.error; else { cur = j; err = ''; }
      draw();
    };
    const close = v => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (back && back.isConnected) back.focus({ preventScroll: true });
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } };
    el.addEventListener('submit', e => { e.preventDefault(); go(el.querySelector('input[name=p]').value.trim()); });
    el.addEventListener('click', async e => {
      if (e.target === el) return close(null);
      const b = e.target.closest('button');
      if (!b || b.closest('form')) return; // the form's Go button submits it
      if (b.hasAttribute('data-x')) return close(null);
      if (b.dataset.go) return go(b.dataset.go);
      if (b.hasAttribute('data-use')) {
        b.textContent = 'Scanning';
        const r = await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: cur.path }) })
          .catch(e => ({ error: e.message }));
        if (r.error) { err = r.error; draw(); return; }
        close(r);
      }
    });
    document.addEventListener('keydown', onKey, true);
    await go(start);
  });
}

/* Help from the song list or the player, in the title's sheet style. */
function openHelp() {
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

/* ---- the song list ---- */
async function loadLibrary() {
  [songs, info] = await Promise.all([api('/api/songs'), api('/api/info')]);
  if (screen === 'library') renderLibrary();
}

function showLibrary() {
  screen = 'library';
  $('player').classList.add('hidden');
  $('library').classList.remove('hidden');
  renderLibrary();
  const first = $('song-list').querySelector('.song:not(.noaudio)');
  (first || $('search')).focus({ preventScroll: true });
}

const stringsOf = s => (s.type === 'bass' ? 4 : 6);
function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const recent = load(KEY_RECENT, {});
  const ofType = songs.filter(s => prefs.type === 'all' || s.type === prefs.type);
  let list = ofType.filter(s => prefs.showMissing || s.audio !== false);
  if (q) list = list.filter(s => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  const cmp = {
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
    tuning: (a, b) => tuningName(a.tuning, stringsOf(a)).localeCompare(tuningName(b.tuning, stringsOf(b))) || a.artist.localeCompare(b.artist),
    recent: (a, b) => (recent[b.id] || 0) - (recent[a.id] || 0) || a.artist.localeCompare(b.artist),
  }[prefs.sort] || (() => 0);
  list.sort((a, b) => cmp(a, b) || arrangementLabel(a).localeCompare(arrangementLabel(b)));

  for (const b of document.querySelectorAll('#type-filter button')) b.setAttribute('aria-pressed', String(b.dataset.type === prefs.type));
  $('sort').value = prefs.sort;

  const el = $('song-list');
  el.innerHTML = list.length ? '' : !songs.length
    ? '<div class="empty"><p>No songs yet. PumaBass plays your own Rocksmith 2014 song files: show it where they are.</p><button class="primary" data-act="choose">Choose your songs folder</button></div>'
    : `<div class="empty">${q ? 'No songs match that search.' : 'No songs here.'}</div>`;
  const frag = document.createDocumentFragment();
  list.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'song' + (s.audio === false ? ' noaudio' : '');
    row.tabIndex = 0;
    row.dataset.id = s.id;
    row.setAttribute('role', 'listitem');
    const tn = tuningName(s.tuning, stringsOf(s));
    row.innerHTML = `<span class="n">${i + 1}</span>
      <div style="min-width:0"><div class="t"></div><div class="a"></div></div>
      <span class="arr"></span>
      <span class="tun${tn === 'E Standard' ? ' std' : ''}"></span>
      <span class="len">${formatTime(s.length)}</span>`;
    row.querySelector('.t').textContent = s.title;
    row.querySelector('.a').textContent = `${s.artist}${s.album ? ' · ' + s.album : ''}${s.year ? ' (' + s.year + ')' : ''}`;
    row.querySelector('.arr').innerHTML = s.audio === false ? 'No audio' : esc(arrangementLabel(s)) + (s.audio === 'user' ? ' <span class="mine">· yours</span>' : '');
    row.querySelector('.tun').textContent = tn + (s.centOffset ? ` ${s.centOffset > 0 ? '+' : ''}${Math.round(s.centOffset)}¢` : '');
    if (s.audio === false) row.title = 'No audio for this song yet. Put a recording named like "Artist - Title.mp3" in the music folder, then Rescan.';
    frag.appendChild(row);
  });
  el.appendChild(frag);
  $('count').textContent = `${list.length} ${list.length === 1 ? 'part' : 'parts'}`;
  const missing = ofType.filter(s => s.audio === false).length;
  $('missing-note').textContent = missing && !prefs.showMissing ? `${missing} without audio hidden (Settings)` : '';
}

$('song-list').addEventListener('click', e => {
  if (e.target.closest('[data-act=choose]')) return pickLibrary();
  const row = e.target.closest('.song');
  const s = row && songs.find(x => x.id === row.dataset.id);
  if (s && s.audio !== false) openSong(s);
});
$('search').addEventListener('input', renderLibrary);
$('sort').addEventListener('change', () => { prefs.sort = $('sort').value; savePrefs(); renderLibrary(); });
$('type-filter').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.type = b.dataset.type;
  savePrefs();
  renderLibrary();
});
$('library').querySelector('.bar').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'menu') { showTitle().reveal(); }
  else if (b.dataset.act === 'help') openHelp();
  else if (b.dataset.act === 'rescan') {
    b.textContent = 'Scanning';
    try { await api('/api/rescan'); await loadLibrary(); }
    catch (err) { await alertSheet(err.message, "Can't rescan"); }
    b.textContent = 'Rescan';
  }
});

function libraryKey(e, typing) {
  const k = e.key;
  const rows = [...$('song-list').querySelectorAll('.song')];
  const i = rows.indexOf(document.activeElement);
  if (k === 'Escape') {
    e.preventDefault();
    if (typing && $('search').value) { $('search').value = ''; renderLibrary(); }
    else if (typing) $('search').blur();
    else showTitle().reveal();
  } else if (k === '/' && !typing) { e.preventDefault(); $('search').focus(); }
  else if ((k === '?' || k === 'h') && !typing) { e.preventDefault(); openHelp(); }
  else if ((k === 't' || k === 'T') && !typing) { e.preventDefault(); showTuner(); }
  else if (k === 'ArrowDown' && rows.length) { e.preventDefault(); rows[Math.min(rows.length - 1, i + 1)].focus(); }
  else if (k === 'ArrowUp' && rows.length && i >= 0) { e.preventDefault(); (i === 0 ? $('search') : rows[i - 1]).focus(); }
  else if (k === 'Enter' && i >= 0) {
    const s = songs.find(x => x.id === rows[i].dataset.id);
    if (s && s.audio !== false) openSong(s);
  }
}

/* ---- the player ---- */
let chart = null;
let song = null;
let loop = null; // { a, b }
let offsetMs = 0;
const clock = { raw: 0, stamp: 0 };
let lastResumeSave = 0;
/* The run-up: play after a pause starts RUNUP seconds back and counts down to
 * the spot you stopped at ("live"), so you can find the groove again. pausedAt
 * is that spot; an explicit jump while paused (click, keys, wheel) clears it,
 * since then you chose where to start. */
const RUNUP = 6;
let pausedAt = null;   // where play will count back in to, or null
let liveAt = null;     // the spot the countdown is counting to, while it runs
let liveShownAt = 0;   // when LIVE went up, to take it down again

async function openSong(s, startAt = 0) {
  song = s;
  screen = 'player';
  $('library').classList.add('hidden');
  $('player').classList.remove('hidden');
  $('loading').classList.remove('hidden');
  $('p-title').textContent = s.title;
  $('p-sub').textContent = `${s.artist} · ${arrangementLabel(s)}`;
  const recent = load(KEY_RECENT, {}); recent[s.id] = Date.now(); save(KEY_RECENT, recent);

  try {
    chart = await api(`/api/chart/${encodeURIComponent(s.id)}`);
  } catch (e) {
    $('loading').classList.add('hidden');
    showLibrary();
    await alertSheet(e.message, `Can't open "${s.title}"`);
    return;
  }
  const tn = tuningName(chart.tuning, chart.strings);
  const notes = tuningNotes(chart.tuning, chart.strings).join(' ');
  $('p-tuning').textContent = (tn.includes(' ') && !tn.startsWith('Drop') && !tn.endsWith('Standard') ? tn : `${tn} · ${notes}`)
    + (chart.centOffset ? ` · ${chart.centOffset > 0 ? '+' : ''}${Math.round(chart.centOffset)} cents` : '')
    + (chart.capo ? ` · Capo ${chart.capo}` : '');
  offsetMs = load(KEY_OFFSETS, {})[s.id] || 0;
  // Your own recordings can be off by whole seconds (different intro, edit, etc.), so allow a wider range.
  const range = s.audio === 'user' ? 15000 : 500;
  $('offset').min = -range; $('offset').max = range; $('offset').step = s.audio === 'user' ? 10 : 5;
  $('offset').value = offsetMs; showOffset();
  loop = null;
  renderLoop();
  applyDifficulty();
  buildSectionBar();

  audio.src = `/api/audio/${encodeURIComponent(s.id)}`;
  audio.preservesPitch = true;
  await new Promise(resolve => {
    const done = () => { audio.removeEventListener('canplay', done); audio.removeEventListener('error', done); resolve(); };
    audio.addEventListener('canplay', done); audio.addEventListener('error', done);
  });
  $('loading').classList.add('hidden');
  if (audio.error) {
    info = await api('/api/info').catch(() => info);
    chart = null; // nothing to resume
    closeSong();
    await alertSheet(info.vgmstream === false
      ? `Song audio needs vgmstream, which isn't installed yet. In the PumaBass folder run tools/get-vgmstream.sh (on Windows, see README.md), then open "${s.title}" again.`
      : `The audio for "${s.title}" couldn't be played.`, "Can't play the song");
    return;
  }
  audio.currentTime = startAt;
  pausedAt = startAt > 0.5 ? startAt : null; // Resume game counts back in, too
  liveAt = null;
  setSpeed(prefs.startSpeed); // loading a new source resets the rate
  updatePlayButton();
  saveResume();
  await maybeAutoTune();
}

function saveResume() {
  if (song && chart) save(KEY_RESUME, { id: song.id, t: Math.round(audio.currentTime * 10) / 10 });
}

function closeSong() {
  saveResume();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  chart = null;
  $('settings').classList.add('hidden');
  showLibrary();
  const row = $('song-list').querySelector(`.song[data-id="${CSS.escape(song.id)}"]`);
  if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); }
}

function applyDifficulty() {
  if (!chart) return;
  highway.setChart(chart, buildPlayable(chart, prefs.difficulty));
}

// Smooth song clock: audio.currentTime updates in coarse steps, so extrapolate between them.
function songTime() {
  const t = audio.currentTime;
  const now = performance.now();
  let est = t;
  if (!audio.paused) {
    if (t !== clock.raw) { clock.raw = t; clock.stamp = now; }
    est = clock.raw + Math.min(0.25, ((now - clock.stamp) / 1000) * audio.playbackRate);
  } else { clock.raw = t; clock.stamp = now; }
  return est - offsetMs / 1000;
}

function seek(t, chosen = true) {
  if (chosen) { pausedAt = null; liveAt = null; }
  audio.currentTime = Math.max(0, Math.min(t, (audio.duration || chart.songLength) - 0.05));
  clock.raw = audio.currentTime; clock.stamp = performance.now();
}

function togglePlay() {
  if (!chart) return;
  if (audio.paused) {
    if (pausedAt !== null) {
      liveAt = pausedAt;
      seek(Math.max(0, pausedAt - RUNUP), false);
      pausedAt = null;
    }
    audio.play();
  } else {
    // Pausing during a countdown still comes back in at the original spot.
    pausedAt = liveAt !== null && audio.currentTime < liveAt ? liveAt : audio.currentTime;
    liveAt = null;
    audio.pause();
  }
}

/* PAUSED while paused; while counting back in, the seconds to go, then LIVE. */
function renderOverlay() {
  const el = $('overlay');
  let big = '', small = '', mode = '';
  if (!$('loading').classList.contains('hidden')) { /* nothing over the loading message */ }
  else if (audio.paused) {
    mode = 'paused';
    liveShownAt = 0;
    big = 'PAUSED';
    small = pausedAt !== null ? `Press <kbd>Space</kbd> to play · back in at ${formatTime(pausedAt)}` : 'Press <kbd>Space</kbd> to play';
  } else if (liveAt !== null) {
    const left = (liveAt - audio.currentTime) / audio.playbackRate;
    if (left > 0) { mode = 'count'; big = String(Math.ceil(left)); small = 'back in at ' + formatTime(liveAt); liveShownAt = 0; }
    else {
      if (!liveShownAt) liveShownAt = performance.now();
      if (performance.now() - liveShownAt < 700) { mode = 'live'; big = 'LIVE'; }
      else { liveAt = null; liveShownAt = 0; }
    }
  }
  el.classList.toggle('hidden', !mode);
  if (!mode) return;
  if (el.dataset.big !== big) {
    // Each new number pulses in.
    el.classList.remove('tick');
    void el.offsetWidth;
    if (mode === 'count' || mode === 'live') el.classList.add('tick');
    el.dataset.big = big;
    $('ov-big').textContent = big;
  }
  if (el.dataset.small !== small) { el.dataset.small = small; $('ov-small').innerHTML = small; }
  el.classList.toggle('paused', mode === 'paused');
  el.classList.toggle('live', mode === 'live');
}

function updatePlayButton() { $('play-label').textContent = audio.paused ? 'Play' : 'Pause'; }
audio.addEventListener('play', updatePlayButton);
audio.addEventListener('pause', () => { updatePlayButton(); saveResume(); });
audio.addEventListener('ended', () => { updatePlayButton(); pausedAt = null; liveAt = null; save(KEY_RESUME, null); });

function currentSection(t) {
  let cur = null;
  for (const s of chart.sections) if (s.t <= t + 0.01) cur = s;
  return cur;
}

function buildSectionBar() {
  const el = $('sections');
  el.innerHTML = '';
  const len = chart.songLength;
  for (const s of chart.sections) {
    const d = document.createElement('div');
    d.style.left = `${(s.t / len) * 100}%`;
    d.style.width = `${((s.end - s.t) / len) * 100}%`;
    d.textContent = s.name === 'noguitar' ? '' : s.name;
    d.title = `${s.name} (${formatTime(s.t)})`;
    el.appendChild(d);
  }
}

$('progress').addEventListener('click', e => {
  const r = $('progress').getBoundingClientRect();
  const t = ((e.clientX - r.left) / r.width) * chart.songLength;
  if (e.shiftKey) { setLoopPoint(t); return; }
  // Snap to the start of the clicked section when clicking near it.
  const sec = currentSection(t);
  seek(sec && t - sec.t < 2 ? sec.t : t);
});

function toggleSectionLoop() {
  if (loop) { loop = null; }
  else {
    const t = songTime();
    const sec = currentSection(t) || { t: 0, end: chart.songLength };
    loop = { a: sec.t, b: sec.end };
    if (t < loop.a || t > loop.b) seek(loop.a);
  }
  renderLoop();
}

function setLoopPoint(t, which) {
  if (!loop) loop = { a: t, b: chart.songLength };
  if (which === 'a' || (!which && Math.abs(t - loop.a) < Math.abs(t - loop.b))) loop.a = t; else loop.b = t;
  if (loop.b < loop.a) [loop.a, loop.b] = [loop.b, loop.a];
  renderLoop();
}

function renderLoop() {
  $('loop').setAttribute('aria-pressed', String(!!loop));
  const el = $('loop-region');
  el.classList.toggle('hidden', !loop);
  if (loop) {
    el.style.left = `${(loop.a / chart.songLength) * 100}%`;
    el.style.width = `${((loop.b - loop.a) / chart.songLength) * 100}%`;
  }
}

$('back').addEventListener('click', closeSong);
$('tuner-btn').addEventListener('click', showTuner);
$('play').addEventListener('click', togglePlay);
$('loop').addEventListener('click', toggleSectionLoop);

function setSpeed(v) {
  v = Math.max(25, Math.min(120, v));
  $('speed').value = v;
  $('speed-val').textContent = `${v}%`;
  audio.playbackRate = v / 100;
}
$('speed').addEventListener('input', () => setSpeed(Number($('speed').value)));

$('difficulty').addEventListener('input', () => {
  prefs.difficulty = Number($('difficulty').value);
  $('diff-val').textContent = `${prefs.difficulty}%`;
  savePrefs();
  applyDifficulty();
});

const toggleSettingsPanel = () => $('settings').classList.toggle('hidden');
$('settings-btn').addEventListener('click', toggleSettingsPanel);
$('settings-close').addEventListener('click', () => $('settings').classList.add('hidden'));

$('volume').addEventListener('input', () => { prefs.volume = Number($('volume').value); audio.volume = prefs.volume / 100; savePrefs(); });
$('lookahead').addEventListener('input', () => { prefs.lookahead = Number($('lookahead').value); highway.lookahead = prefs.lookahead; savePrefs(); syncPlayerPrefs(); });
$('invert').addEventListener('change', () => { prefs.invert = $('invert').checked; highway.invert = prefs.invert; savePrefs(); });

/* The player's controls follow the saved preferences, wherever they were changed. */
function syncPlayerPrefs() {
  highway.lookahead = prefs.lookahead;
  highway.invert = prefs.invert;
  audio.volume = prefs.volume / 100;
  $('lookahead').value = prefs.lookahead;
  $('lookahead-val').textContent = `${prefs.lookahead}s`;
  $('invert').checked = prefs.invert;
  $('volume').value = prefs.volume;
  $('difficulty').value = prefs.difficulty;
  $('diff-val').textContent = `${prefs.difficulty}%`;
}
syncPlayerPrefs();

function showOffset() {
  $('offset-val').textContent = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms (positive = notes arrive later)`;
}
function setOffset(ms) {
  offsetMs = Math.max(Number($('offset').min), Math.min(Number($('offset').max), ms));
  $('offset').value = offsetMs;
  const all = load(KEY_OFFSETS, {});
  if (offsetMs) all[song.id] = offsetMs; else delete all[song.id];
  save(KEY_OFFSETS, all);
  showOffset();
}
for (const b of document.querySelectorAll('[data-nudge]')) b.addEventListener('click', () => setOffset(offsetMs + Number(b.dataset.nudge)));
$('offset').addEventListener('input', () => setOffset(Number($('offset').value)));

function playerKey(e) {
  const k = e.key;
  if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'ArrowLeft') { e.preventDefault(); seek(audio.currentTime - 5); }
  else if (k === 'ArrowRight') { e.preventDefault(); seek(audio.currentTime + 5); }
  else if (k === 'ArrowUp') { e.preventDefault(); setSpeed(Number($('speed').value) + 5); }
  else if (k === 'ArrowDown') { e.preventDefault(); setSpeed(Number($('speed').value) - 5); }
  else if (k === 'l' || k === 'L') toggleSectionLoop();
  else if (k === '[') setLoopPoint(songTime(), 'a');
  else if (k === ']') setLoopPoint(songTime(), 'b');
  else if (k === 'Home') seek(loop ? loop.a : 0);
  else if (k === ',') toggleSettingsPanel();
  else if (k === 't' || k === 'T') showTuner();
  else if (k === '?' || k === 'h') openHelp();
  else if (k === 'Escape') {
    if (!$('settings').classList.contains('hidden')) $('settings').classList.add('hidden');
    else closeSong();
  }
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.gk-sheet')) return; // an open sheet has the keys
  const typing = !!(e.target.closest && e.target.closest('input[type=search],input[type=text],select'));
  if ((e.key === 'm' || e.key === 'M') && !typing) { e.preventDefault(); setMuted(!muted); return; }
  if (screen === 'library') libraryKey(e, typing);
  else if (screen === 'player' && chart && !(e.target.tagName === 'INPUT' && e.target.type === 'range' && e.key.startsWith('Arrow'))) playerKey(e);
});

$('highway').addEventListener('wheel', e => {
  if (!chart || !audio.paused) return;
  e.preventDefault();
  seek(audio.currentTime + e.deltaY * 0.004);
}, { passive: false });

/* ---- frame loop ---- */
function frame() {
  if (chart && screen === 'player') {
    let t = songTime();
    if (loop && !audio.paused && t >= loop.b) {
      // Restart the loop with a short lead-in so you can get ready.
      seek(Math.max(0, loop.a - 1.0), false);
      t = songTime();
    }
    highway.draw(t);
    const len = chart.songLength;
    $('playhead').style.left = `${(Math.max(0, t) / len) * 100}%`;
    $('time').textContent = `${formatTime(t)} / ${formatTime(len)}`;
    renderOverlay();
    const sec = currentSection(t);
    $('section-name').textContent = sec && sec.name !== 'noguitar' ? sec.name : '';
    if (!audio.paused && performance.now() - lastResumeSave > 3000) { lastResumeSave = performance.now(); saveResume(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---- start: the boot plays while the song index loads, then the title ---- */
injectTitleCSS();
mountScene($('library').querySelector('.scene'));
const boot = runBoot({ lines: [bootReloadLine(), 'local server: your Rocksmith 2014 install'] });
if (prefs.hear > 0 && prefs.input) applyHear();
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
