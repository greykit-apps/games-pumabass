// The sync test's flow in the player (the test itself: web/js/calibrate.js).

import { alertSheet } from './title.js';
import { syncTest, SyncMeter, syncCue, syncResult, metronome, SYNC } from './calibrate.js';
import { $, audio, input, fmtMs, screen } from './core.js';
import { ensureInput } from './instrument.js';
import { showLibrary } from './library-screen.js';
import { showTitle, leaveTitle } from './menu.js';
import { openTestSong, leaveSong, inputBetween, songTime, seek, togglePlay, updatePlayButton } from './player.js';
import { prefs, savePrefs } from './store.js';

/* The sync test (web/js/calibrate.js) runs in the player as a short song of
 * its own. First the line-up: a tick and a swinging bar, the bar moved (the
 * picture's offset, live) until it lands on the tick. Then, with the cable,
 * the play-along: notes with the tick, the plucks measured. calib holds it
 * while it runs: the step, the offsets it started from, and the screen to go
 * back to. */
export let calib = null;

export async function runCalibration() {
  if (prefs.input) await ensureInput({ ask: false }); // the cable, if it was chosen and is plugged in
  const test = syncTest();
  calib = { test, meter: new SyncMeter(test.targets), back: screen, phase: 'align', orig: { av: prefs.avOffset, input: prefs.inputOffset } };
  if (screen === 'title') leaveTitle();
  await openTestSong(test);
  $('metro').classList.remove('hidden', 'playing');
  $('metro-done').innerHTML = `<kbd>Enter</kbd>${input.open ? 'They match: play along' : 'They match'}`;
  $('metro-step').textContent = input.open ? 'Step 1 of 2 \u00b7 then play along' : ''; // one step without the cable: the corner says it
  togglePlay();
  updatePlayButton();
}

/* Move the bar: the picture's offset, live. */
export function nudgeSync(ms) {
  if (!calib || calib.phase !== 'align') return;
  prefs.avOffset = Math.max(-1000, Math.min(1000, prefs.avOffset + ms));
}

/* The bar lands on the tick: on to the play-along (with the cable), or done. */
export async function alignDone() {
  if (!calib || calib.phase !== 'align') return;
  if (!input.open) { await finishSync(); return; }
  calib.phase = 'play';
  calib.meter.reset();
  $('metro').classList.add('playing');
  seek(SYNC.PLAY);
  if (audio.paused) togglePlay();
}

/* The play-along is over: show what it measured. */
export async function playAlongDone() {
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
  if (choice === 'use') {
    prefs.inputOffset = res.input;
    // The soundcheck's noise floor, for scoring with this input.
    const n = res.level.noise;
    if (n) prefs.soundcheck = { device: input.deviceId, energy: n.energy, diff: n.diff, db: n.db, pluckDb: res.level.pluckDb };
  }
  await finishSync();
}

/* Keep the offsets the test arrived at, and leave. */
export async function finishSync() {
  savePrefs();
  const { orig } = calib;
  calib.kept = true;
  endSync();
  if (prefs.avOffset !== orig.av || prefs.inputOffset !== orig.input) {
    await alertSheet(`Timing set. For every song, the notes land ${fmtMs(prefs.avOffset)}${prefs.avOffset ? (prefs.avOffset > 0 ? ' later' : ' sooner') : ''}${prefs.inputOffset !== orig.input ? `, and scoring allows ${fmtMs(prefs.inputOffset)} for the cable` : ''}. Run Sync again to change them.`, 'Sync');
  }
}

/* Leave the test; left any other way than finishing, the offsets go back. */
export function endSync() {
  const { back, test, kept, orig } = calib;
  if (!kept) { prefs.avOffset = orig.av; prefs.inputOffset = orig.input; savePrefs(); }
  calib = null;
  leaveSong();
  URL.revokeObjectURL(test.url);
  if (back === 'title') showTitle().reveal(); else showLibrary();
}

/* Keys during the test. True when handled. */
export function calibKey(e) {
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


/* Each frame of the test, at song time t: the plucks, going round the
 * line-up, and the bar and what to do. */
export function syncFrame(t) {
  if (!audio.paused) {
    // Heard or not, its notes aren't judged on the highway: it's a measurement, not a test of you.
    if (calib.phase === 'play' && input.open) calib.meter.update(t, audio.playbackRate, inputBetween);
    // The line-up goes round again for as long as it takes (by a whole number of beats).
    if (calib.phase === 'align' && t >= SYNC.ALIGN_END - 1) { seek(audio.currentTime - 60, false); t = songTime(); }
  }
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
