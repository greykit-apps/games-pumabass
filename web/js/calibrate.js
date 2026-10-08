// The sync test: lines up the picture with the sound, then the cable with both.
//
// 1. Line up. A tick sounds on every beat, and a bar swings left and right,
//    reaching a side on every beat. You move it earlier or later until it
//    lands right on the tick: that is how much later (or sooner) this
//    computer's sound reaches you than its picture, the offset every song's
//    notes need. The tick plays through the same media path as a song, and the
//    bar runs on the same clock as the highway, so what lines up here lines
//    up in a song.
// 2. Play along (with the Real Tone Cable open). Quarter notes on the open E
//    string come down the highway with the tick: pluck along for a while. With
//    picture and sound lined up, how late the plucks reach PumaBass against
//    the notes is the cable's delay (and your own feel), the allowance scoring
//    needs. Plucks are found the way scoring finds them, through the same
//    clock, so what is measured is what scoring sees.
//
// The test runs in the player as a short song.

import { onsets } from './scoring.js';

const BEAT = 0.6;        // seconds between ticks (100 BPM)
const ALIGN_END = 90;    // the line-up part runs this long (and goes round again if need be)
const PLAY = 90;         // where the play-along starts: an exact number of beats in
const COUNT = 4;         // ticks to count you in before the first note
const NOTES = 32;        // notes to play along with
const WARMUP = 4;        // notes to find the groove before they count
const TAIL = 2;          // after the last note
const WINDOW = 0.28;     // s either side of a note a pluck belongs to it
const SR = 22050;        // ample for a tick, and keeps the track small

const END = PLAY + (COUNT + NOTES) * BEAT + TAIL;

/** A WAV (as a blob URL): a tick on every beat, the first of each four higher. */
function track() {
  const n = Math.ceil(END * SR);
  const data = new Int16Array(n);
  const beats = Math.floor((END - TAIL) / BEAT + 0.5);
  for (let b = 0; b < beats; b++) {
    const start = Math.round(b * BEAT * SR), f = b % 4 === 0 ? 1500 : 1000;
    for (let i = 0; i < 0.03 * SR; i++) data[start + i] = Math.round(0.7 * 32767 * Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (0.006 * SR)));
  }
  const head = new DataView(new ArrayBuffer(44));
  const str = (o, s) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); head.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, SR, true); head.setUint32(28, SR * 2, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
  str(36, 'data'); head.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([head, data], { type: 'audio/wav' }));
}

/**
 * The test as a song: its chart (shaped like the server's, for the player),
 * its audio, and the notes to measure ({ t, i, ev }).
 */
export function syncTest() {
  const notes = [], targets = [], beats = [];
  for (let i = 0; i < NOTES; i++) {
    const t = PLAY + (COUNT + i) * BEAT;
    const ev = { t, s: 0, f: 0, pi: 0 }; // the open E string
    notes.push(ev);
    targets.push({ t, i, ev });
  }
  // Beat lines through the play-along only: the line-up has the bar.
  for (let k = -8; k < COUNT + NOTES + 2; k++) beats.push({ t: PLAY + k * BEAT, m: k % 4 === 0 ? k / 4 : null });
  const chart = {
    id: '__sync__', title: 'Sync test', artist: 'PumaBass', arrangement: 'Bass', type: 'bass',
    strings: 4, tuning: [0, 0, 0, 0], centOffset: 0, capo: 0, songLength: END,
    beats,
    sections: [{ name: 'Line up', t: 0, end: PLAY }, { name: 'Play along', t: PLAY, end: END }],
    phrases: [{ name: 'sync', maxDifficulty: 0 }],
    phraseIterations: [{ phrase: 0, t: 0, end: END }],
    chordTemplates: [], maxDifficulty: 0,
    levels: [{ difficulty: 0, notes, anchors: [{ t: 0, end: END, fret: 1, width: 4, pi: 0 }], handShapes: [] }],
  };
  return { chart, url: track(), targets };
}

/**
 * The bar at song time t: where it is across its track (0 left, 1 right),
 * reaching a side on every beat, and how long ago (s) it reached one.
 */
