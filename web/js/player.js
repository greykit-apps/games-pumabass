// The player: a song on the highway, its controls, and
// the frame loop that drives them.

import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel, sectionName } from './chart.js';
import { alertSheet } from './title.js';
import { RECORDED_BASS } from './mixer.js';
import { Scorer } from './scoring.js';
import { api } from './api.js';
import { $, audio, mixer, highway, input, fmtMs, toast, screen, info, setScreen, setInfo } from './core.js';
import { endScreen, showEndScreen, closeEndScreen } from './end-screen.js';
import { setNotationSong, updateNotation } from './notation.js';
import { applyMix, setRecordedBass, ensureInput, showTuner, maybeAutoTune } from './instrument.js';
import { showLibrary, showSongInList } from './library-screen.js';
import { openHelp, openSettings } from './menu.js';
import { repeater, stopRepeater, toggleRepeater, repeaterPass } from './repeater.js';
import { KEY_OFFSETS, KEY_RECENT, KEY_RESUME, load, save, prefs, savePrefs, isFav, toggleFav, bumpStat } from './store.js';
import { calib, playAlongDone, endSync, syncFrame } from './sync-test.js';
import { clearTake, logTakeSync, logTakeVerdict, startTake } from './takes.js';

/* Each time a loop comes round. */
export function loopCameRound() {
  repeaterPass();
}


/* ---- the player ---- */
export let chart = null;
export let song = null;
export let loop = null; // { a, b }
export let offsetMs = 0;
export const clock = { raw: 0, stamp: 0, est: 0, at: 0 };
export let lastResumeSave = 0;
/* This sitting with the song, for the play counts: a play is counted the first
 * time it starts (a resumed song is the same play), and a finish when playback
 * reaches the last note having played at least half of what was ahead of it. */
export let session = null;
/* The run-up: play after a pause starts RUNUP seconds back and counts down to
 * the spot you stopped at ("live"), so you can find the groove again. pausedAt
 * is that spot; an explicit jump while paused (click, keys, wheel) clears it,
 * since then you chose where to start. */
export const RUNUP = 6;
export let pausedAt = null;   // where play will count back in to, or null
export let liveAt = null;     // the spot the countdown is counting to, while it runs
export let liveShownAt = 0;   // when LIVE went up, to take it down again

export async function openSong(s, startAt = 0, { resumed = false } = {}) {
  closeEndScreen();
  song = s;
  setScreen('player');
  stopRepeater();
  $('library').classList.add('hidden');
  $('player').classList.remove('hidden');
  showLoading(`Loading ${s.title}`);
  $('back').innerHTML = '<kbd>Esc</kbd>Songs';
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
  $('settings').classList.toggle('own-audio', s.audio === 'user'); // whole seconds only make sense for your own recordings
  loop = null;
  renderLoop();
  applyDifficulty();
  buildSectionBar();
  setNotationSong(chart, s.type);

  audio.src = `/api/audio/${encodeURIComponent(s.id)}`;
  audio.preservesPitch = true;
  // A song's first play decodes its audio on the server, which takes a few seconds; after that it's kept.
  const slow = setTimeout(() => { if (song === s) showLoading(`Loading ${s.title}`, 'Decoding its audio: the first play of a song takes a few seconds'); }, 1200);
  await new Promise(resolve => {
    const done = () => { audio.removeEventListener('canplay', done); audio.removeEventListener('error', done); resolve(); };
    audio.addEventListener('canplay', done); audio.addEventListener('error', done);
  });
  clearTimeout(slow);
  $('loading').classList.add('hidden');
  if (audio.error) {
    const why = await audioTrouble(s);
    chart = null; // nothing to resume
    closeSong();
    await alertSheet(why, "Can't play the song");
    return;
  }
  audio.currentTime = startAt;
  pausedAt = startAt > 0.5 ? startAt : null; // Resume game counts back in, too
  const last = highway.notes.slice(-40).reduce((m, n) => Math.max(m, n.t + (n.sus || 0)), 0);
  session = { id: s.id, start: startAt, counted: resumed, finished: false, heard: 0, lastT: null, end: last || audio.duration || chart.songLength };
  showFav();
  liveAt = null;
  setSpeed(prefs.startSpeed); // loading a new source resets the rate
  updatePlayButton();
  saveResume();
  await maybeAutoTune();
  // Scoring on and an input chosen before: open it now, quietly, so a song never goes unscored
  // just because nothing had opened the cable since PumaBass started.
  if (prefs.scoring && prefs.input && !input.open) await ensureInput({ ask: false });
  startScoring();
  // Straight into it: every song has ten seconds or so before its first note.
  // (Resume game counts back in, as a play after a pause does.)
  if (song === s && audio.paused) togglePlay();
  if (song === s) showCaption(s.title, s.artist, [arrangementLabel(s), s.album, s.year].filter(Boolean).join(' · '));
}

