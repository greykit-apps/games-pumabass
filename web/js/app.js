import { Highway } from './highway.js';
import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel } from './chart.js';
import { runBoot, mountTitle, bootReloadLine, injectTitleCSS, alertSheet } from './title.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT } from './help.js';
import { InstrumentInput, isRealTone } from './input.js';
import { openTuner, tuningTargets, tuningKey } from './tuner.js';
import { Mixer, RECORDED_BASS } from './mixer.js';
import { syncTest, SyncMeter, syncCue, syncResult, metronome, SYNC } from './calibrate.js';
import { Scorer } from './scoring.js';

const $ = id => document.getElementById(id);
const audio = $('audio');
// The song and your bass both play through the mixer, so they can be balanced.
const mixer = new Mixer();
mixer.attachSong(audio);
const highway = new Highway($('highway'));

/* ---- storage (games-meta STANDARD.md §5): every key is pumabass_<feature>_v<n>,
 * so Forget everything (§2) can find them all by the prefix. */
const KEY_PREFS = 'pumabass_prefs_v1';      // song-list filters and player preferences
const KEY_OFFSETS = 'pumabass_offsets_v1';  // per-song audio offset, ms
const KEY_RECENT = 'pumabass_recent_v1';    // per-song last-opened time
const KEY_RESUME = 'pumabass_resume_v1';    // the song and spot you left off at
const KEY_MUTED = 'pumabass_muted_v1';      // "1" muted, "0" not (§8)
const KEY_TUNER = 'pumabass_tuner_v1';      // the day and tuning you last tuned to
const KEY_FAVS = 'pumabass_favorites_v1';   // { id: true } for each favorite part
const KEY_STATS = 'pumabass_stats_v1';      // { id: { plays, finished, last } }
const KEY_LESSONS = 'pumabass_lessons_v1';  // { lesson key: { part name: true } }: lesson practice played through

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
  hear: false,      // play the input through the speakers
  bassBoost: 12,    // dB added to the input: the cable's signal is quiet next to a finished record
  recordedBass: 'full', // the song's own bass: full, reduced or cut (RECORDED_BASS)
  autoTune: true,   // open the tuner on the day's first song and when the tuning changes
  favOnly: false,   // the song list shows favorites only
  avOffset: 0,      // ms the notes land later, for every song: this computer's sound vs. its picture (calibrated)
  scoring: true,    // score the playing (only ever while an instrument input is open)
  repeatFrom: 60,   // the riff repeater starts here (%), when the song is at full speed
  repeatStep: 5,    // and speeds up this much (%) each time round
  inputOffset: 0,   // ms your plucks reach us later than the notes you see, through the input (from the sync test)
}, load(KEY_PREFS, {}));
if (typeof prefs.hear === 'number') prefs.hear = prefs.hear > 0; // was a volume
delete prefs.hearLast;
const savePrefs = () => save(KEY_PREFS, prefs);

/* ---- favorites and play counts ---- */
const isFav = id => !!load(KEY_FAVS, {})[id];
function toggleFav(id) {
  const favs = load(KEY_FAVS, {});
  if (favs[id]) delete favs[id]; else favs[id] = true;
  save(KEY_FAVS, favs);
  return !!favs[id];
}
const statsOf = id => load(KEY_STATS, {})[id] || { plays: 0, finished: 0 };
function bumpStat(id, field) {
  const all = load(KEY_STATS, {});
  const st = all[id] || { plays: 0, finished: 0 };
  st[field] = (st[field] || 0) + 1;
  st.last = Date.now();
  all[id] = st;
  save(KEY_STATS, all);
}

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
const SERVER_API = 4; // must match API_VERSION in server/server.js
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
mixer.setMuted(muted);
function setMuted(m) {
  muted = m;
  mixer.setMuted(m);
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
      { act: 'lessons', label: 'Lessons', key: 'L' },
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
      if (act === 'resume' && rs) { leaveTitle(); openSong(rs, resume.t, { resumed: true }); }
      if (act === 'tuner') showTuner();
      if (act === 'lessons') { leaveTitle(); showLessons(); }
      if (act === 'new' && !songs.length) pickLibrary();
      else if (act === 'new') { leaveTitle(); showLibrary(); }
    },
  };
}

function showTitle() {
  screen = 'title';
  $('library').classList.add('hidden');
  $('lessons').classList.add('hidden');
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
<h3>Timing</h3>
<p class='gk-note'>For every song, the notes land <b>${fmtMs(prefs.avOffset)}</b>${prefs.avOffset ? (prefs.avOffset > 0 ? ' later' : ' earlier') : ''}, to match this computer's sound and picture. Scoring allows <b>${fmtMs(prefs.inputOffset)}</b> for the cable.</p>
<div class='gk-row'><button data-set='calibrate'>Sync test</button><button data-set='av' data-v='-10'>&minus;10 ms</button><button data-set='av' data-v='10'>+10 ms</button><button data-set='av' data-v='0'>Reset</button></div>
<p class='gk-note'>A tick and a swinging bar: move the bar until it lands on the tick, and the notes will land on the music. With the Real Tone Cable open, you then pluck along with the tick for half a minute, which sets scoring's timing too. Run it again when you change speakers, headphones or screen; Bluetooth and TVs add delay.</p>
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
    case 'hear': hear.set(v === 'true'); break;
    case 'rb': setRecordedBass(v); break;
    case 'autotune': prefs.autoTune = v === 'true'; break;
    case 'scoring': prefs.scoring = v === 'true'; break;
    case 'repfrom': prefs.repeatFrom = Number(v); break;
    case 'repstep': prefs.repeatStep = Number(v); break;
    case 'av':
      if (Number(v) === 0) { prefs.avOffset = 0; prefs.inputOffset = 0; } else prefs.avOffset += Number(v);
      break;
    case 'calibrate':
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
  if (screen === 'player') startScoring();
  sheet.refresh();
}

/* ---- timing ---- */
const fmtMs = ms => `${ms > 0 ? '+' : ms < 0 ? '\u2212' : ''}${Math.abs(Math.round(ms))} ms`;

/* The sync test (web/js/calibrate.js) runs in the player as a short song of
 * its own. First the line-up: a tick and a swinging bar, the bar moved (the
 * picture's offset, live) until it lands on the tick. Then, with the cable,
 * the play-along: notes with the tick, the plucks measured. calib holds it
 * while it runs: the step, the offsets it started from, and the screen to go
 * back to. */
let calib = null;

