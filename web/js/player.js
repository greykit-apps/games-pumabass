// The player: a song on the highway, its controls, and
// the frame loop that drives them.

import { buildPlayable, tuningName, tuningNotes, formatTime, arrangementLabel, sectionName } from './chart.js';
import { alertSheet } from './title.js';
import { RECORDED_BASS } from './mixer.js';
import { Scorer } from './scoring.js';
import { api, WEB } from './api.js';
import { $, audio, mixer, highway, input, fmtMs, toast, screen, info, setScreen, setInfo } from './core.js';
import { endScreen, showEndScreen, closeEndScreen } from './end-screen.js';
import { setNotationSong, updateNotation, tabView } from './notation.js';
import { applyMix, setRecordedBass, ensureInput, showTuner, maybeAutoTune } from './instrument.js';
import { showLibrary, showSongInList } from './library-screen.js';
import { openHelp, openSettings } from './menu.js';
import { repeater, stopRepeater, toggleRepeater, repeaterPass } from './repeater.js';
import { KEY_OFFSETS, KEY_RECENT, KEY_RESUME, load, save, prefs, savePrefs, isFav, toggleFav, bumpStat } from './store.js';
import { calib, playAlongDone, endSync, syncFrame } from './sync-test.js';
import { clearTake, logTakeSync, logTakeVerdict, startTake } from './takes.js';
import { demoChart, demoTrack } from './demo.js';

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
  $('back').title = 'Back to the song list (Esc)'; $('back').ariaLabel = 'Songs';
  const recent = load(KEY_RECENT, {}); recent[s.id] = Date.now(); save(KEY_RECENT, recent);

  try {
    chart = s.demo ? demoChart() : await api(`/api/chart/${encodeURIComponent(s.id)}`);
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

  if (s.demo) await new Promise(r => setTimeout(r, 50)); // Loading shows while its audio is made, the first time
  audio.src = s.demo ? demoTrack() : `/api/audio/${encodeURIComponent(s.id)}`; // the demo's is made here (demo.js)
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
  liveAt = null;
  setSpeed(prefs.startSpeed); // loading a new source resets the rate
  updatePlayButton();
  saveResume();
  await maybeAutoTune();
  // Open the input now, quietly: the one chosen before, or the Real Tone Cable if it's
  // plugged in. Scoring needs it; playing along, it's heard (unless the Mix says not), so
  // you hear yourself with the song from the first note.
  // (On the web demo, only once you've chosen one: looking for the cable asks to use the microphone.)
  if (!input.open && (scoreMode || prefs.hear) && (!WEB || prefs.input)) await ensureInput({ ask: false });
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

/* N: the notation band goes standard notation, tab, both, off, and round again. It's
 * the highway view's: the tab view is the tab itself. */
const NOTATION_STEPS = [
  { name: 'staff', staff: true, tab: false, say: 'Standard notation' },
  { name: 'tab', staff: false, tab: true, say: 'Tab' },
  { name: 'both', staff: true, tab: true, say: 'Standard notation and tab' },
  { name: 'off', say: 'Notation off' },
];
function cycleNotation() {
  if (tabView()) { toast('Notation is over the highway: V to switch'); return; }
  const now = !prefs.notation || (!prefs.notationStaff && !prefs.notationTab) ? 'off'
    : prefs.notationStaff && prefs.notationTab ? 'both' : prefs.notationStaff ? 'staff' : 'tab';
  const next = NOTATION_STEPS[(NOTATION_STEPS.findIndex(s => s.name === now) + 1) % NOTATION_STEPS.length];
  prefs.notation = next.name !== 'off';
  if (prefs.notation) { prefs.notationStaff = next.staff; prefs.notationTab = next.tab; }
  savePrefs();
  toast(next.say);
}

/* V: the highway, or the tab view in its place. */
function cycleView() {
  prefs.view = tabView() ? 'highway' : 'tab';
  savePrefs();
  toast(tabView() ? 'Tab view' : 'Highway view');
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
export async function openTestSong(test) {
  closeEndScreen();
  song = { id: test.chart.id, title: 'Sync', artist: 'PumaBass', type: 'bass', calib: true };
  chart = test.chart;
  setScreen('player');
  stopRepeater();
  $('library').classList.add('hidden');
  $('player').classList.remove('hidden');
  showLoading('Loading the sync test');
  $('back').title = 'Back (Esc)'; $('back').ariaLabel = 'Back';
  $('p-tuning').textContent = 'Open E string';
  $('player').classList.add('syncing'); // the test has no loops, speeds or mix (style.css)
  $('caption').classList.add('hidden'); // a song's, if it came from one: the test has none
  $('caption').classList.remove('run');
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
  setSpeed(100);
  startScoring(); // no title caption: its step and its count of plucks say what's on
}

export function saveResume() {
  if (song && chart && !song.calib) save(KEY_RESUME, { id: song.id, t: Math.round(audio.currentTime * 10) / 10, scored: scoreMode });
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
// Scoring is a mode of its own, in beta: "Score a song" on the menu. "Learn a song" is
// play-along: nothing is judged, and the Real Tone Cable, when it's there, is heard.
export let scoreMode = false;
export function setScoreMode(on) {
  scoreMode = !!on;
  $('settings').classList.toggle('scoring', scoreMode);
}
export let scorer = null;
export let sync = null; // this frame's song time against the audio clock, to find the input for a note

export const sectionIndex = t => chart.sections.findIndex(x => x.t <= t && t < x.end);

/* Score in score mode while an input is open; otherwise, not at all. */
export function startScoring() {
  // Sync's soundcheck, when it was taken with this input: the cable's noise floor.
  const sc = prefs.soundcheck, noise = sc && (!sc.device || sc.device === input.deviceId) ? sc : null;
  scorer = scoreMode && input.open && chart && !calib ? new Scorer(chart, highway.notes, sectionIndex, noise) : null;
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
  const off = !scorer && scoreMode && !!chart && !(song && song.calib) && !input.open;
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
  highway.forget(songTime()); // notes from here on land unjudged again
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
const PAUSED_KEYS = `<span class="ov-keys">${[['L', 'loop section'], ['R', 'riff repeater'], ['N', 'notation'], ['V', 'view'], ['T', 'tuner'], ['M', 'mix'], ['?', 'help'], ['Esc', 'song list']]
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
  el.setAttribute('aria-live', mode === 'count' ? 'off' : 'polite');
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
  toast('Finished');
}

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
  const el = $('loop-region');
  el.classList.toggle('hidden', !loop);
  if (loop) {
    el.style.left = `${(loop.a / chart.songLength) * 100}%`;
    el.style.width = `${((loop.b - loop.a) / chart.songLength) * 100}%`;
  }
}

$('back').addEventListener('click', closeSong);
$('no-score').addEventListener('click', async () => { if (await ensureInput()) startScoring(); });
$('play').addEventListener('click', togglePlay);

/* Speed sticks at 100%: three slider positions (100, 105, 110) all mean full
 * speed, so a drag or a nudge holds there a moment before it crosses. The
 * slider keeps the position; currentSpeed() is what it means. */
const HOLD = 10; // the slider travel past 100 that still reads 100%
const posToSpeed = p => (p <= 100 ? p : Math.max(100, p - HOLD));
const speedToPos = v => (v < 100 ? v : v === 100 ? 100 + HOLD / 2 : v + HOLD); // full speed rests mid-hold
export const currentSpeed = () => posToSpeed(Number($('speed').value));
function showSpeed() {
  const v = currentSpeed();
  $('speed-val').textContent = `${v}%`;
  audio.playbackRate = v / 100;
}
export function setSpeed(v) {
  $('speed').value = speedToPos(Math.max(25, Math.min(120, v)));
  showSpeed();
}
/* Up / Down: one slider position, so the keys feel the hold too. */
function nudgeSpeed(dir) {
  $('speed').value = Number($('speed').value) + dir * 5; // the range keeps it in bounds
  showSpeed();
}
$('speed').addEventListener('input', showSpeed);

$('difficulty').addEventListener('input', () => {
  prefs.difficulty = Number($('difficulty').value);
  $('diff-val').textContent = `${prefs.difficulty}%`;
  savePrefs();
  applyDifficulty();
});

/* The Mix: opening it puts the keys in it (the Song level first; Left/Right set a level,
 * Tab moves on and stays inside), and closing it gives them back to where they were. */
let mixBack = null;
export function toggleSettingsPanel() {
  const el = $('settings');
  if (el.classList.contains('hidden')) {
    mixBack = document.activeElement;
    el.classList.remove('hidden');
    $('volume').focus({ preventScroll: true });
  } else closeMix();
}
export function closeMix() {
  $('settings').classList.add('hidden');
  if (mixBack && mixBack.isConnected && mixBack !== document.body) mixBack.focus({ preventScroll: true });
  else document.activeElement.blur();
  mixBack = null;
}
$('settings-close').addEventListener('click', closeMix);
$('settings').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const items = [...$('settings').querySelectorAll('input, button, summary')].filter(x => !x.disabled && x.offsetParent);
  const i = items.indexOf(document.activeElement);
  const to = e.shiftKey ? (i <= 0 ? items[items.length - 1] : null) : (i === items.length - 1 ? items[0] : null);
  if (to) { e.preventDefault(); to.focus(); }
});

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
$('recorded-bass').addEventListener('click', e => { const b = e.target.closest('[data-rb]'); if (b) setRecordedBass(b.dataset.rb); });

/* The player's controls follow the saved preferences, wherever they were changed. */
export function syncPlayerPrefs() {
  highway.lookahead = prefs.lookahead;
  highway.invert = prefs.invert;
  highway.lefty = prefs.lefty;
  highway.labels = prefs.noteLabels;
  audio.volume = 1; // the song's volume is the mixer's
  $('volume').value = prefs.volume;
  $('hear').checked = prefs.hear;
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
  else if (k === 'ArrowUp') { e.preventDefault(); nudgeSpeed(1); }
  else if (k === 'ArrowDown') { e.preventDefault(); nudgeSpeed(-1); }
  else if (k === 'l' || k === 'L') toggleSectionLoop();
  else if (k === 'r' || k === 'R') toggleRepeater();
  else if (k === '[') setLoopPoint(songTime(), 'a');
  else if (k === ']') setLoopPoint(songTime(), 'b');
  else if (k === 'Home') seek(loop ? loop.a : 0);
  else if (k === 'm' || k === 'M') toggleSettingsPanel();
  else if (k === 't' || k === 'T') showTuner();
  else if (k === 'n' || k === 'N') cycleNotation();
  else if (k === 'v' || k === 'V') cycleView();
  else if (k === 'f' || k === 'F') { toggleFav(song.id); toast(isFav(song.id) ? 'Favorite' : 'Not a favorite'); }
  else if (k === 'b' || k === 'B') {
    const modes = Object.keys(RECORDED_BASS);
    setRecordedBass(modes[(modes.indexOf(prefs.recordedBass) + 1) % modes.length]);
    toast(`Recorded bass: ${RECORDED_BASS[prefs.recordedBass].label}`);
  }
  else if (k === '?' || k === 'h') openHelp();
  else if (k === 's' || k === 'S') { if (!audio.paused) togglePlay(); openSettings(); }
  else if (k === 'Escape') {
    const c = document.activeElement;
    if (!$('settings').classList.contains('hidden')) closeMix();
    // On one of the player's controls, Esc lets go of it: the arrows seek and change speed again.
    else if (c && c.closest && c.closest('.p-top, .p-bottom')) c.blur();
    else if (!audio.paused || liveAt !== null) togglePlay(); // a stray Esc only pauses: the paused screen says Esc again leaves
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
    // The tab view stands in for the highway (never in the sync test, which is all highway).
    const tabs = !calib && tabView();
    $('player').classList.toggle('tabview', tabs);
    // with a verdict coming (a scored song; the sync test judges nothing), notes wait on their string for it
    highway.judging = !!input.open && !!scorer;
    if (!tabs) highway.draw(t);
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
    if (!$('caption').classList.contains('hidden')) $('caption').style.bottom = tabs ? '' : `${highway.H - highway.boardTop + 12}px`;
    if (!audio.paused && performance.now() - lastResumeSave > 3000) { lastResumeSave = performance.now(); saveResume(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
