// The sync test: lines up the notes, the sound and the cable, played on the
// highway itself.
//
// Two short passes, the way rhythm games do it:
//   Watch  - silence, notes on the highway: play each one as it lands.
//   Listen - clicks, no notes: play along with what you hear.
// Each measures how late your playing is against the beat. Both include your
// own feel and the input's delay; only Watch includes the picture's delay,
// only Listen the sound's (speakers, a TV, Bluetooth). So:
//   Listen minus Watch: how much later the sound arrives than the picture,
//     the offset the highway needs (positive = notes land later);
//   Watch, played on the cable: how late your plucks reach PumaBass against
//     the notes you see, the offset scoring needs.
// The notes are open strings (D and G): nothing to fret, just the timing.
// With no cable, any key or a click on the highway is a tap; that sets the
// highway's offset only.
//
// The test runs in the player as a short song: the clicks play through the
// same media path as a song, and plucks are found through the same clock as
// scoring's, so what is measured is what a song does.

import { onsets } from './scoring.js';

const BEAT = 0.6;        // seconds between beats (100 BPM)
const LEAD = 3.0;        // before the first note: time to see them coming
const N = 20;            // beats in each pass (12 s)
const WARMUP = 4;        // beats to find the groove before they count
const GAP = 2.4;         // between the passes
const TAIL = 1.5;        // after the last click
const WINDOW = 0.28;     // s either side of a beat a pluck or tap belongs to it
const SR = 48000;

const LISTEN0 = LEAD + N * BEAT + GAP;
const END = LISTEN0 + N * BEAT + TAIL;