async function runCalibration() {
  if (prefs.input) await ensureInput({ ask: false }); // the cable, if it was chosen and is plugged in
  const test = syncTest();
  calib = { test, meter: new SyncMeter(test.targets), back: screen, phase: 'align', orig: { av: prefs.avOffset, input: prefs.inputOffset } };
  if (screen === 'title') leaveTitle();
  closeEndScreen();
  song = { id: test.chart.id, title: 'Sync test', artist: 'PumaBass', type: 'bass', calib: true };
  chart = test.chart;
  screen = 'player';
  $('library').classList.add('hidden');
  $('lessons').classList.add('hidden');
  $('player').classList.remove('hidden');
  $('loading').classList.remove('hidden');
  $('p-title').textContent = 'Sync test';
  $('back').innerHTML = '<kbd>Esc</kbd>Back';
  $('p-sub').textContent = input.open ? 'Line up the picture with the sound, then play along on the cable' : 'Line up the picture with the sound';
  $('p-tuning').textContent = 'Open E string';
  offsetMs = 0;
  $('offset').value = 0; showOffset();
  loop = null;
  renderLoop();
  applyDifficulty();
  buildSectionBar();
  audio.src = test.url;
  await new Promise(resolve => { audio.addEventListener('canplay', resolve, { once: true }); });
  $('loading').classList.add('hidden');
  audio.currentTime = 0;
  pausedAt = null;
  liveAt = null;
  session = null;
  showFav();
  setSpeed(100);
  startScoring();
  $('metro').classList.remove('hidden', 'playing');
  $('metro-done').innerHTML = `<kbd>Enter</kbd>${input.open ? 'They match: play along' : 'They match'}`;
  togglePlay();
  updatePlayButton();
}

/* Move the bar: the picture's offset, live. */
function nudgeSync(ms) {
  if (!calib || calib.phase !== 'align') return;
  prefs.avOffset = Math.max(-1000, Math.min(1000, prefs.avOffset + ms));
}

/* The bar lands on the tick: on to the play-along (with the cable), or done. */
async function alignDone() {
  if (!calib || calib.phase !== 'align') return;
  if (!input.open) { await finishSync(); return; }
  calib.phase = 'play';
  calib.meter.reset();
  $('metro').classList.add('playing');
  seek(SYNC.PLAY);
  if (audio.paused) togglePlay();
}

/* The play-along is over: show what it measured. */
async function playAlongDone() {
  const current = { av: prefs.avOffset, input: prefs.inputOffset };
  const res = calib.meter.result(prefs.inputOffset);
  const choice = await syncResult(res, current);
  if (choice === 'retry') {
    calib.meter.reset();
    seek(SYNC.PLAY);
    if (audio.paused) togglePlay();
    return;
  }
  // The picture's offset was lined up by eye: it stays whatever is chosen here.
  if (choice === 'use') prefs.inputOffset = res.input;
  await finishSync();
}

/* Keep the offsets the test arrived at, and leave. */
async function finishSync() {
  savePrefs();
  const { orig } = calib;
  calib.kept = true;
  endSync();
  if (prefs.avOffset !== orig.av || prefs.inputOffset !== orig.input) {
    await alertSheet(`Timing set. For every song, the notes land ${fmtMs(prefs.avOffset)}${prefs.avOffset ? (prefs.avOffset > 0 ? ' later' : ' sooner') : ''}${prefs.inputOffset !== orig.input ? `, and scoring allows ${fmtMs(prefs.inputOffset)} for the cable` : ''}. You can nudge the notes in Settings.`, 'Sync test');
  }
}

/* Leave the test; left any other way than finishing, the offsets go back. */
function endSync() {
  const { back, test, kept, orig } = calib;
  if (!kept) { prefs.avOffset = orig.av; prefs.inputOffset = orig.input; savePrefs(); }
  calib = null;
  leaveSong();
  URL.revokeObjectURL(test.url);
  if (back === 'title') showTitle().reveal(); else showLibrary();
}

/* Keys during the test. True when handled. */
function calibKey(e) {
  const k = e.key;
  if (k === ' ' || k === 'Escape') return false; // play / pause, and leave, as ever
  e.preventDefault();
  if (calib.phase === 'align') {
    if (k === 'ArrowLeft') nudgeSync(e.shiftKey ? -20 : -5);
    else if (k === 'ArrowRight') nudgeSync(e.shiftKey ? 20 : 5);
    else if (k === 'Enter') alignDone();
  }
  return true;
}
for (const b of document.querySelectorAll('[data-av]')) b.addEventListener('click', () => nudgeSync(Number(b.dataset.av)));
$('metro-done').addEventListener('click', alignDone);

/* ---- the instrument input and the tuner ---- */
const input = new InstrumentInput(mixer);
input.onchange = () => {
  if (screen === 'title' && title && !document.querySelector('.gk-sheet')) { leaveTitle(); showTitle().reveal(); }
  if (screen === 'player') startScoring();
};
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

/* "Hear your bass": the input through the speakers. (The tuner's switch uses
 * volume/last/set: on is 1, off is 0.) */
const hear = {
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
async function applyMix() {
  mixer.setSongVolume(prefs.volume / 100);
  mixer.setRecordedBass(prefs.recordedBass);
  mixer.setBassBoost(prefs.bassBoost);
  if (prefs.hear && !input.open && prefs.input) await ensureInput({ ask: false });
  mixer.setHearBass(prefs.hear && input.open);
}

function setRecordedBass(mode) {
  prefs.recordedBass = RECORDED_BASS[mode] ? mode : 'full';
  savePrefs();
  applyMix();
  syncPlayerPrefs();
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1400);
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
          applyMix();
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
document.addEventListener('pointerdown', () => mixer.resume(), true);
document.addEventListener('keydown', () => mixer.resume(), true);
// For tests: feed any MediaStream in as the instrument (e.g. an oscillator).
window.pumabassDebug = { useInput: stream => { input.useStream(stream); applyMix(); }, input, mixer, highway, get session() { return session; }, get scorer() { return scorer; }, get sync() { return sync; }, inputBetween: (a, b) => inputBetween(a, b), get calib() { return calib; }, runCalibration: () => runCalibration(), openSong: title => openSong(songs.find(s => s.title === title && s.type === 'bass' && s.audio)), saveTake: () => saveTake() };

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
  lessonList = null; lesson = null;
  [songs, info] = await Promise.all([api('/api/songs'), api('/api/info')]);
  if (screen === 'library') renderLibrary();
}