/* What's being loaded, and why it's taking a while when it is. */
function showLoading(what, more = '') {
  $('loading').innerHTML = `<b></b><span></span>`;
  $('loading').firstChild.textContent = what;
  $('loading').lastChild.textContent = more;
  $('loading').classList.remove('hidden');
}

/* The song's audio didn't play: ask the server why, and say what to do about it. */
async function audioTrouble(s) {
  setInfo(await api('/api/info').catch(() => info));
  if (info.vgmstream === false) return `Song audio needs vgmstream, which isn't installed yet. In the PumaBass folder run tools/get-vgmstream.sh (on Windows, see README.md), then open "${s.title}" again.`;
  const r = await fetch(`/api/audio/${encodeURIComponent(s.id)}`, { headers: { Range: 'bytes=0-0' } }).catch(() => null);
  if (!r) return `PumaBass's server isn't answering, so "${s.title}" couldn't load. Check that it's running, then open the song again.`;
  if (r.status === 404) return `The audio for "${s.title}" isn't where it was: its song file may have been moved or deleted. Rescan the song list (at its foot), then try again.`;
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    return `Decoding the audio for "${s.title}" failed${e.error ? ` (${e.error})` : ''}. Open it again; if it fails twice, its song file may be damaged.`;
  }
  return `The browser couldn't play the audio for "${s.title}". Open it again; if it fails twice, its file may be in a format this browser can't play.`;
}

/* N: the notation band goes standard notation, tab, both, off, and round again. */
const NOTATION_STEPS = [
  { name: 'staff', staff: true, tab: false, say: 'Standard notation' },
  { name: 'tab', staff: false, tab: true, say: 'Tab' },
  { name: 'both', staff: true, tab: true, say: 'Standard notation and tab' },
  { name: 'off', say: 'Notation off' },
];
function cycleNotation() {
  const now = !prefs.notation || (!prefs.notationStaff && !prefs.notationTab) ? 'off'
    : prefs.notationStaff && prefs.notationTab ? 'both' : prefs.notationStaff ? 'staff' : 'tab';
  const next = NOTATION_STEPS[(NOTATION_STEPS.findIndex(s => s.name === now) + 1) % NOTATION_STEPS.length];
  prefs.notation = next.name !== 'off';
  if (prefs.notation) { prefs.notationStaff = next.staff; prefs.notationTab = next.tab; }
  savePrefs();
  toast(next.say);
}

/* The song's name, as a music video credits it: lower left, just over the board,
 * fading in as the song starts and out again (style.css). */
function showCaption(title, by, more) {
  const el = $('caption');
  $('cap-title').textContent = title;
  $('cap-by').textContent = by;
  $('cap-more').textContent = more;
  el.classList.remove('hidden', 'run');
  void el.offsetWidth; // restart the fade
  el.classList.add('run');
}

/* The sync test's song (web/js/sync-test.js): its own chart and audio, not the server's. */
export async function openTestSong(test, sub) {
  closeEndScreen();
  song = { id: test.chart.id, title: 'Sync', artist: 'PumaBass', type: 'bass', calib: true };
  chart = test.chart;
  setScreen('player');
  stopRepeater();
  $('library').classList.add('hidden');
  $('player').classList.remove('hidden');
  showLoading('Loading the sync test');
  $('back').innerHTML = '<kbd>Esc</kbd>Back';
  $('p-tuning').textContent = 'Open E string';
  $('player').classList.add('syncing'); // the test has no loops, speeds or mix (style.css)
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
  showCaption('Sync', sub, '');
}

export function saveResume() {
  if (song && chart && !song.calib) save(KEY_RESUME, { id: song.id, t: Math.round(audio.currentTime * 10) / 10 });
}

/* Stop the song and put the player away. */
export function leaveSong() {
  scorer = null;
  stopRepeater();
  clearTake();
  $('calib-cue').classList.add('hidden');
  $('metro').classList.add('hidden');
  $('caption').classList.add('hidden');
  $('caption').classList.remove('run');
  $('player').classList.remove('syncing');
  updateHud();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  chart = null;
  session = null;
  closeEndScreen();
  $('settings').classList.add('hidden');
}

