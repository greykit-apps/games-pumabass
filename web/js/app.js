import { Highway } from './highway.js';
import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel } from './chart.js';

const $ = id => document.getElementById(id);
const audio = $('audio');
const highway = new Highway($('highway'));

// ---------- persistent settings ----------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(`pb:${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`pb:${key}`, JSON.stringify(value)); } catch {} },
};

// ---------- library ----------
let songs = [];
let typeFilter = store.get('type', 'bass');

async function loadLibrary() {
  songs = await (await fetch('/api/songs')).json();
  renderLibrary();
}

function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const sort = $('sort').value;
  const recent = store.get('recent', {});
  const showMissing = $('show-missing').checked;
  let list = songs.filter(s => (typeFilter === 'all' || s.type === typeFilter) && (showMissing || s.audio !== false));
  if (q) list = list.filter(s => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  const strings = s => (s.type === 'bass' ? 4 : 6);
  const cmp = {
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
    tuning: (a, b) => tuningName(a.tuning, strings(a)).localeCompare(tuningName(b.tuning, strings(b))) || a.artist.localeCompare(b.artist),
    recent: (a, b) => (recent[b.id] || 0) - (recent[a.id] || 0) || a.artist.localeCompare(b.artist),
  }[sort];
  list.sort((a, b) => cmp(a, b) || arrangementLabel(a).localeCompare(arrangementLabel(b)));

  const el = $('song-list');
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'song' + (s.audio === false ? ' noaudio' : '');
    row.tabIndex = 0;
    row.setAttribute('role', 'listitem');
    const tn = tuningName(s.tuning, strings(s));
    row.innerHTML = `
      <div><div class="t"></div><div class="a"></div></div>
      <div class="arr"></div>
      <div class="tun ${tn === 'E Standard' ? 'std' : ''}"></div>
      <div class="len">${formatTime(s.length)}</div>`;
    row.querySelector('.t').textContent = s.title;
    row.querySelector('.a').textContent = `${s.artist}${s.album ? ' — ' + s.album : ''}${s.year ? ' (' + s.year + ')' : ''}`;
    row.querySelector('.arr').textContent = s.audio === false ? 'No audio' : arrangementLabel(s) + (s.audio === 'user' ? ' · your recording' : '');
    row.querySelector('.tun').textContent = tn + (s.centOffset ? ` (${s.centOffset > 0 ? '+' : ''}${Math.round(s.centOffset)}¢)` : '');
    if (s.audio !== false) {
      row.addEventListener('click', () => openSong(s));
      row.addEventListener('keydown', e => { if (e.key === 'Enter') openSong(s); });
    } else {
      row.title = 'No audio for this song. Put a recording named like "Artist - Title.mp3" in the PumaBass music folder, then click Rescan.';
    }
    frag.appendChild(row);
  }
  el.appendChild(frag);
  const missing = songs.filter(s => (typeFilter === 'all' || s.type === typeFilter) && s.audio === false).length;
  $('count').textContent = `${list.length} ${list.length === 1 ? 'arrangement' : 'arrangements'}`
    + (missing && !showMissing ? ` · ${missing} more without audio hidden` : '');
}

$('search').addEventListener('input', renderLibrary);
$('show-missing').checked = store.get('showMissing', false);
$('show-missing').addEventListener('change', () => { store.set('showMissing', $('show-missing').checked); renderLibrary(); });
$('rescan').addEventListener('click', async () => {
  $('rescan').textContent = 'Scanning…';
  await fetch('/api/rescan');
  await loadLibrary();
  $('rescan').textContent = 'Rescan';
});
$('sort').value = store.get('sort', 'artist');
$('sort').addEventListener('change', () => { store.set('sort', $('sort').value); renderLibrary(); });
for (const b of document.querySelectorAll('#type-filter button')) {
  b.classList.toggle('on', b.dataset.type === typeFilter);
  b.addEventListener('click', () => {
    typeFilter = b.dataset.type;
    store.set('type', typeFilter);
    document.querySelectorAll('#type-filter button').forEach(x => x.classList.toggle('on', x === b));
    renderLibrary();
  });
}

// ---------- player ----------
let chart = null;
let song = null;
let loop = null; // { a, b }
let offsetMs = 0;
let difficulty = store.get('difficulty', 100);
const clock = { raw: 0, stamp: 0 };