function showLibrary() {
  screen = 'library';
  $('player').classList.add('hidden');
  $('lessons').classList.add('hidden');
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
  const favs = load(KEY_FAVS, {}), stats = load(KEY_STATS, {});
  let list = ofType.filter(s => (prefs.showMissing || s.audio !== false) && (!prefs.favOnly || favs[s.id]));
  if (q) list = list.filter(s => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  const cmp = {
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
    tuning: (a, b) => tuningName(a.tuning, stringsOf(a)).localeCompare(tuningName(b.tuning, stringsOf(b))) || a.artist.localeCompare(b.artist),
    recent: (a, b) => (recent[b.id] || 0) - (recent[a.id] || 0) || a.artist.localeCompare(b.artist),
    plays: (a, b) => ((stats[b.id] || {}).plays || 0) - ((stats[a.id] || {}).plays || 0) || ((stats[b.id] || {}).finished || 0) - ((stats[a.id] || {}).finished || 0) || a.artist.localeCompare(b.artist),
  }[prefs.sort] || (() => 0);
  list.sort((a, b) => cmp(a, b) || arrangementLabel(a).localeCompare(arrangementLabel(b)));

  for (const b of document.querySelectorAll('#type-filter button')) b.setAttribute('aria-pressed', String(b.dataset.type === prefs.type));
  $('sort').value = prefs.sort;
  $('fav-filter').setAttribute('aria-pressed', String(prefs.favOnly));

  const el = $('song-list');
  el.innerHTML = list.length ? '' : !songs.length
    ? '<div class="empty"><p>No songs yet. PumaBass plays your own Rocksmith 2014 song files: show it where they are.</p><button class="primary" data-act="choose">Choose your songs folder</button></div>'
    : `<div class="empty">${q ? 'No songs match that search.' : prefs.favOnly ? 'No favorites here yet. Star a song (&#9733;, or F on a song) to add it.' : 'No songs here.'}</div>`;
  const frag = document.createDocumentFragment();
  list.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'song' + (s.audio === false ? ' noaudio' : '');
    row.tabIndex = 0;
    row.dataset.id = s.id;
    row.setAttribute('role', 'listitem');
    const tn = tuningName(s.tuning, stringsOf(s));
    const st = stats[s.id] || {}, fav = !!favs[s.id];
    const num = v => `<span class="num${v ? '' : ' zero'}">${v || '\u2013'}</span>`;
    row.innerHTML = `<button class="star" data-fav aria-label="Favorite" aria-pressed="${fav}" title="Favorite (F)">${fav ? '\u2605' : '\u2606'}</button>
      <div style="min-width:0"><div class="t"></div><div class="a"></div></div>
      <span class="arr"></span>
      <span class="tun${tn === 'E Standard' ? ' std' : ''}"></span>
      ${num(st.plays)}${num(st.finished)}
      <span class="len">${formatTime(s.length)}</span>`;
    row.querySelector('.t').textContent = s.title;
    row.querySelector('.a').textContent = `${s.artist}${s.album ? ' · ' + s.album : ''}${s.year ? ' (' + s.year + ')' : ''}`;
    row.querySelector('.arr').innerHTML = s.audio === false ? 'No audio' : esc(arrangementLabel(s)) + (s.audio === 'user' ? ' <span class="mine">· yours</span>' : '');
    row.querySelector('.tun').textContent = tn + (s.centOffset ? ` ${s.centOffset > 0 ? '+' : ''}${Math.round(s.centOffset)}¢` : '');
    if (s.audio === false) row.title = 'No audio for this song yet. Put a recording named like "Artist - Title.mp3" in the music folder, then Rescan.';
    frag.appendChild(row);
  });
  el.appendChild(frag);
  $('count').textContent = `${list.length} ${prefs.favOnly ? (list.length === 1 ? 'favorite' : 'favorites') : list.length === 1 ? 'part' : 'parts'}`;
  const missing = ofType.filter(s => s.audio === false).length;
  $('missing-note').textContent = missing && !prefs.showMissing ? `${missing} without audio hidden (Settings)` : '';
}

/* Star a part, from its row: the row stays where it is (it only leaves the
 * list when the favorites filter is on). */
function starRow(row) {
  const on = toggleFav(row.dataset.id);
  const b = row.querySelector('[data-fav]');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '\u2605' : '\u2606';
  if (prefs.favOnly && !on) { const next = row.nextElementSibling || row.previousElementSibling; renderLibrary(); const n = next && $('song-list').querySelector(`.song[data-id="${CSS.escape(next.dataset.id || '')}"]`); if (n) n.focus({ preventScroll: true }); }
}

$('song-list').addEventListener('click', e => {
  if (e.target.closest('[data-act=choose]')) return pickLibrary();
  if (e.target.closest('[data-fav]')) { starRow(e.target.closest('.song')); return; }
  const row = e.target.closest('.song');
  const s = row && songs.find(x => x.id === row.dataset.id);
  if (s && s.audio !== false) openSong(s);
});
$('search').addEventListener('input', renderLibrary);
$('sort').addEventListener('change', () => { prefs.sort = $('sort').value; savePrefs(); renderLibrary(); });
$('fav-filter').addEventListener('click', () => { prefs.favOnly = !prefs.favOnly; savePrefs(); renderLibrary(); });
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
  else if ((k === 'f' || k === 'F') && !typing && i >= 0) { e.preventDefault(); starRow(rows[i]); }
  else if (k === 'Enter' && i >= 0) {
    const s = songs.find(x => x.id === rows[i].dataset.id);
    if (s && s.audio !== false) openSong(s);
  }
}

/* ---- lessons: Rocksmith's bass course (server/lessons.js) ----
 * The list, then one lesson: the instructor's words (from the videos, which
 * can't be played here) and the parts to play, each a stretch of the
 * lesson's chart, looped. Most lessons end with an etude, a short piece. */
let lessonList = null; // { found, words, lessons } from the server
let lesson = null;     // the lesson open, in full

/** Note a part of a lesson as played through. True the first time. */
function markLesson(key, part) {
  const all = load(KEY_LESSONS, {});
  const p = all[key] || (all[key] = {});
  if (p[part]) return false;
  p[part] = true;
  save(KEY_LESSONS, all);
  return true;
}
/** What there is to play in a lesson, and how much of it is played. */
function lessonProgress(l) {
  const p = load(KEY_LESSONS, {})[l.key] || {};
  const total = l.practice + (l.etude ? 1 : 0);
  const done = Object.keys(p).filter(k => k !== 'read').length;
  return { total, done: Math.min(done, total), read: !!p.read || (total > 0 && done >= total) };
}
const lessonName = l => (/^special topics$/i.test(l.name) ? l.topic : l.name);
const lessonSub = l => (/^special topics$/i.test(l.name) ? '' : l.topic);

async function showLessons(key = null, part = null) {
  screen = 'lessons';
  $('library').classList.add('hidden');
  $('player').classList.add('hidden');
  $('lessons').classList.remove('hidden');
  const body = $('lesson-body');
  if (!lessonList) {
    body.innerHTML = '<div class="empty">Reading the lessons&hellip;</div>';
    try { lessonList = await api('/api/lessons'); }
    catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  }
  if (key && lessonList.found) {
    if (!lesson || lesson.key !== key) await openLesson(key); else renderLesson();
    const go = part && body.querySelector(part === 'etude' ? '[data-etude]' : `[data-go="${CSS.escape(part)}"]`);
    if (go) { go.focus({ preventScroll: true }); go.scrollIntoView({ block: 'center' }); }
  } else renderLessonList(key);
}