/** A WAV (as a blob URL): silence through Watch, then clicks on the Listen beats. */
function track() {
  const n = Math.ceil(END * SR);
  const data = new Int16Array(n);
  for (let b = 0; b < N; b++) {
    const start = Math.round((LISTEN0 + b * BEAT) * SR), f = b % 4 === 0 ? 1500 : 1000;
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
 * its audio, and the beats to measure ({ t, pass, i, ev }: ev is the note on
 * the highway, for Watch).
 */
export function syncTest() {
  const notes = [], targets = [], beats = [];
  for (let i = 0; i < N; i++) {
    const t = LEAD + i * BEAT;
    // A bar on the D string, a bar on the G, and so on.
    const ev = { t, s: Math.floor(i / 4) % 2 ? 3 : 2, f: 0, pi: 0 };
    notes.push(ev);
    targets.push({ t, pass: 'watch', i, ev });
  }
  for (let i = 0; i < N; i++) targets.push({ t: LISTEN0 + i * BEAT, pass: 'listen', i, ev: null });
  // Beat lines through Watch only: in Listen there is nothing to watch.
  for (let k = -8; k < N + 2; k++) beats.push({ t: LEAD + k * BEAT, m: k % 4 === 0 ? k / 4 : null });
  const watchEnd = LEAD + N * BEAT + GAP / 2;
  const chart = {
    id: '__sync__', title: 'Sync test', artist: 'PumaBass', arrangement: 'Bass', type: 'bass',
    strings: 4, tuning: [0, 0, 0, 0], centOffset: 0, capo: 0, songLength: END,
    beats: beats.filter(b => b.t >= 0),
    sections: [{ name: 'Watch', t: 0, end: watchEnd }, { name: 'Listen', t: watchEnd, end: END }],
    phrases: [{ name: 'sync', maxDifficulty: 0 }],
    phraseIterations: [{ phrase: 0, t: 0, end: END }],
    chordTemplates: [], maxDifficulty: 0,
    levels: [{ difficulty: 0, notes, anchors: [{ t: 0, end: END, fret: 1, width: 4, pi: 0 }], handShapes: [] }],
  };
  return { chart, url: track(), targets };
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/** The middle of the errors and how much they wander (both ms), or null with too few. */
export function summarise(errors) {
  if (errors.length < 6) return null;
  const mid = median(errors);
  return { ms: mid * 1000, spread: median(errors.map(e => Math.abs(e - mid))) * 1000, n: errors.length };
}

/**
 * Measures the playing against the test's beats: plucks heard on the cable
 * (found the way scoring finds them) and taps. Each beat keeps one error, so
 * playing a stretch again after a pause replaces it.
 */
export class SyncMeter {
  constructor(targets) {
    this.targets = targets;
    this.reset();
  }

  reset() {
    this.next = 0;
    this.plucks = new Map(); // target -> error (s, + = late)
    this.taps = new Map();
  }

  /** After a jump: measure again from the first beat at or after t. */
  seek(t) {
    this.next = this.targets.findIndex(x => x.t >= t - WINDOW);
    if (this.next < 0) this.next = this.targets.length;
  }

  /**
   * Find the plucks around every beat that has gone by: input(t0, t1) as in
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

  /** A tap at song time t (keys, clicks). Returns the beat it belongs to, if any. */
  tap(t, rate) {
    let best = null;
    for (const tg of this.targets) if (!best || Math.abs(tg.t - t) < Math.abs(best.t - t)) best = tg;
    if (!best || Math.abs(best.t - t) > WINDOW * rate) return null;
    this.taps.set(best, (t - best.t) / rate);
    return best;
  }

  /** How many beats of a pass have been heard (plucks) or tapped, after the warm-up. */
  count(pass, which = 'plucks') {
    let n = 0;
    for (const tg of this[which].keys()) if (tg.pass === pass && tg.i >= WARMUP) n++;
    return n;
  }

  errors(pass, which) {
    return [...this[which]].filter(([tg]) => tg.pass === pass && tg.i >= WARMUP).map(([, e]) => e);
  }

  /**
   * The result, given the offsets in use now ({ av, input }, ms) and whether
   * the cable was open. Plucks are used when there are enough of them, else
   * taps.
   *   { source, watch, listen, av, input }: av and input are the offsets to
   *   use (input only from plucks), or null when they couldn't be measured.
   */
  result(current, cable) {
    const from = which => ({ watch: summarise(this.errors('watch', which)), listen: summarise(this.errors('listen', which)) });
    const plucks = from('plucks');
    const usePlucks = cable && (plucks.watch || plucks.listen);
    const { watch, listen } = usePlucks ? plucks : from('taps');
    return {
      source: usePlucks ? 'cable' : 'taps',
      watch, listen,
      heard: usePlucks ? { watch: this.count('watch'), listen: this.count('listen') } : null,
      av: watch && listen ? Math.round(current.av + listen.ms - watch.ms) : null,
      input: usePlucks && watch ? Math.round(current.input + watch.ms) : null,
    };
  }
}

/** What to show over the highway at song time t. */
export function syncCue(t, meter, cable) {
  const per = N - WARMUP;
  const heard = pass => (cable ? meter.count(pass) : meter.count(pass, 'taps'));
  const how = cable ? 'pluck' : 'tap any key';
  if (t < LISTEN0 - GAP / 2) {
    const beat = Math.floor((t - LEAD) / BEAT + 0.5);
    return {
      big: 'Watch',
      small: beat < WARMUP ? cable ? 'Pluck each open string as its note lands. The first four warm you up.' : 'Tap any key as each note lands. The first four warm you up.'
        : `${heard('watch')} of ${per} ${cable ? 'heard' : 'tapped'}`,
    };
  }
  const beat = Math.floor((t - LISTEN0) / BEAT + 0.5);
  return {
    big: 'Listen',
    small: beat < WARMUP ? `Close your eyes and ${how} along with the clicks. Four count you in.` : `${heard('listen')} of ${per} ${cable ? 'heard' : 'tapped'}`,
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => `${ms >= 0 ? '+' : '−'}${Math.abs(Math.round(ms))} ms`;

/**
 * The result, in a sheet. Resolves 'use', 'retry' or null (leave it as it was).
 *   res      SyncMeter.result
 *   current  { av, input } in use now (ms)
 */
export function syncResult(res, current) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'gk-sheet calib-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Sync test');
    const per = N - WARMUP;
    const cable = res.source === 'cable';
    const usable = res.av !== null || res.input !== null;
    const row = (name, r, heard) => `<tr><td>${name}</td><td>${r ? fmt(r.ms) : '&ndash;'}</td><td>${r ? `within &plusmn;${Math.round(r.spread)} ms` : 'too few'}${heard !== undefined ? ` &middot; ${heard} of ${per} heard` : ''}</td></tr>`;
    let body;
    if (!usable) {
      body = `<p>${cable ? `Too few plucks were heard to measure (${res.heard.watch} of ${per} in Watch, ${res.heard.listen} of ${per} in Listen). Pluck firmly on every beat after the first four; check the cable's level in the Mix panel (<kbd>,</kbd>).` : 'Too few taps to measure. Tap on every beat, after the first four.'}</p>`;
    } else {
      const lines = [];
      if (res.av !== null) {
        const d = res.av;
        lines.push(`<p class="calib-result">${fmt(d)}</p><p>${Math.abs(d) < 10 ? 'Sound and picture reach you together.' : d > 0 ? `The sound reaches you ${Math.round(d)} ms after the picture, so the notes will land that much later.` : `The picture reaches you ${Math.round(-d)} ms after the sound, so the notes will land that much earlier.`} <span class="muted">Now: ${fmt(current.av)}.</span></p>`);
      }
      if (res.input !== null) {
        lines.push(`<p class="calib-result small">Cable ${fmt(res.input)}</p><p>Your plucks reach PumaBass ${Math.abs(res.input) < 10 ? 'right with the notes' : `${Math.round(Math.abs(res.input))} ms ${res.input > 0 ? 'after' : 'before'} the notes you see`}; scoring will allow for it. <span class="muted">Now: ${fmt(current.input)}.</span></p>`);
      }
      const shaky = [res.watch, res.listen].some(r => r && r.spread > 35);
      body = `${lines.join('')}
        <table class="calib-table">${row('Watch', res.watch, cable ? res.heard.watch : undefined)}${row('Listen', res.listen, cable ? res.heard.listen : undefined)}</table>
        ${res.av === null ? `<p class="gk-note warn">${res.watch ? 'Listen' : 'Watch'} had too few ${cable ? 'plucks' : 'taps'}, so the highway's offset is unchanged.</p>` : ''}
        ${shaky ? `<p class="gk-note warn">The ${cable ? 'plucks' : 'taps'} wandered quite a bit, so this is a rough reading. Another go may give a steadier one.</p>` : ''}
        ${cable ? '' : '<p class="gk-note">With the Real Tone Cable open, the test also sets scoring\'s timing.</p>'}`;
    }
    el.innerHTML = `<div class="gk-box calib"><div class="gk-head"><h2>Sync test</h2><button data-x aria-label="Close">&times;</button></div><div class="gk-body">${body}
      <div class="gk-row">${usable ? '<button class="primary" data-use><kbd>Enter</kbd>Use these</button>' : ''}<button ${usable ? '' : 'class="primary" '}data-retry>${usable ? '' : '<kbd>Enter</kbd>'}Try again</button><button data-x>Cancel</button></div></div></div>`;
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

export const SYNC = { BEAT, LEAD, N, WARMUP, LISTEN0, END, WINDOW };