export function closeSong() {
  if (calib) { endSync(); return; }
  saveResume();
  leaveSong();
  showSongInList(song.id);
}

/* From the end screen: the song again from one section, looped, with the riff
 * repeater on, so it starts slower and comes up to speed. */
export async function practiseSection(s, sec) {
  await openSong(s, sec.t);
  if (song !== s || !chart) return;
  loop = { a: sec.t, b: sec.end };
  if (!repeater) toggleRepeater(); else renderLoop();
}

export function applyDifficulty() {
  if (!chart) return;
  highway.setChart(chart, buildPlayable(chart, prefs.difficulty));
  if (scorer) startScoring(); // new notes: score afresh
}

/* ---- scoring ---- */
export let scorer = null;
export let sync = null; // this frame's song time against the audio clock, to find the input for a note

export const sectionIndex = t => chart.sections.findIndex(x => x.t <= t && t < x.end);

/* Score while it is on and an input is open; otherwise, not at all. */
export function startScoring() {
  scorer = prefs.scoring && input.open && chart && !calib ? new Scorer(chart, highway.notes, sectionIndex) : null;
  if (scorer) scorer.seek(songTime());
  startTake();
  updateHud();
}


/* The input for song time t0..t1: the audio clock at song time T is this
 * frame's clock, less how far back T is (in real time), plus the input's own
 * delay. Returned in real time, with the song time of its first sample. */
export function inputBetween(t0, t1) {
  if (!sync) return null;
  const lat = input.latency + prefs.inputOffset / 1000;
  const ctxOf = T => sync.ctx - (sync.song - T) / sync.rate + lat;
  const seg = input.segment(ctxOf(t0), ctxOf(t1));
  if (!seg || seg === 'later') return seg;
  return { x: seg.x, sr: input.sampleRate, t0: sync.song - (sync.ctx - (seg.c0 - lat)) * sync.rate };
}

export function updateHud() {
  // Scoring wanted but no input open: say so where the score would be, and offer the input.
  const off = !scorer && prefs.scoring && !!chart && !(song && song.calib) && !input.open;
  $('no-score').classList.toggle('hidden', !off);
  const el = $('score-hud');
  el.classList.toggle('hidden', !scorer);
  if (!scorer) return;
  const acc = scorer.accuracy;
  const text = acc === null ? 'Scoring' : `${Math.round(acc * 100)}% \u00b7 streak ${scorer.streak}`;
  if (el.textContent !== text) el.textContent = text;
}

/* The song's time, as everything is drawn and judged by. The audio element reports
 * its position in uneven steps (every 14 to 21 ms), and snapping to each report made
 * the highway twitch, a little jump about once a second as the steps drifted against
 * the frames. So the clock runs on steadily at the playback rate and is eased toward
 * the reports (a tenth of the gap a call); a real jump (a seek, a stall) snaps. */
export function songTime() {
  const t = audio.currentTime;
  const now = performance.now();
  if (audio.paused) {
    clock.raw = t; clock.stamp = now; clock.est = t; clock.at = now;
  } else {
    const rate = audio.playbackRate;
    if (t !== clock.raw) { clock.raw = t; clock.stamp = now; }
    const reported = clock.raw + Math.min(0.25, ((now - clock.stamp) / 1000) * rate);
    const steady = clock.est + ((now - clock.at) / 1000) * rate;
    clock.est = Math.abs(reported - steady) > 0.05 ? reported : steady + (reported - steady) * 0.1;
    clock.at = now;
  }
  return clock.est - (offsetMs + prefs.avOffset) / 1000;
}

export function seek(t, chosen = true) {
  if (chosen) { pausedAt = null; liveAt = null; }
  audio.currentTime = Math.max(0, Math.min(t, (audio.duration || chart.songLength) - 0.05));
  clock.raw = clock.est = audio.currentTime; clock.stamp = clock.at = performance.now();
  if (scorer) scorer.seek(songTime()); // carry on judging from here
  if (calib) calib.meter.seek(songTime());
}