function renderLessonList(focusKey = null) {
  lesson = null;
  $('lsn-title').textContent = 'Lessons';
  $('lsn-back').textContent = 'Menu';
  const body = $('lesson-body');
  if (!lessonList.found) {
    $('lsn-count').textContent = '';
    body.innerHTML = `<div class="empty"><p>The lessons come from Rocksmith 2014's <code>etudes.psarc</code>, with their words from <code>static.psarc</code>. Neither is in your songs folder${info.libraryDir ? ` (<code>${esc(info.libraryDir)}</code>)` : ''}.</p><p>Copy both from the Rocksmith 2014 folder into it, then Rescan in Settings.</p></div>`;
    return;
  }
  const groups = [['Getting started', l => l.order < 1030], ['The course', l => l.order >= 1030 && l.order < 1310], ['Special topics', l => l.order >= 1310]];
  let html = '', played = 0;
  for (const [name, test] of groups) {
    const list = lessonList.lessons.filter(test);
    if (!list.length) continue;
    html += `<div class="lsn-group">${name}</div>`;
    for (const l of list) {
      const pr = lessonProgress(l);
      if (pr.read) played++;
      const what = l.kind === 'VideoOnly' ? 'Reading' : [l.practice ? `${l.practice} to play` : '', l.etude ? 'etude' : ''].filter(Boolean).join(' \u00b7 ');
      html += `<div class="lesson" tabindex="0" role="listitem" data-key="${esc(l.key)}">
        <span class="chk${pr.read ? ' done' : ''}">${pr.read ? '&#10003;' : ''}</span>
        <div style="min-width:0"><div class="t">${esc(lessonName(l))}</div><div class="a">${esc(lessonSub(l))}</div></div>
        <span class="what">${esc(what)}</span>
        <span class="prog">${pr.total ? `${pr.done} of ${pr.total}` : pr.read ? 'read' : ''}</span>
      </div>`;
    }
  }
  body.innerHTML = `<div role="list">${html}</div>`;
  $('lsn-count').textContent = `${lessonList.lessons.length} bass lessons \u00b7 ${played} done`;
  const row = (focusKey && body.querySelector(`.lesson[data-key="${CSS.escape(focusKey)}"]`)) || body.querySelector('.lesson');
  if (row) { row.focus({ preventScroll: true }); if (focusKey) row.scrollIntoView({ block: 'center' }); }
}

async function openLesson(key) {
  const body = $('lesson-body');
  body.innerHTML = '<div class="empty">Opening the lesson&hellip;</div>';
  try { lesson = await api(`/api/lessons/${encodeURIComponent(key)}`); }
  catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!lesson.practice && !lesson.etudeSong) markLesson(key, 'read'); // words only: reading it is doing it
  renderLesson();
  const first = body.querySelector('button');
  $('lessons').scrollTop = 0;
  if (first) first.focus({ preventScroll: true });
}

