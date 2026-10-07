// Scoring: was each note played, at the right time, at the right pitch?
//
// For every note the player judges, a stretch of the instrument input around
// the note's moment is examined:
//   1. a pluck (onset): a jump in the input's high-frequency energy, the
//      click of a string being struck. Wanted within EARLY/LATE of the note.
//      This is what tells a played note from the previous one still ringing,
//      which matters on bass, where the same note repeats so often.
//   2. the pitch: is the input periodic at the expected note (the string's
//      tuning, the fret, the song's cent offset), and not at half that period
//      (the octave above, which repeats at the expected period too)?
// Hammer-ons and pull-offs have no pluck, so only the pitch counts; muted
// notes and harmonics only the pluck; chords, the pluck (one cable can't
// reliably pick out several pitches at once).
// Plain functions and one class, no browser APIs, so Node can test them.

export const EARLY = 0.13;   // s, real time, a pluck may come before the note
export const LATE = 0.15;    // s, real time, a pluck may come after it
const PITCH_CENTS = 50;      // how far off the expected pitch still counts
const PERIODIC = 0.8;        // normalised correlation at the expected period that counts as "sounding"
const OCTAVE_MARGIN = 0.06;  // the octave above must correlate this much less, or it was the octave above
const STANDARD = { 4: [28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64] };

const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);

/** The frequency a note should sound at. */
export function noteFreq(part, chart) {
  const open = STANDARD[chart.strings][part.s] + (chart.tuning[part.s] || 0) + (chart.capo || 0);
  return midiToFreq(open + part.f) * 2 ** ((chart.centOffset || 0) / 1200);
}

/**
 * Plucks in a stretch of samples: times (s from the stretch's start) where
 * the first difference's energy -- the high end, where a pluck's click is --
 * jumps well above what it was just before.
 */
export function onsets(x, sr) {
  const hop = Math.round(0.004 * sr), win = Math.round(0.008 * sr);
  const env = [];
  for (let i = 1; i + win < x.length; i += hop) {
    let e = 0;
    for (let k = 0; k < win; k++) { const d = x[i + k] - x[i + k - 1]; e += d * d; }
    env.push(e / win);
  }
  const sorted = [...env].sort((a, b) => a - b);
  const floor = Math.max(1e-7, sorted[Math.floor(sorted.length * 0.2)] * 4);
  const out = [];
  let last = -1;
  for (let i = 3; i < env.length; i++) {
    let before = Infinity;
    for (let j = Math.max(0, i - 10); j <= i - 3; j++) before = Math.min(before, env[j]);
    if (env[i] > floor && env[i] > 4 * before && env[i] >= env[i - 1] && i - last > 12) {
      // back up to where the rise began
      let s = i;
      while (s > 0 && env[s - 1] > 2 * before && env[s - 1] < env[s]) s--;
      out.push((1 + s * hop) / sr);
      last = i;
    }
  }
  return out;
}

/** Normalised correlation (-1..1) of x with itself shifted by lag samples, over n samples. */
function nsdf(x, lag, n) {
  let r = 0, m = 0;
  for (let j = 0; j < n; j++) { const a = x[j], b = x[j + lag]; r += a * b; m += a * a + b * b; }
  return m > 0 ? (2 * r) / m : 0;
}

/**
 * Is a pitch sounding in x? Downsampled first, keeping ~100 samples a period
 * (about 17 cents a step), then the correlation's peak is found within
 * +/-SEARCH cents of the expected period and placed between steps. A match
 * needs a strong peak, within PITCH_CENTS of the expected pitch (a semitone
 * off peaks a semitone away), and the octave above not as strong (a note an
 * octave up repeats at the expected period too).
 * Returns { match, cents, at, octave }.
 */