export function togglePlay() {
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

/* While paused, the keys worth knowing, so none has to be remembered. */
const PAUSED_KEYS = `<span class="ov-keys">${[['L', 'loop section'], ['R', 'riff repeater'], ['\u2191 \u2193', 'speed'], ['N', 'notation'], [',', 'mix'], ['?', 'all keys']]
  .map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}</span>`;

/* PAUSED while paused; while counting back in, the seconds to go, then LIVE. */
export function renderOverlay() {
  const el = $('overlay');
  let big = '', small = '', mode = '';
  if (!$('loading').classList.contains('hidden') || endScreen) { /* nothing over the loading message or the end screen */ }
  else if (audio.paused) {
    mode = 'paused';
    liveShownAt = 0;
    big = 'PAUSED';
    small = pausedAt !== null ? `Press <kbd>Space</kbd> to play · back in at ${formatTime(pausedAt)}` : 'Press <kbd>Space</kbd> to play';
    small += PAUSED_KEYS;
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

export function updatePlayButton() { $('play-label').textContent = audio.paused ? 'Play' : 'Pause'; }
audio.addEventListener('play', () => {
  updatePlayButton();
  if (session && !session.counted) { session.counted = true; bumpStat(session.id, 'plays'); }
});

export function checkFinished(t) {
  if (!session || session.finished || t < session.end) return;
  if (session.heard < 0.5 * Math.max(1, session.end - session.start)) return;
  session.finished = true;
  bumpStat(session.id, 'finished');
  toast('Finished \u2713');
}

export function showFav() {
  $('fav-btn').classList.toggle('hidden', !!(song && song.calib));
  const on = !!song && isFav(song.id);
  $('fav-btn').setAttribute('aria-pressed', String(on));
  $('fav-btn').setAttribute('aria-label', song ? `Favorite: ${song.title}` : 'Favorite');
  $('fav-btn').textContent = on ? '\u2665' : '\u2661';
}
$('fav-btn').addEventListener('click', () => { if (song && !song.calib) { toggleFav(song.id); showFav(); } });
audio.addEventListener('pause', () => { updatePlayButton(); saveResume(); });
audio.addEventListener('ended', () => {
  if (calib) { updatePlayButton(); playAlongDone(); return; }
  checkFinished(Infinity);
  updatePlayButton();
  pausedAt = null;
  liveAt = null;
  save(KEY_RESUME, null); // a song played to the end leaves nothing to resume
  showEndScreen();
});


export function currentSection(t) {
  let cur = null;
  for (const s of chart.sections) if (s.t <= t + 0.01) cur = s;
  return cur;
}

/* The bar along the bottom: a block per section, coloured by its kind (every verse
 * the same colour), with no names. Neighbouring kinds differ in hue and lightness. */
const SECTION_KINDS = [
  [/^(intro|outro|fade|silence|ambient|noguitar)/, '#3b4a66'], // slate: the ends, and gaps
  [/^(pre|build)/, '#1f8790'],                                 // teal: the run into a chorus
  [/chorus/, '#b4426b'],                                       // rose
  [/verse|postvs/, '#2f63b3'],                                 // blue
  [/bridge|brdg|transition|variation/, '#7a54c2'],             // violet
  [/solo|tapping/, '#c07a1f'],                                 // amber
  [/hook|melody/, '#36955a'],                                  // green
  [/riff|vamp|head/, '#a39a2c'],                               // mustard
  [/break|interlude/, '#9c5a3c'],                              // brown
];
const sectionColor = name => (SECTION_KINDS.find(([re]) => re.test(String(name).toLowerCase())) || [, '#5c6884'])[1];

export function buildSectionBar() {
  const el = $('sections');
  el.innerHTML = '';
  const len = chart.songLength;
  for (const s of chart.sections) {
    const d = document.createElement('div');
    d.style.left = `${(s.t / len) * 100}%`;
    d.style.width = `${((s.end - s.t) / len) * 100}%`;
    d.style.background = sectionColor(s.name);
    d.title = `${sectionName(s.name)} (${formatTime(s.t)})`;
    d.setAttribute('aria-label', d.title);
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

export function toggleSectionLoop() {
  if (loop) { loop = null; stopRepeater(); }
  else {
    const t = songTime();
    const sec = currentSection(t) || { t: 0, end: chart.songLength };
    loop = { a: sec.t, b: sec.end };
    if (t < loop.a || t > loop.b) seek(loop.a);
  }
  renderLoop();
}

export function setLoopPoint(t, which) {
  if (!loop) loop = { a: t, b: chart.songLength };
  if (which === 'a' || (!which && Math.abs(t - loop.a) < Math.abs(t - loop.b))) loop.a = t; else loop.b = t;
  if (loop.b < loop.a) [loop.a, loop.b] = [loop.b, loop.a];
  renderLoop();
}

/* Where a loop goes back to: a second's run-up before its start. */
export const loopFrom = () => Math.max(0, loop.a - 1.0);

export function renderLoop() {
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
$('no-score').addEventListener('click', async () => { if (await ensureInput()) startScoring(); });
$('tuner-btn').addEventListener('click', showTuner);
$('play').addEventListener('click', togglePlay);
$('loop').addEventListener('click', toggleSectionLoop);
$('repeat').addEventListener('click', toggleRepeater);

export function setSpeed(v) {
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

export const toggleSettingsPanel = () => $('settings').classList.toggle('hidden');
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
$('score-toggle').addEventListener('change', () => { prefs.scoring = $('score-toggle').checked; savePrefs(); if (screen === 'player') startScoring(); });
$('recorded-bass').addEventListener('click', e => { const b = e.target.closest('[data-rb]'); if (b) setRecordedBass(b.dataset.rb); });

/* The player's controls follow the saved preferences, wherever they were changed. */
export function syncPlayerPrefs() {
  highway.lookahead = prefs.lookahead;
  highway.invert = prefs.invert;
  highway.labels = prefs.noteLabels;
  audio.volume = 1; // the song's volume is the mixer's
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

export function showOffset() {
  $('offset-val').textContent = `${offsetMs ? fmtMs(offsetMs) : 'none'}${offsetMs > 0 ? ', notes later' : offsetMs < 0 ? ', notes sooner' : ''}`
    + (prefs.avOffset ? ` (on top of ${fmtMs(prefs.avOffset)} for every song)` : '');
}
export function setOffset(ms) {
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

export function playerKey(e) {
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
  else if (k === 'n' || k === 'N') cycleNotation();
  else if (k === 'f' || k === 'F') { toggleFav(song.id); showFav(); toast(isFav(song.id) ? '\u2665 Favorite' : 'Not a favorite'); }
  else if (k === 'b' || k === 'B') {
    const modes = Object.keys(RECORDED_BASS);
    setRecordedBass(modes[(modes.indexOf(prefs.recordedBass) + 1) % modes.length]);
    toast(`Recorded bass: ${RECORDED_BASS[prefs.recordedBass].label}`);
  }
  else if (k === '?' || k === 'h') openHelp();
  else if (k === 's' || k === 'S') { if (!audio.paused) togglePlay(); openSettings(); }
  else if (k === 'Escape') {
    if (!$('settings').classList.contains('hidden')) $('settings').classList.add('hidden');
    else closeSong();
  }
}


$('highway').addEventListener('wheel', e => {
  if (!chart || !audio.paused) return;
  e.preventDefault();
  seek(audio.currentTime + e.deltaY * 0.004);
}, { passive: false });

/* ---- frame loop ---- */
export function frame() {
  if (chart && screen === 'player') {
    let t = songTime();
    if (loop && !audio.paused && t >= loop.b) {
      // Restart the loop with a short lead-in so you can get ready.
      // Carry on from just as far past the run-up as play went past the end, so the highway runs on unbroken.
      seek(loopFrom() + Math.min(0.1, t - loop.b), false);
      t = songTime();
      loopCameRound();
    }
    updateNotation(t, !calib);
    highway.draw(t);
    const len = chart.songLength;
    $('playhead').style.left = `${(Math.max(0, t) / len) * 100}%`;
    $('time').textContent = `${formatTime(t)} / ${formatTime(len)}`;
    const sec = currentSection(t), secName = sec ? sectionName(sec.name) : '';
    if ($('section-name').textContent !== secName) $('section-name').textContent = secName;
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
        logTakeSync(t, sync);
        scorer.update(t, audio.playbackRate, inputBetween, (ev, r) => {
          highway.mark(ev, r.hit);
          logTakeVerdict(ev, r);
        });
        updateHud();
      }
    }
    input.taping = !!(scorer && !audio.paused);
    if (calib) syncFrame(t);
    if (!$('settings').classList.contains('hidden')) {
      for (const [id, which] of [['song-meter', 'song'], ['bass-meter', 'bass']]) {
        const db = mixer.level(which);
        $(id).firstChild.style.width = `${Math.max(0, Math.min(100, (db + 48) * (100 / 48)))}%`;
        $(id).classList.toggle('hot', db > -1);
      }
    }
    if (!$('caption').classList.contains('hidden')) $('caption').style.bottom = `${highway.H - highway.boardTop + 12}px`;
    if (!audio.paused && performance.now() - lastResumeSave > 3000) { lastResumeSave = performance.now(); saveResume(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