async function openSong(s) {
  song = s;
  $('library').classList.add('hidden');
  $('player').classList.remove('hidden');
  $('loading').classList.remove('hidden');
  $('p-title').textContent = s.title;
  $('p-sub').textContent = `${s.artist} · ${arrangementLabel(s)}`;
  const recent = store.get('recent', {}); recent[s.id] = Date.now(); store.set('recent', recent);

  chart = await (await fetch(`/api/chart/${encodeURIComponent(s.id)}`)).json();
  const tn = tuningName(chart.tuning, chart.strings);
  const notes = tuningNotes(chart.tuning, chart.strings).join(' ');
  $('p-tuning').textContent = (tn.includes(' ') && !tn.startsWith('Drop') && !tn.endsWith('Standard') ? tn : `${tn} · ${notes}`)
    + (chart.centOffset ? ` · ${chart.centOffset > 0 ? '+' : ''}${Math.round(chart.centOffset)} cents` : '')
    + (chart.capo ? ` · Capo ${chart.capo}` : '');
  offsetMs = store.get(`offset:${s.id}`, 0);
  // Your own recordings can be off by whole seconds (different intro, edit, etc.), so allow a wider range.
  const range = s.audio === 'user' ? 15000 : 500;
  $('offset').min = -range; $('offset').max = range; $('offset').step = s.audio === 'user' ? 10 : 5;
  $('offset').value = offsetMs; showOffset();
  loop = null;
  renderLoop();
  setSpeed(100);
  applyDifficulty();
  buildSectionBar();

  audio.src = `/api/audio/${encodeURIComponent(s.id)}`;
  audio.preservesPitch = true;
  await new Promise(resolve => {
    const done = () => { audio.removeEventListener('canplay', done); audio.removeEventListener('error', done); resolve(); };
    audio.addEventListener('canplay', done); audio.addEventListener('error', done);
  });
  $('loading').classList.add('hidden');
  audio.currentTime = 0;
  audio.playbackRate = Number($('speed').value) / 100; // loading a new source resets the rate
  updatePlayButton();
}

function closeSong() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  chart = null;
  $('player').classList.add('hidden');
  $('settings').classList.add('hidden');
  $('library').classList.remove('hidden');
  if (store.get('sort', 'artist') === 'recent') renderLibrary();
}

function applyDifficulty() {
  if (!chart) return;
  highway.setChart(chart, buildPlayable(chart, difficulty));
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

function seek(t) {
  audio.currentTime = Math.max(0, Math.min(t, (audio.duration || chart.songLength) - 0.05));
  clock.raw = audio.currentTime; clock.stamp = performance.now();
}

function togglePlay() {
  if (!chart) return;
  if (audio.paused) audio.play(); else audio.pause();
}

function updatePlayButton() { $('play').textContent = audio.paused ? '▶' : '❚❚'; }
audio.addEventListener('play', updatePlayButton);
audio.addEventListener('pause', updatePlayButton);
audio.addEventListener('ended', updatePlayButton);

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
  $('loop').classList.toggle('on', !!loop);
  const el = $('loop-region');
  el.classList.toggle('hidden', !loop);
  if (loop) {
    el.style.left = `${(loop.a / chart.songLength) * 100}%`;
    el.style.width = `${((loop.b - loop.a) / chart.songLength) * 100}%`;
  }
}

// ---------- controls ----------
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

$('difficulty').value = difficulty;
$('diff-val').textContent = `${difficulty}%`;
$('difficulty').addEventListener('input', () => {
  difficulty = Number($('difficulty').value);
  $('diff-val').textContent = `${difficulty}%`;
  store.set('difficulty', difficulty);
  applyDifficulty();
});

$('settings-btn').addEventListener('click', () => $('settings').classList.toggle('hidden'));
$('settings-close').addEventListener('click', () => $('settings').classList.add('hidden'));

$('volume').value = store.get('volume', 100);
audio.volume = $('volume').value / 100;
$('volume').addEventListener('input', () => { audio.volume = $('volume').value / 100; store.set('volume', Number($('volume').value)); });

highway.lookahead = store.get('lookahead', 3);
$('lookahead').value = highway.lookahead;
const showLookahead = () => ($('lookahead-val').textContent = `${highway.lookahead}s`);
showLookahead();
$('lookahead').addEventListener('input', () => { highway.lookahead = Number($('lookahead').value); store.set('lookahead', highway.lookahead); showLookahead(); });

function showOffset() {
  $('offset-val').textContent = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms (positive = notes arrive later)`;
}
function nudgeOffset(ms) {
  offsetMs = Math.max(Number($('offset').min), Math.min(Number($('offset').max), offsetMs + ms));
  $('offset').value = offsetMs;
  store.set(`offset:${song.id}`, offsetMs);
  showOffset();
}
for (const b of document.querySelectorAll('[data-nudge]')) b.addEventListener('click', () => nudgeOffset(Number(b.dataset.nudge)));
$('offset').addEventListener('input', () => {
  offsetMs = Number($('offset').value);
  store.set(`offset:${song.id}`, offsetMs);
  showOffset();
});

highway.invert = store.get('invert', false);
$('invert').checked = highway.invert;
$('invert').addEventListener('change', () => { highway.invert = $('invert').checked; store.set('invert', highway.invert); });

document.addEventListener('keydown', e => {
  if (!chart || e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
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
  else if (k === 'Escape') closeSong();
});

$('highway').addEventListener('wheel', e => {
  if (!chart || !audio.paused) return;
  e.preventDefault();
  seek(audio.currentTime + e.deltaY * 0.004);
}, { passive: false });

// ---------- frame loop ----------
function frame() {
  if (chart) {
    let t = songTime();
    if (loop && !audio.paused && t >= loop.b) {
      // Restart the loop with a short lead-in so you can get ready.
      seek(Math.max(0, loop.a - 1.0));
      t = songTime();
    }
    highway.draw(t);
    const len = chart.songLength;
    $('playhead').style.left = `${(Math.max(0, t) / len) * 100}%`;
    $('time').textContent = `${formatTime(t)} / ${formatTime(len)}`;
    const sec = currentSection(t);
    $('section-name').textContent = sec && sec.name !== 'noguitar' ? sec.name : '';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadLibrary();