const SEARCH = 150;
export function pitchPresent(x, sr, freq) {
  const step = Math.max(1, Math.floor(sr / (freq * 100)));
  const n0 = Math.floor(x.length / step), y = new Float32Array(n0);
  for (let i = 0; i < n0; i++) { let s = 0; for (let k = 0; k < step; k++) s += x[i * step + k]; y[i] = s; }
  const rate = sr / step, period = rate / freq;
  const lo = Math.max(2, Math.floor(period / 2 ** (SEARCH / 1200))), hi = Math.ceil(period * 2 ** (SEARCH / 1200)) + 1;
  const n = n0 - hi - 1;
  if (n < period * 1.5) return { match: false, cents: null, at: 0, octave: 0 };
  let bestLag = lo, best = -1;
  const vals = [];
  for (let lag = lo; lag <= hi + 1; lag++) { const v = nsdf(y, lag, n); vals[lag] = v; if (lag <= hi && v > best) { best = v; bestLag = lag; } }
  // between steps: a parabola through the peak and its neighbours
  const a = vals[bestLag - 1] ?? best, c = vals[bestLag + 1] ?? best, den = a - 2 * best + c;
  const exact = bestLag + (den < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0);
  const cents = 1200 * Math.log2(period / exact); // + = sharp
  let octave = -1;
  for (let lag = Math.floor(period / 2 / 2 ** (PITCH_CENTS / 1200)); lag <= Math.ceil((period / 2) * 2 ** (PITCH_CENTS / 1200)); lag++) octave = Math.max(octave, nsdf(y, lag, n));
  const edge = bestLag <= lo || bestLag >= hi; // the peak is outside the search: some other note
  return { match: !edge && best >= PERIODIC && Math.abs(cents) <= PITCH_CENTS && octave < best - OCTAVE_MARGIN, cents, at: best, octave };
}

const TECH_PITCH_ONLY = ['hammer', 'pull', 'tap'];
const TECH_PLUCK_ONLY = ['mute', 'harmonic', 'pinch'];

/**
 * Judge one note event from a stretch of input. Every time here is real
 * seconds into x (at a slower playback speed, song time runs slower, but the
 * player's timing and pitch are real).
 *   x, sr      the samples, and their rate
 *   at         where the note's moment falls in x
 *   ev         the note event (a single note, or a chord with .notes)
 *   chart      for the tuning
 *   taken      plucks already given to earlier notes: not reused
 *   prev, next where the neighbouring notes fall
 * Returns { hit, offset (s, + = late; null when no pluck was needed), pluck }.
 */
export function judge(x, sr, at, ev, chart, taken = [], { prev = -Infinity, next = Infinity } = {}) {
  const parts = ev.notes || [ev];
  const tech = ev.tech || parts[0].tech || [];
  const chord = parts.length > 1;
  const needsPluck = !tech.some(t => TECH_PITCH_ONLY.includes(t));
  const needsPitch = !chord && !tech.some(t => TECH_PLUCK_ONLY.includes(t));
  // A pluck belongs to whichever note it is nearest, so a fast run's
  // windows stop halfway to the neighbouring notes.
  const early = Math.min(EARLY, (at - prev) / 2), late = Math.min(LATE, (next - at) / 2);

  let pluck = null;
  const heard = onsets(x, sr);
  if (needsPluck) {
    const cands = heard.filter(o => o >= at - early && o <= at + late && !taken.some(t => Math.abs(t - o) < 0.02));
    if (!cands.length) return { hit: false, offset: null, pluck: null, why: 'no pluck' };
    pluck = cands.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a));
  }
  if (!needsPitch) return { hit: true, offset: pluck === null ? null : pluck - at, pluck };

  // The pitch: just after the pluck (past its click), or for legato notes,
  // anywhere in the window.
  const freq = noteFreq(parts[0], chart);
  // ~3.5 periods to look at, plus the search's longest lag; but never into
  // the next note (a fast run leaves less room: down to 1.5 periods).
  const lagRoom = 2 ** (SEARCH / 1200) / freq;
  const room = s => {
    const after = heard.find(o => o > s + 0.01); // the next pluck actually heard
    return Math.min(3.5 / freq, Math.min(next - 0.008, after === undefined ? Infinity : after - 0.005) - s - lagRoom);
  };
  const starts = pluck !== null ? [pluck + 0.015] : [];
  let last = null;
  if (pluck === null) {
    // A hammer-on or pull-off is a change of pitch: if the expected pitch was
    // already ringing just before the note (an earlier note at that pitch),
    // finding it now proves nothing.
    // Only since the previous note began: before that, the pitch may well have
    // been ringing (a 7-5-7 hammer-on). Too little room to tell: no verdict.
    const end = at - 0.045, start = Math.max(end - 3.5 / freq - lagRoom, prev + 0.015);
    const i = Math.round(start * sr), j = Math.round(end * sr);
    if (i >= 0 && j <= x.length && end - start >= 1.5 / freq + lagRoom && pitchPresent(x.subarray(i, j), sr, freq).match) return { hit: false, offset: null, pluck: null, why: 'already sounding' };
  }
  if (pluck === null) for (let s = at - early; s <= at + late; s += 0.02) starts.push(s);
  for (const s of starts) {
    const look = room(s);
    if (look < 1.5 / freq) continue;
    const i = Math.max(0, Math.round(s * sr)), need = Math.ceil((look + lagRoom) * sr) + 4;
    if (i + need > x.length) continue;
    const p = pitchPresent(x.subarray(i, i + need), sr, freq);
    last = p;
    if (p.match) return { hit: true, offset: pluck === null ? null : pluck - at, pluck };
  }
  return { hit: false, offset: pluck === null ? null : pluck - at, pluck, why: 'wrong pitch', pitch: last };
}