export function metronome(t) {
  const beat = t / BEAT;
  const ph = ((beat % 2) + 2) % 2;
  return { x: ph < 1 ? ph : 2 - ph, since: (beat - Math.floor(beat)) * BEAT };
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/** The middle of the errors and how much they wander (both ms), or null with too few. */
export function summarise(errors) {
  if (errors.length < 8) return null;
  const mid = median(errors);
  return { ms: mid * 1000, spread: median(errors.map(e => Math.abs(e - mid))) * 1000, n: errors.length };
}

/**
 * Measures the plucks against the notes, found the way scoring finds them.
 * Each note keeps one error, so playing a stretch again after a pause replaces it.
 */
export class SyncMeter {
  constructor(targets) {
    this.targets = targets;
    this.reset();
  }

  reset() {
    this.next = 0;
    this.plucks = new Map(); // target -> error (s, + = late)
  }

  /** After a jump: measure again from the first note at or after t. */
  seek(t) {
    this.next = this.targets.findIndex(x => x.t >= t - WINDOW);
    if (this.next < 0) this.next = this.targets.length;
  }

  /**
   * Find the plucks around every note that has gone by: input(t0, t1) as in
   * scoring (the input for song time t0..t1, 'later' or null). found(target,
   * heard) for the highway's marks.
   */
  update(now, rate, input, found) {
    while (this.next < this.targets.length) {
      const tg = this.targets[this.next];
      const close = tg.t + (WINDOW + 0.06) * rate;
      if (now < close) break;
      const seg = input(tg.t - (WINDOW + 0.06) * rate, close);
      if (seg === 'later') break;
      this.next++;
      if (!seg) continue;
      const at = (tg.t - seg.t0) / rate;
      const near = onsets(seg.x, seg.sr).filter(o => Math.abs(o - at) <= WINDOW);
      const o = near.length ? near.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a)) : null;
      if (o !== null) this.plucks.set(tg, o - at);
      else this.plucks.delete(tg);
      if (found && tg.i >= WARMUP) found(tg, o !== null);
    }
  }

  /** How many notes after the warm-up were heard. */
  get heard() {
    let n = 0;
    for (const tg of this.plucks.keys()) if (tg.i >= WARMUP) n++;
    return n;
  }

  /** The result, given the cable's allowance in use now (ms): { timing, heard, input }. */
  result(currentInput) {
    const timing = summarise([...this.plucks].filter(([tg]) => tg.i >= WARMUP).map(([, e]) => e));
    return { timing, heard: this.heard, input: timing ? Math.round(currentInput + timing.ms) : null };
  }
}

/** What to say over the highway: in the line-up (with the offset now), or the play-along. */
export function syncCue(phase, t, meter, av) {
  const per = NOTES - WARMUP;
  if (phase === 'align') {
    return {
      big: 'Line up',
      small: `Move the bar until it reaches each side right on the tick. Now ${fmt(av)}.`,
    };
  }
  const beat = Math.floor((t - PLAY) / BEAT + 0.5);
  return {
    big: 'Play along',
    small: beat < COUNT + WARMUP ? 'Pluck the open E string on every tick, with the notes. The first few warm you up.'
      : `${meter.heard} of ${per} heard`,
  };
}

const fmt = ms => `${ms >= 0 ? '+' : '−'}${Math.abs(Math.round(ms))} ms`;

/**
 * The play-along's result, in a sheet. Resolves 'use' (the cable's figure
 * too), 'retry', or null (the lined-up picture offset only).
 *   res      SyncMeter.result
 *   current  { av, input } (ms): the picture's offset just set, and the cable's in use
 */
export function syncResult(res, current) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'gk-sheet calib-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Sync test');
    const per = NOTES - WARMUP;
    const usable = res.input !== null;
    const body = usable
      ? `<p class="calib-result small">Picture ${fmt(current.av)}</p><p>As you lined it up: the notes land ${Math.abs(current.av) < 10 ? 'right with the sound' : `${Math.round(Math.abs(current.av))} ms ${current.av > 0 ? 'later' : 'sooner'}, to meet the sound`}.</p>
        <p class="calib-result">Cable ${fmt(res.input)}</p>
        <p>Your plucks reach PumaBass ${Math.abs(res.input) < 10 ? 'right with the notes' : `${Math.round(Math.abs(res.input))} ms ${res.input > 0 ? 'after' : 'before'} the notes`}; scoring will allow for it. <span class="muted">Now: ${fmt(current.input)}.</span></p>
        <table class="calib-table"><tr><td>Plucks</td><td>${res.heard} of ${per} heard</td><td>within &plusmn;${Math.round(res.timing.spread)} ms of each other</td></tr></table>
        ${res.timing.spread > 35 ? '<p class="gk-note warn">The plucks wandered quite a bit, so this is a rough reading. Another go may give a steadier one.</p>' : ''}`
      : `<p>Too few plucks were heard to measure (${res.heard} of ${per}). Pluck the open E string firmly on every tick after the first few; check the cable's level in the Mix panel (<kbd>,</kbd>).</p>
        <p class="gk-note">The picture's offset you lined up (${fmt(current.av)}) is kept either way.</p>`;
    el.innerHTML = `<div class="gk-box calib"><div class="gk-head"><h2>Sync test</h2><button data-x aria-label="Close">&times;</button></div><div class="gk-body">${body}
      <div class="gk-row">${usable ? '<button class="primary" data-use><kbd>Enter</kbd>Use these</button>' : ''}<button ${usable ? '' : 'class="primary" '}data-retry>${usable ? '' : '<kbd>Enter</kbd>'}Play along again</button><button data-x>${usable ? 'Keep the picture only' : 'Done'}</button></div></div></div>`;
    const close = v => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      resolve(v);
    };
    const onKey = e => {
      e.stopPropagation(); // nothing reaches the screen behind
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); close(usable ? 'use' : 'retry'); }
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (e.target === el) return close(null);
      if (!b) return;
      if (b.hasAttribute('data-x')) close(null);
      else if (b.hasAttribute('data-use')) close('use');
      else if (b.hasAttribute('data-retry')) close('retry');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    el.querySelector('.primary').focus({ preventScroll: true });
  });
}

export const SYNC = { BEAT, ALIGN_END, PLAY, COUNT, NOTES, WARMUP, END, WINDOW };