function renderLesson() {
  const d = lesson, done = load(KEY_LESSONS, {})[d.key] || {};
  $('lsn-title').textContent = lessonName(d);
  $('lsn-back').textContent = 'Lessons';
  $('lsn-count').textContent = lessonSub(d);
  const playable = s => s && s.audio !== false;
  const step = x => {
    if (x.type === 'read') return `<div class="lsn-read"><h3>${esc(x.title)}</h3>${x.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
    const len = Math.round(x.b - x.a);
    const ok = playable(d.lessonSong);
    const buttons = x.type === 'riff' && x.demo
      ? `<button class="primary" data-go="${esc(x.name)}" data-demo ${ok ? '' : 'disabled'}>Watch, then play</button><button data-go="${esc(x.name)}" ${ok ? '' : 'disabled'}>Play</button>`
      : `<button class="primary" data-go="${esc(x.name)}" ${ok ? '' : 'disabled'}>Play</button>`;
    return `<div class="lsn-step"><span class="chk${done[x.name] ? ' done' : ''}">${done[x.name] ? '&#10003;' : '&#9675;'}</span>
      <div class="what"><b>${esc(x.title)}</b><small>${x.type === 'riff' && x.demo ? 'An example first, then your turn. ' : ''}${len} seconds, round and round: <kbd>R</kbd> speeds it up each time</small></div>${buttons}</div>`;
  };
  let html = `<div class="lsn-detail">${d.description ? `<p class="lsn-desc">${esc(d.description)}</p>` : ''}`;
  if (!lessonList.words) html += '<p class="lsn-note">The instructor\'s words come from Rocksmith\'s <code>static.psarc</code>: copy it into your songs folder and Rescan to read them here.</p>';
  for (const sec of d.sections) html += `<h2 class="lsn-sec">${esc(sec.title)}</h2>${sec.steps.map(step).join('')}`;
  if (d.etudeSong) {
    html += `<h2 class="lsn-sec">Etude</h2><div class="lsn-step"><span class="chk${done.etude ? ' done' : ''}">${done.etude ? '&#10003;' : '&#9675;'}</span>
      <div class="what"><b>${esc(d.etudeSong.title)}</b><small>A short piece with a band, using what this lesson teaches &middot; ${formatTime(d.etudeSong.length)}</small></div>
      <button class="primary" data-etude ${playable(d.etudeSong) ? '' : 'disabled'}>Play</button></div>`;
  }
  if (!d.sections.length && !d.etudeSong) html += '<p class="lsn-note">Nothing to read or play in this one.</p>';
  if ((d.lessonSong && !playable(d.lessonSong)) || (d.etudeSong && !playable(d.etudeSong))) html += '<p class="lsn-note">Some of this lesson\'s audio is missing: it lives in <code>etudes.psarc</code>, and plays through vgmstream.</p>';
  $('lesson-body').innerHTML = html + '</div>';
}

/* Play one part of the lesson: its stretch of the chart, looped (a riff can
 * start with its example). Or the etude, as a song. */
function playLessonPart(name, demo) {
  const d = lesson;
  const x = d.sections.flatMap(sec => sec.steps).find(st => st.name === name);
  if (!x) return;
  const s = { ...d.lessonSong, title: `${lessonName(d)}: ${x.title}`, lessonCtx: { key: d.key, part: name, a: x.a, b: x.b } };
  openSong(s, demo && x.demo ? x.demo.a : x.a);
}
function playEtude() {
  const d = lesson;
  openSong({ ...d.etudeSong, lessonCtx: { key: d.key, part: 'etude' } }, 0);
}

$('lesson-body').addEventListener('click', e => {
  const row = e.target.closest('.lesson');
  if (row) { openLesson(row.dataset.key); return; }
  const go = e.target.closest('[data-go]');
  if (go) { playLessonPart(go.dataset.go, go.hasAttribute('data-demo')); return; }
  if (e.target.closest('[data-etude]')) playEtude();
});
$('lessons').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'back') lessonsBack();
  else if (b.dataset.act === 'help') openHelp();
});
function lessonsBack() {
  if (lesson) renderLessonList(lesson.key);
  else showTitle().reveal();
}
function lessonsKey(e) {
  const k = e.key;
  const items = [...$('lesson-body').querySelectorAll('.lesson, button:not([disabled])')];
  const i = items.indexOf(document.activeElement);
  if (k === 'Escape') { e.preventDefault(); lessonsBack(); }
  else if (k === '?' || k === 'h') { e.preventDefault(); openHelp(); }
  else if (k === 't' || k === 'T') { e.preventDefault(); showTuner(); }
  else if (k === 'ArrowDown' && items.length) { e.preventDefault(); const n = items[Math.min(items.length - 1, i + 1)]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  else if (k === 'ArrowUp' && items.length) { e.preventDefault(); const n = items[Math.max(0, i - 1)]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  else if (k === 'Enter' && document.activeElement && document.activeElement.classList.contains('lesson')) { e.preventDefault(); openLesson(document.activeElement.dataset.key); }
}

/* ---- the riff repeater: the loop, a little faster each time round ---- */
let repeater = null; // while on: { passes, mark } (mark: scoring's counts when this time round began)

function toggleRepeater() {
  if (!chart) return;
  if (repeater) { repeater = null; toast('Riff repeater off'); }
  else {
    if (!loop) toggleSectionLoop();
    if (Number($('speed').value) >= 100) setSpeed(prefs.repeatFrom);
    repeater = { passes: 0, mark: scorer ? { hits: scorer.hits, judged: scorer.judged } : null };
    toast(`Riff repeater: ${$('speed').value}% up to 100%`);
  }
  renderLoop();
}

/* The loop came round: up the speed (with scoring on, only after a good time round). */
function repeaterPass() {
  if (!repeater) return;
  repeater.passes++;
  const v = Number($('speed').value);
  let good = true, note = '';
  if (scorer && repeater.mark) {
    const judged = scorer.judged - repeater.mark.judged, hits = scorer.hits - repeater.mark.hits;
    if (judged >= 3) { good = hits / judged >= 0.7; note = ` \u00b7 ${Math.round((100 * hits) / judged)}% hit`; }
  }
  repeater.mark = scorer ? { hits: scorer.hits, judged: scorer.judged } : null;
  if (v >= 100) { toast(`Full speed, time ${repeater.passes}${note}`); return; }
  if (!good) { toast(`Again at ${v}%${note} (70% to speed up)`); return; }
  const next = Math.min(100, v + prefs.repeatStep);
  setSpeed(next);
  toast(next >= 100 ? `Full speed!${note}` : `Speed ${next}%${note}`);
}

/* Each time a loop comes round. */
function loopCameRound() {
  repeaterPass();
  const ctx = song && song.lessonCtx;
  if (ctx && ctx.part !== 'etude' && markLesson(ctx.key, ctx.part)) setTimeout(() => toast('Played through \u2713 \u00b7 Esc for the lesson'), repeater ? 1500 : 0);
}

/* ---- the player ---- */
let chart = null;
let song = null;
let loop = null; // { a, b }
let offsetMs = 0;
const clock = { raw: 0, stamp: 0 };
let lastResumeSave = 0;
/* This sitting with the song, for the play counts: a play is counted the first
 * time it starts (a resumed song is the same play), and a finish when playback
 * reaches the last note having played at least half of what was ahead of it. */
let session = null;
/* The run-up: play after a pause starts RUNUP seconds back and counts down to
 * the spot you stopped at ("live"), so you can find the groove again. pausedAt
 * is that spot; an explicit jump while paused (click, keys, wheel) clears it,
 * since then you chose where to start. */
const RUNUP = 6;
let pausedAt = null;   // where play will count back in to, or null
let liveAt = null;     // the spot the countdown is counting to, while it runs
let liveShownAt = 0;   // when LIVE went up, to take it down again

async function openSong(s, startAt = 0, { resumed = false } = {}) {
  closeEndScreen();
  song = s;
  screen = 'player';
  repeater = null;
  $('library').classList.add('hidden');
  $('lessons').classList.add('hidden');
  $('player').classList.remove('hidden');
  $('loading').classList.remove('hidden');
  $('p-title').textContent = s.title;
  $('p-sub').textContent = s.lessonCtx ? s.artist : `${s.artist} · ${arrangementLabel(s)}`;
  $('back').innerHTML = `<kbd>Esc</kbd>${s.lessonCtx ? 'Lesson' : 'Songs'}`;
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
  // A lesson's part: its stretch, looped, from where it starts (no run-up: it has its own count-in).
  if (s.lessonCtx && s.lessonCtx.a !== undefined) { pausedAt = null; loop = { a: s.lessonCtx.a, b: s.lessonCtx.b }; renderLoop(); }
  const last = highway.notes.slice(-40).reduce((m, n) => Math.max(m, n.t + (n.sus || 0)), 0);
  session = { id: s.id, start: startAt, counted: resumed, finished: false, heard: 0, lastT: null, end: last || audio.duration || chart.songLength };
  showFav();
  liveAt = null;
  setSpeed(prefs.startSpeed); // loading a new source resets the rate
  updatePlayButton();
  saveResume();
  await maybeAutoTune();
  startScoring();
  // Straight into it: every song has ten seconds or so before its first note,
  // and a lesson's part its own count-in. (Resume game counts back in, as a
  // play after a pause does.)
  if (song === s && audio.paused) togglePlay();
}

function saveResume() {
  if (song && chart && !song.calib && !song.lesson) save(KEY_RESUME, { id: song.id, t: Math.round(audio.currentTime * 10) / 10 });
}

/* Stop the song and put the player away. */
function leaveSong() {
  scorer = null;
  repeater = null;
  input.tape = null; input.taping = false; take = null;
  $('save-take').disabled = true;
  $('calib-cue').classList.add('hidden');
  $('metro').classList.add('hidden');
  updateHud();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  chart = null;
  session = null;
  closeEndScreen();
  $('settings').classList.add('hidden');
}

function closeSong() {
  if (calib) { endSync(); return; }
  if (song && song.lessonCtx) { const { key, part } = song.lessonCtx; leaveSong(); showLessons(key, part); return; }
  saveResume();
  leaveSong();
  showLibrary();
  const row = $('song-list').querySelector(`.song[data-id="${CSS.escape(song.id)}"]`);
  if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); }
}

function applyDifficulty() {
  if (!chart) return;
  highway.setChart(chart, buildPlayable(chart, prefs.difficulty));
  if (scorer) startScoring(); // new notes: score afresh
}

/* ---- scoring ---- */
let scorer = null;
let sync = null; // this frame's song time against the audio clock, to find the input for a note

const sectionIndex = t => chart.sections.findIndex(x => x.t <= t && t < x.end);

/* Score while it is on and an input is open; otherwise, not at all. */
function startScoring() {
  scorer = prefs.scoring && input.open && chart && !calib ? new Scorer(chart, highway.notes, sectionIndex) : null;
  if (scorer) scorer.seek(songTime());
  startTake();
  updateHud();
}

/* A take: what the input heard, with the clock and the verdicts, kept to save
 * for tuning the scoring. Only when asked for (Record a take, in the Mix
 * panel), and only while scoring: a song's worth of input is ~100 MB. */
let take = null;
let recordTake = false; // asked for: stays on until switched off (not saved)
function startTake() {
  if (scorer && recordTake) { input.startTape(); take = { syncs: [], verdicts: [] }; }
  else { input.tape = null; take = null; }
  $('save-take').disabled = !take;
}

/* Save the take so far to the PumaBass folder (takes/): the playing, the song's
 * notes and how each was judged, to study and tune scoring with. */
async function saveTake() {
  const tape = input.tape;
  if (!tape || !tape.samples || !take || !chart) { toast('Nothing recorded yet: tick Record a take, then play.'); return false; }
  const { levels, ...songChart } = chart;
  const meta = {
    title: `${song.title} (${arrangementLabel(song)})`, artist: song.artist, songId: song.id,
    difficulty: prefs.difficulty, sampleRate: input.sampleRate, input: input.label,
    latency: input.latency, inputOffset: prefs.inputOffset, avOffset: prefs.avOffset, offsetMs, bassBoost: prefs.bassBoost,
    chunks: tape.chunks.map(c => c.length), t0s: tape.t0s,
    syncs: take.syncs, verdicts: take.verdicts, chart: songChart, notes: highway.notes,
  };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const len = new DataView(new ArrayBuffer(4));
  len.setUint32(0, json.length, true);
  toast('Saving the take\u2026');
  try {
    const r = await fetch('/api/takes', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([len, json, ...tape.chunks]) });
    if (!r.ok) throw new Error(r.status === 404 ? SERVER_OLD : `The server said ${r.status}.`);
    const { file } = await r.json();
    toast(`Take saved: takes/${file.split(/[\\/]/).pop()}`);
    return true;
  } catch (e) {
    await alertSheet(e.message === 'Failed to fetch' ? SERVER_DOWN : e.message, "Can't save the take");
    return false;
  }
}

/* The input for song time t0..t1: the audio clock at song time T is this
 * frame's clock, less how far back T is (in real time), plus the input's own
 * delay. Returned in real time, with the song time of its first sample. */
function inputBetween(t0, t1) {
  if (!sync) return null;
  const lat = input.latency + prefs.inputOffset / 1000;
  const ctxOf = T => sync.ctx - (sync.song - T) / sync.rate + lat;
  const seg = input.segment(ctxOf(t0), ctxOf(t1));
  if (!seg || seg === 'later') return seg;
  return { x: seg.x, sr: input.sampleRate, t0: sync.song - (sync.ctx - (seg.c0 - lat)) * sync.rate };
}

function updateHud() {
  const el = $('score-hud');
  el.classList.toggle('hidden', !scorer);
  if (!scorer) return;
  const acc = scorer.accuracy;
  const text = acc === null ? 'Scoring' : `${Math.round(acc * 100)}% \u00b7 streak ${scorer.streak}`;
  if (el.textContent !== text) el.textContent = text;
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
  return est - (offsetMs + prefs.avOffset) / 1000;
}

function seek(t, chosen = true) {
  if (chosen) { pausedAt = null; liveAt = null; }
  audio.currentTime = Math.max(0, Math.min(t, (audio.duration || chart.songLength) - 0.05));
  clock.raw = audio.currentTime; clock.stamp = performance.now();
  if (scorer) scorer.seek(songTime()); // carry on judging from here
  if (calib) calib.meter.seek(songTime());
}

function togglePlay() {
  if (!chart) return;
  if (audio.paused) {
    if (pausedAt !== null) {
      liveAt = pausedAt;
      seek(Math.max(0, pausedAt - RUNUP), false);
      pausedAt = null;
    }
    audio.play().catch(() => {}); // the browser may hold it back until a click or key: then it stays PAUSED
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
  if (!$('loading').classList.contains('hidden') || endScreen) { /* nothing over the loading message or the end screen */ }
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
audio.addEventListener('play', () => {
  updatePlayButton();
  if (session && !session.counted) { session.counted = true; bumpStat(session.id, 'plays'); }
});

function checkFinished(t) {
  if (!session || session.finished || t < session.end) return;
  if (session.heard < 0.5 * Math.max(1, session.end - session.start)) return;
  session.finished = true;
  bumpStat(session.id, 'finished');
  toast('Finished \u2713');
}

function showFav() {
  $('fav-btn').classList.toggle('hidden', !!(song && (song.calib || song.lessonCtx)));
  const on = !!song && isFav(song.id);
  $('fav-btn').setAttribute('aria-pressed', String(on));
  $('fav-btn').textContent = on ? '\u2605' : '\u2606';
}
$('fav-btn').addEventListener('click', () => { if (song && !song.calib && !song.lessonCtx) { toggleFav(song.id); showFav(); } });
audio.addEventListener('pause', () => { updatePlayButton(); saveResume(); });
audio.addEventListener('ended', () => {
  if (calib) { updatePlayButton(); playAlongDone(); return; }
  checkFinished(Infinity);
  if (song && song.lessonCtx && song.lessonCtx.part === 'etude' && session && session.finished) markLesson(song.lessonCtx.key, 'etude');
  updatePlayButton();
  pausedAt = null;
  liveAt = null;
  save(KEY_RESUME, null); // a song played to the end leaves nothing to resume
  showEndScreen();
});

/* ---- the end screen: what this play was, and (to come) its score ---- */
let endScreen = null;

function showEndScreen() {
  if (endScreen || !song || !chart) return;
  const st = statsOf(song.id);
  const notes = highway.notes.reduce((n, e) => n + (e.notes ? e.notes.length : 1), 0);
  const played = session ? session.heard : 0;
  const finished = !!(session && session.finished);
  const tn = tuningName(chart.tuning, chart.strings);
  const tile = (label, value, note = '') => `<div class="end-tile"><small>${label}</small><span>${value}</span>${note ? `<em>${note}</em>` : ''}</div>`;
  const sc = scorer && scorer.judged ? scorer : null;
  const pct = sc ? Math.round(sc.accuracy * 100) : null;
  // A best only counts for a full play: finished, with most of the notes judged.
  let best = st.best ?? null, newBest = false;
  if (sc && finished && sc.judged >= 0.8 * highway.notes.length && (best === null || pct > best)) {
    newBest = best !== null;
    best = pct;
    const all = load(KEY_STATS, {});
    all[song.id] = { ...(all[song.id] || {}), best: pct };
    save(KEY_STATS, all);
  }
  const timing = sc && sc.timing();
  const scoreNote = sc ? `${sc.hits} of ${sc.judged} notes hit${newBest ? ' \u00b7 a new best' : ''}`
    : !prefs.scoring ? 'Scoring is off. Turn it on in Settings, or the Mix panel (,).'
      : !input.open ? 'Plug in the Real Tone Cable (or choose an input in Settings) to have your playing scored.'
        : 'No notes were scored this time.';
  // Each section's accuracy, as a strip along the song.
  const len = chart.songLength;
  const strip = sc ? `<div class="end-strip" aria-label="Accuracy by section">${chart.sections.map((x, i) => {
    const r = sc.sections.get(i);
    const a = r && r.judged ? r.hits / r.judged : null;
    const color = a === null ? 'var(--line)' : `hsl(${Math.round(a * a * 120)}, 70%, 48%)`;
    return `<i style="width:${((x.end - x.t) / len) * 100}%;background:${color}" title="${esc(x.name)}${a === null ? '' : ` \u00b7 ${Math.round(a * 100)}%`}"></i>`;
  }).join('')}</div><p class="end-strip-note">by section: red is where to practise</p>` : '';
  const el = document.createElement('div');
  el.className = 'gk-sheet end-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Song complete');
  el.innerHTML = `<div class="gk-box end">
    <div class="end-head">
      <p class="end-kicker">Song complete</p>
      <h2 class="end-title">${esc(song.title)}</h2>
      <p class="end-sub">${esc(song.artist)} &middot; ${esc(arrangementLabel(song))} &middot; ${esc(tn)}</p>
    </div>
    <div class="end-score">
      <small>Score</small>
      <span class="end-score-value">${pct === null ? '&ndash;' : `${pct}%`}</span>
      <em>${scoreNote}</em>
      ${strip}
    </div>
    <div class="end-tiles">
      ${tile('Notes', notes, `at ${prefs.difficulty}% difficulty`)}
      ${tile('Speed', `${$('speed').value}%`)}
      ${tile('Played', formatTime(played), `of ${formatTime(session ? session.end - session.start : chart.songLength)}`)}
      ${tile('Finished', finished ? 'Counted &#10003;' : 'Not counted', finished ? '' : 'less than half was played')}
      ${tile('Plays', st.plays || 0, 'all time')}
      ${tile('Times finished', st.finished || 0, 'all time')}
      ${sc ? tile('Best streak', sc.best, `of ${sc.judged} notes`) : ''}
      ${sc ? tile('Timing', timing ? (Math.abs(timing.ms) < 10 ? 'On the beat' : `${Math.round(Math.abs(timing.ms))} ms ${timing.ms > 0 ? 'late' : 'early'}`) : '\u2013', timing ? `typical, give or take ${Math.round(timing.spread)} ms` : 'too few plucks to tell') : ''}
      ${sc || best !== null ? tile('Best', best === null ? '\u2013' : `${best}%`, 'full plays') : ''}
    </div>
    <div class="gk-row end-acts">
      <button class="primary" data-end="menu"><kbd>Space</kbd>Main menu</button>
      <button data-end="again"><kbd>R</kbd>Play again</button>
      <button data-end="list"><kbd>Esc</kbd>${song.lessonCtx ? 'The lesson' : 'Song list'}</button>
      ${input.tape && input.tape.samples ? '<button data-end="take" title="Saves what the cable heard, with how each note was judged, in the PumaBass folder (takes), for tuning the scoring"><kbd>S</kbd>Save take</button>' : ''}
    </div>
  </div>`;
  const act = what => {
    const s = song;
    if (what === 'menu') { leaveSong(); showTitle().reveal(); }
    else if (what === 'list' && s.lessonCtx) { leaveSong(); showLessons(s.lessonCtx.key, s.lessonCtx.part); }
    else if (what === 'list') { leaveSong(); showLibrary(); }
    else if (what === 'again') { leaveSong(); openSong(s); }
    else if (what === 'take') {
      const b = el.querySelector('[data-end="take"]');
      if (b && !b.disabled) { b.disabled = true; saveTake().then(ok => { if (ok) b.innerHTML = 'Take saved &#10003;'; else b.disabled = false; }); }
    }
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-end]'); if (b) act(b.dataset.end); });
  el.onKey = e => {
    e.stopPropagation(); // nothing reaches the player behind
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' || (k === 'Enter' && !e.target.closest('button'))) { e.preventDefault(); act('menu'); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); act('again'); }
    else if (k === 's' || k === 'S') { e.preventDefault(); act('take'); }
    else if (k === 'Escape') { e.preventDefault(); act('list'); }
  };
  document.addEventListener('keydown', el.onKey, true);
  $('player').appendChild(el);
  endScreen = el;
  el.querySelector('[data-end="menu"]').focus({ preventScroll: true });
}

function closeEndScreen() {
  if (!endScreen) return;
  document.removeEventListener('keydown', endScreen.onKey, true);
  endScreen.remove();
  endScreen = null;
}

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
  if (loop) { loop = null; repeater = null; }
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

/* Where a loop goes back to: a second's run-up before its start. */
const loopFrom = () => Math.max(0, loop.a - 1.0);

function renderLoop() {
  highway.loop = loop ? { from: loopFrom(), to: loop.b } : null;
  $('loop').setAttribute('aria-pressed', String(!!loop));
  $('repeat').setAttribute('aria-pressed', String(!!repeater));
  $('repeat-label').textContent = repeater ? `Riff repeater \u00b7 ${$('speed').value}%` : 'Riff repeater';
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
$('repeat').addEventListener('click', toggleRepeater);

function setSpeed(v) {
  v = Math.max(25, Math.min(120, v));
  $('speed').value = v;
  $('speed-val').textContent = `${v}%`;
  audio.playbackRate = v / 100;
  if (repeater) $('repeat-label').textContent = `Riff repeater \u00b7 ${v}%`;
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

$('volume').addEventListener('input', () => { prefs.volume = Number($('volume').value); savePrefs(); applyMix(); });
$('boost').addEventListener('input', () => { prefs.bassBoost = Number($('boost').value); savePrefs(); applyMix(); syncPlayerPrefs(); });
$('hear').addEventListener('change', async () => {
  prefs.hear = $('hear').checked;
  savePrefs();
  if (prefs.hear && !(await ensureInput())) prefs.hear = false;
  savePrefs();
  applyMix();
  syncPlayerPrefs();
});
$('save-take').addEventListener('click', () => saveTake());
$('record-take').addEventListener('change', () => { recordTake = $('record-take').checked; startTake(); });
$('score-toggle').addEventListener('change', () => { prefs.scoring = $('score-toggle').checked; savePrefs(); if (screen === 'player') startScoring(); });
$('recorded-bass').addEventListener('click', e => { const b = e.target.closest('[data-rb]'); if (b) setRecordedBass(b.dataset.rb); });
$('lookahead').addEventListener('input', () => { prefs.lookahead = Number($('lookahead').value); highway.lookahead = prefs.lookahead; savePrefs(); syncPlayerPrefs(); });
$('invert').addEventListener('change', () => { prefs.invert = $('invert').checked; highway.invert = prefs.invert; savePrefs(); });

/* The player's controls follow the saved preferences, wherever they were changed. */
function syncPlayerPrefs() {
  highway.lookahead = prefs.lookahead;
  highway.invert = prefs.invert;
  audio.volume = 1; // the song's volume is the mixer's
  $('lookahead').value = prefs.lookahead;
  $('lookahead-val').textContent = `${prefs.lookahead}s`;
  $('invert').checked = prefs.invert;
  $('volume').value = prefs.volume;
  $('hear').checked = prefs.hear;
  $('score-toggle').checked = prefs.scoring;
  $('boost').value = prefs.bassBoost;
  $('boost-val').textContent = `+${prefs.bassBoost} dB`;
  for (const b of document.querySelectorAll('#recorded-bass [data-rb]')) b.setAttribute('aria-pressed', String(b.dataset.rb === prefs.recordedBass));
  $('difficulty').value = prefs.difficulty;
  $('diff-val').textContent = `${prefs.difficulty}%`;
}
syncPlayerPrefs();

function showOffset() {
  $('offset-val').textContent = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms (positive = notes arrive later)`
    + (prefs.avOffset ? `, on top of ${fmtMs(prefs.avOffset)} for every song` : '');
}
function setOffset(ms) {
  offsetMs = Math.max(Number($('offset').min), Math.min(Number($('offset').max), ms));
  $('offset').value = offsetMs;
  if (!song.calib) {
    const all = load(KEY_OFFSETS, {});
    if (offsetMs) all[song.id] = offsetMs; else delete all[song.id];
    save(KEY_OFFSETS, all);
  }
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
  else if (k === 'r' || k === 'R') toggleRepeater();
  else if (k === '[') setLoopPoint(songTime(), 'a');
  else if (k === ']') setLoopPoint(songTime(), 'b');
  else if (k === 'Home') seek(loop ? loop.a : 0);
  else if (k === ',') toggleSettingsPanel();
  else if (k === 't' || k === 'T') showTuner();
  else if ((k === 'f' || k === 'F') && !song.lessonCtx) { toggleFav(song.id); showFav(); toast(isFav(song.id) ? '\u2605 Favorite' : 'Not a favorite'); }
  else if (k === 'b' || k === 'B') {
    const modes = Object.keys(RECORDED_BASS);
    setRecordedBass(modes[(modes.indexOf(prefs.recordedBass) + 1) % modes.length]);
    toast(`Recorded bass: ${RECORDED_BASS[prefs.recordedBass].label}`);
  }
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
  if (calib && screen === 'player' && calibKey(e)) return;
  if (screen === 'library') libraryKey(e, typing);
  else if (screen === 'lessons') lessonsKey(e);
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
      // Carry on from just as far past the run-up as play went past the end, so the highway runs on unbroken.
      seek(loopFrom() + Math.min(0.1, t - loop.b), false);
      t = songTime();
      loopCameRound();
    }
    highway.draw(t);
    const len = chart.songLength;
    $('playhead').style.left = `${(Math.max(0, t) / len) * 100}%`;
    $('time').textContent = `${formatTime(t)} / ${formatTime(len)}`;
    renderOverlay();
    // How much of the song was actually played: each step forward, measured
    // against the clock, so a jump (far more song than time passed) counts for
    // nothing, while a slow or throttled frame still counts in full.
    if (session && !audio.paused) {
      const now = performance.now();
      if (session.lastT !== null) {
        const step = t - session.lastT, allowed = ((now - session.lastWall) / 1000) * audio.playbackRate + 0.25;
        if (step > 0 && step <= allowed) session.heard += step;
      }
      session.lastT = t;
      session.lastWall = now;
      checkFinished(t);
    } else if (session) session.lastT = null;
    if (!audio.paused) {
      sync = { song: t, ctx: mixer.ctx.currentTime, rate: audio.playbackRate };
      if (scorer && input.open) {
        if (take) take.syncs.push([Math.round(t * 1e4) / 1e4, Math.round(sync.ctx * 1e5) / 1e5, sync.rate]);
        scorer.update(t, audio.playbackRate, inputBetween, (ev, r) => {
          highway.mark(ev, r.hit);
          if (take) take.verdicts.push([ev.t, r.hit ? 1 : 0, r.why || '', r.offset === null ? null : Math.round(r.offset * 1e4) / 1e4]);
        });
        updateHud();
      }
      if (calib && calib.phase === 'play' && input.open) calib.meter.update(t, audio.playbackRate, inputBetween, (tg, heard) => highway.mark(tg.ev, heard));
      // The line-up goes round again for as long as it takes (by a whole number of beats).
      if (calib && calib.phase === 'align' && t >= SYNC.ALIGN_END - 1) { seek(audio.currentTime - 60, false); t = songTime(); }
    }
    input.taping = !!(scorer && !audio.paused);
    if (calib) {
      // The bar: at a side on every tick.
      const m = metronome(t), bar = $('metro-bar');
      bar.style.left = `calc((100% - 16px) * ${m.x.toFixed(4)})`;
      bar.classList.toggle('hit', m.since < 0.09);
      if (calib.phase === 'align') $('metro-val').textContent = fmtMs(prefs.avOffset);
      const cue = $('calib-cue'), c = syncCue(calib.phase, t, calib.meter, prefs.avOffset);
      cue.classList.toggle('hidden', audio.paused || calib.phase === 'align');
      if (cue.dataset.big !== c.big) { cue.dataset.big = c.big; cue.firstElementChild.textContent = c.big; }
      if (cue.lastElementChild.textContent !== c.small) cue.lastElementChild.textContent = c.small;
    }
    if (!$('settings').classList.contains('hidden')) {
      for (const [id, which] of [['song-meter', 'song'], ['bass-meter', 'bass']]) {
        const db = mixer.level(which);
        $(id).firstChild.style.width = `${Math.max(0, Math.min(100, (db + 48) * (100 / 48)))}%`;
        $(id).classList.toggle('hot', db > -1);
      }
    }
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