/**
 * Follows a song as it plays, judging each note once its window has passed.
 *   chart, notes   the chart and the notes being played (the player's, at its difficulty)
 *   sectionOf(t)   index of the section a time falls in
 */
export class Scorer {
  constructor(chart, notes, sectionOf) {
    this.chart = chart;
    this.notes = notes;
    this.sectionOf = sectionOf;
    this.next = 0;           // the next note to judge
    this.hits = 0;
    this.judged = 0;
    this.streak = 0;
    this.best = 0;
    this.offsets = [];       // s, + = late, for plucked hits
    this.sections = new Map(); // section index -> { hits, judged }
    this.results = new Map();  // note event -> { hit, when }
    this.taken = [];         // recent plucks (song time) already given to notes
  }

  /** After a jump: carry on from the first note at or after t. Notes before stay judged. */
  seek(t) {
    let lo = 0, hi = this.notes.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.notes[m].t < t) lo = m + 1; else hi = m; }
    this.next = lo;
    this.taken = [];
  }

  /**
   * Judge every note whose window has closed by song time now.
   *   rate          playback speed: song time runs at rate x real time
   *   input(t0, t1) -> { x, sr, t0 } real-time samples covering song time
   *                 t0..t1 (t0: the song time of x[0]); 'later' when they
   *                 haven't all arrived yet; null when they never will
   *   onResult(ev, result)  for the highway's feedback
   */
  update(now, rate, input, onResult) {
    while (this.next < this.notes.length) {
      const ev = this.notes[this.next];
      const close = ev.t + (LATE + 0.12) * rate; // room after the window for the pitch check
      if (now < close) break;
      const from = ev.t - (EARLY + 0.08) * rate;
      const seg = input(from, close);
      if (seg === 'later') break; // the input for it is still on its way: next frame
      this.next++;
      if (!seg) continue; // no input for that stretch (paused, unplugged): not judged
      const real = t => (t - seg.t0) / rate; // song time -> seconds into seg.x
      const taken = this.taken.filter(t => t > from).map(real);
      const prev = this.next >= 2 ? real(this.notes[this.next - 2].t) : -Infinity;
      const nextT = this.next < this.notes.length ? real(this.notes[this.next].t) : Infinity;
      const r = judge(seg.x, seg.sr, real(ev.t), ev, this.chart, taken, { prev, next: nextT });
      if (r.pluck !== null) this.taken.push(seg.t0 + r.pluck * rate);
      if (this.taken.length > 64) this.taken.splice(0, 32);
      this.record(ev, r);
      if (onResult) onResult(ev, r);
    }
  }

  record(ev, r) {
    this.judged++;
    const sec = this.sectionOf(ev.t);
    const s = this.sections.get(sec) || { hits: 0, judged: 0 };
    s.judged++;
    if (r.hit) {
      this.hits++; s.hits++;
      this.streak++; this.best = Math.max(this.best, this.streak);
      if (r.offset !== null) this.offsets.push(r.offset);
    } else this.streak = 0;
    this.sections.set(sec, s);
    this.results.set(ev, { hit: r.hit, at: ev.t });
  }

  get accuracy() { return this.judged ? this.hits / this.judged : null; }

  /** Typical timing (ms, + = late) and how much it varies, from the plucked hits. */
  timing() {
    if (this.offsets.length < 8) return null;
    const s = [...this.offsets].sort((a, b) => a - b), mid = s[s.length >> 1];
    const spread = [...s.map(o => Math.abs(o - mid))].sort((a, b) => a - b)[s.length >> 1];
    return { ms: mid * 1000, spread: spread * 1000 };
  }
}
