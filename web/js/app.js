import { Highway } from './highway.js';
import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel } from './chart.js';
import { runBoot, mountTitle, bootReloadLine, injectTitleCSS } from './title.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT } from './help.js';

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

const prefs = Object.assign({ type: 'bass', sort: 'artist', showMissing: false, difficulty: 100, lookahead: 3, invert: false, volume: 100, startSpeed: 100 }, load(KEY_PREFS, {}));
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
      { act: 'new', label: 'Learn a song', key: 'N', meta: `${parts} ${prefs.type === 'all' ? '' : prefs.type + ' '}parts` },
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
      if (act === 'new') { leaveTitle(); showLibrary(); }
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
  return `<h3>Highway</h3>
${pick('lookahead', [[2, '2s'], [3, '3s'], [4, '4s'], [5, '5s']], prefs.lookahead)}
<p class='gk-note'>How far ahead the notes appear. Longer gives more warning; shorter spreads them out.</p>
<h3>Strings</h3>
${pick('invert', [['false', 'Low string at the bottom'], ['true', 'Low string on top']], prefs.invert)}
<h3>Song list</h3>
${pick('missing', [['false', 'Hide charts without audio'], ['true', 'Show them']], prefs.showMissing)}
<div class='gk-row'><button data-set='rescan'>Rescan</button></div>
<p class='gk-note'>${missing} ${missing === 1 ? 'chart has' : 'charts have'} no audio. Recordings go in <code>${esc(info.musicDir || 'music')}</code>, named like <code>Artist - Title.mp3</code>; then Rescan. Songs are read from <code>${esc(info.rocksmithDir || '')}</code>.</p>
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
      await fetch('/api/rescan');
      await loadLibrary();
      break;
    case 'forget':
      if (await sheet.confirm('Forget everything PumaBass has saved in this browser: every audio offset, your recent songs and where you left off, and your settings? This cannot be undone.', 'Forget everything')) forgetEverything();
      return;
    default: return;
  }
  savePrefs();
  syncPlayerPrefs();
  sheet.refresh();
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
  [songs, info] = await Promise.all([fetch('/api/songs').then(r => r.json()), fetch('/api/info').then(r => r.json())]);
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
  el.innerHTML = list.length ? '' : `<div class="empty">${q ? 'No songs match that search.' : 'No songs here.'}</div>`;
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
    await fetch('/api/rescan');
    await loadLibrary();
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

  chart = await (await fetch(`/api/chart/${encodeURIComponent(s.id)}`)).json();
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
  audio.currentTime = startAt;
  pausedAt = startAt > 0.5 ? startAt : null; // Resume game counts back in, too
  liveAt = null;
  setSpeed(prefs.startSpeed); // loading a new source resets the rate
  updatePlayButton();
  saveResume();
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
loadLibrary().then(() => {
  const playable = songs.filter(s => s.audio !== false);
  const bass = playable.filter(s => s.type === 'bass').length;
  const waiting = songs.filter(s => s.audio === false && s.type === 'bass').length;
  showTitle();
  return boot.finish([`${new Set(playable.map(s => s.songKey)).size} songs, ${bass} bass parts`,
    waiting ? `${waiting} bass charts waiting for a recording` : 'every bass chart has its audio']);
}).then(() => title && title.reveal());
