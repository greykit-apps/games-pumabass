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

// Rocksmith 2014's windows (its games.transient.json: NoteBackwardDelay -0.2, NoteForwardDelay 0.3).
export const EARLY = 0.2;    // s, real time, a pluck may come before the note
export const LATE = 0.3;     // s, real time, a pluck may come after it (learners drag a little)
const PITCH_CENTS = 50;      // how far off the expected pitch still counts
const PERIODIC = 0.5;        // normalised correlation at the expected period that counts as "sounding"
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
 * "Just before" is averaged over BEFORE, longer than a period of the lowest
 * bass string: a low note's waveform has a sharp spike once a period, and
 * against a quiet moment between two spikes, every spike would look like a
 * pluck. Each window is long enough to hold a good part of a period, too.
 */
const BEFORE = 0.044;
export function onsets(x, sr, { noise = null } = {}) {
  const hop = Math.round(0.004 * sr), win = Math.round(0.012 * sr);
  const env = [];
  for (let i = 1; i + win < x.length; i += hop) {
    let e = 0;
    for (let k = 0; k < win; k++) { const d = x[i + k] - x[i + k - 1]; e += d * d; }
    env.push(e / win);
  }
  // Nothing within a few times the cable's own noise (from the soundcheck, when there is one) is a pluck.
  const floor = Math.max(1e-7, pct(env, 0.2) * 4, noise ? noise.diff * 4 : 0);
  const gap = Math.ceil(win / hop), span = Math.round(BEFORE * sr / hop); // windows clear of this one; how many to average
  const out = [];
  let last = -1;
  for (let i = gap; i < env.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - gap - span + 1); j <= i - gap; j++) { sum += env[j]; n++; }
    const before = sum / n;
    if (env[i] > floor && env[i] > 4 * before && env[i] >= env[i - 1] && i - last > 12) {
      // back up to where the rise began
      let s = i;
      while (s > 0 && env[s - 1] > 2 * before && env[s - 1] < env[s]) s--;
      out.push((1 + s * hop + LEAD_IN * win) / sr);
      last = i;
    }
  }
  return out;
}
const LEAD_IN = 0.8; // where in the first loud window the pluck is taken to be: about where the click is

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * p)] : 0; };

/**
 * The cable's noise, from a stretch with the strings held quiet (the
 * soundcheck): { energy, diff, db }, in the units the pluck detectors use.
 * Its typical level counts, so a stray touch doesn't spoil it.
 */
export function noiseOf(x, sr) {
  const n = Math.round(0.05 * sr), energy = [], diff = [];
  for (let i = 1; i + n <= x.length; i += n) {
    let e = 0, d = 0;
    for (let k = 0; k < n; k++) { const v = x[i + k], dv = v - x[i + k - 1]; e += v * v; d += dv * dv; }
    energy.push(e / n); diff.push(d / n);
  }
  if (energy.length < 6) return null;
  // Rocksmith sets its noise floor 2 dB over what it hears with the strings muted.
  const e = pct(energy, 0.5) * 10 ** 0.2, d = pct(diff, 0.5) * 10 ** 0.2;
  return { energy: e, diff: d, db: 10 * Math.log10(Math.max(e, 1e-12)) };
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

/**
 * What the input says about the expected pitch, weighing it against the notes
 * a player could have played instead: 'right', 'wrong' or 'unclear'.
 * A real bass through a cable is rarely clean: the last note still ringing, an
 * open string nobody muted, a weak fundamental. Those blur the expected pitch
 * without putting a different one in its place, so the pitch counts as right
 * when it's there at all, and wrong only on clear evidence of another note:
 * a stronger, clearly periodic pitch one to six semitones away (a wrong fret),
 * or the octave above clearly in charge (the same fret on the next string up
 * an octave, or a harmonic).
 */
const RIGHT_AT = 0.45, OTHER_AT = 0.7, OCTAVE_AT = 0.6;
export function pitchCheck(x, sr, freq) {
  // Near the expected pitch: where the strongest period lies (within SEARCH cents), and the octave.
  const p = pitchPresent(x, sr, freq);
  if (p.cents === null) return { verdict: 'unclear', ...p };
  const octaveRules = p.octave >= OCTAVE_AT && p.octave >= p.at - OCTAVE_MARGIN;
  if (octaveRules) return { verdict: 'wrong', ...p };
  const near = Math.abs(p.cents) <= PITCH_CENTS && !(p.at <= -1);
  if (near && p.at >= RIGHT_AT) return { verdict: 'right', ...p };
  if (!near) return { verdict: p.at >= OTHER_AT ? 'wrong' : 'off', ...p }; // the strongest pitch is a semitone or so away
  // Further off (two to six semitones): a clear pitch there is another note.
  const step = Math.max(1, Math.floor(sr / (freq * 100)));
  const n0 = Math.floor(x.length / step), y = new Float32Array(n0);
  for (let i = 0; i < n0; i++) { let s = 0; for (let k = 0; k < step; k++) s += x[i * step + k]; y[i] = s; }
  const period = sr / step / freq, n = n0 - Math.ceil(period * 2 ** (6.5 / 12)) - 2;
  let other = -1;
  if (n > period * 1.5) for (let k = 2; k <= 6; k++) for (const sgn of [1, -1]) {
    const c = sgn * k * 100;
    for (let lag = Math.floor(period / 2 ** ((c + 25) / 1200)); lag <= Math.ceil(period / 2 ** ((c - 25) / 1200)); lag++) other = Math.max(other, nsdf(y, lag, n));
  }
  if (other >= OTHER_AT && other > p.at + 0.05) return { verdict: 'wrong', ...p, other };
  return { verdict: 'unclear', ...p, other };
}

/**
 * A re-pluck of a note still ringing, between from and to (s into x), when
 * its click was too soft to hear: the note is steady at freq before the
 * finger came down (GAP before) and after the pluck's click, but what follows
 * doesn't carry on what came before. Either it breaks step: the measure (as
 * nsdf) drops both when the string starts over out of step and when it jumps
 * in level; a string left ringing stays near 1 (on real takes, rarely under
 * 0.7), a re-pluck mostly falls under 0.4. Or it gains energy: an open string
 * re-plucked often carries on nearly in step, a little louder, and a string
 * left alone only loses energy (on real takes, doubled 3 times in 200).
 * Damping only takes level away, so the level after must be at least half
 * what it was. A change of note never counts: it isn't steady at freq on
 * both sides.
 * Returns where it starts over (s into x), or null.
 */
const STEADY = 0.8, BREAK = 0.4, GAP = 0.02, KEPT = 0.5, GAINED = 2;
export function rePluck(x, sr, from, to, freq) {
  const step = Math.max(1, Math.floor(sr / (freq * 100)));
  const n0 = Math.floor(x.length / step), y = new Float32Array(n0);
  for (let i = 0; i < n0; i++) { let s = 0; for (let k = 0; k < step; k++) s += x[i * step + k]; y[i] = s; }
  const rate = sr / step, T = rate / freq, P = Math.round(2 * T), W = Math.ceil(T * 1.02);
  const click = Math.round(0.015 * rate), gap = Math.round(GAP * rate);
  // the best match within 2% of a lag (a string's pitch drifts a little): y from i against y lag earlier
  const near = (i, lag0, n) => {
    let b = -1;
    for (let lag = Math.floor(lag0 * 0.98); lag <= Math.ceil(lag0 * 1.02); lag++) {
      let r = 0, m = 0;
      for (let j = 0; j < n; j++) { const a = y[i - lag + j], c = y[i + j]; r += a * c; m += a * a + c * c; }
      if (m > 0) b = Math.max(b, (2 * r) / m);
    }
    return b;
  };
  const energy = (s, e) => { let m = 0; for (let j = s; j < e; j++) m += y[j] * y[j]; return m / (e - s); };
  const first = Math.max(Math.ceil(from * rate), gap + W + 2 * P), last = Math.min(Math.floor(to * rate), n0 - click - W - P - 1);
  let best = null, lowest = Infinity;
  for (let i = first; i <= last; i += Math.max(1, Math.round(0.005 * rate))) {
    const across = near(i, P, P); // the two periods after i, against the two before
    if (across >= lowest) continue;
    const kept = energy(i + click, i + click + W + P) / energy(i - gap - W - P, i - gap);
    if (kept < KEPT || (across >= BREAK && kept < GAINED)) continue;
    if (near(i - gap - P, T, P) < STEADY || near(i + click + W, T, P) < STEADY) continue;
    lowest = across; best = i / rate;
  }
  return best;
}

/**
 * x with everything well below fc taken out: two Butterworth high-pass
 * stages (24 dB an octave). Open strings nobody muted ring under a played
 * note (the low E and A under an F on the D string), out of step with it,
 * and blur its period until a right note reads as a wrong one; below the
 * note they can go. A wrong fret keeps its own period (its overtones repeat
 * at it), so it still reads as wrong.
 */
const BELOW = 5; // semitones under the expected note where the high-pass starts
function highpass(x, sr, fc) {
  const w = (2 * Math.PI * fc) / sr, cw = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let y = x;
  for (let stage = 0; stage < 2; stage++) {
    const out = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i], r = b0 * v + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      out[i] = r; x2 = x1; x1 = v; y2 = y1; y1 = r;
    }
    y = out;
  }
  return y;
}

const QUIET = 10 ** (10 / 10); // within 10 dB of the noise floor counts as silence
const meanSquare = x => { let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i]; return x.length ? e / x.length : 0; };

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
 *   noise      the cable's noise, from the soundcheck (noiseOf), if there is one
 * Returns { hit, offset (s, + = late; null when no pluck was needed), pluck }.
 */
export function judge(x, sr, at, ev, chart, taken = [], { prev = -Infinity, next = Infinity, noise = null } = {}) {
  const parts = ev.notes || [ev];
  const tech = ev.tech || parts[0].tech || [];
  const chord = parts.length > 1;
  const needsPluck = !tech.some(t => TECH_PITCH_ONLY.includes(t));
  const needsPitch = !chord && !tech.some(t => TECH_PLUCK_ONLY.includes(t));
  // A pluck belongs to whichever note it is nearest, so a fast run's
  // windows stop halfway to the neighbouring notes.
  const early = Math.min(EARLY, (at - prev) / 2), late = Math.min(LATE, (next - at) / 2);

  let pluck = null;
  const heard = onsets(x, sr, { noise });
  if (needsPluck) {
    const free = o => !taken.some(t => Math.abs(t - o) < 0.02);
    const cands = heard.filter(o => o >= at - early && o <= at + late && free(o));
    // No click heard, the same note again: the string starting over out of step with itself
    // is a pluck too soft to click.
    if (!cands.length && needsPitch) {
      const again = rePluck(x, sr, at - early, at + late, noteFreq(parts[0], chart));
      if (again !== null && free(again)) cands.push(again);
    }
    // No click heard: a soft fingerstyle pluck can make none. For a single note, its pitch
    // starting right then is proof enough (as for a hammer-on, below); otherwise a miss.
    if (!cands.length && !needsPitch) return { hit: false, offset: null, pluck: null, why: 'no pluck' };
    // A pluck heard just before the window, nearer this note than the last: plucked too early,
    // and the pitch it started mustn't pass for a soft pluck on time.
    if (!cands.length && heard.some(o => o < at - early && o > Math.max((prev + at) / 2, at - early - 0.15) && free(o))) return { hit: false, offset: null, pluck: null, why: 'too early' };
    if (cands.length) pluck = cands.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a));
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
  // After a pluck, the strings ringing under the note are filtered out (above). Not
  // without one: searching the whole window, a quieter filtered tail of the last
  // note could pass for this one.
  const xp = pluck !== null ? highpass(x, sr, freq * 2 ** (-BELOW / 12)) : x;
  const starts = pluck !== null ? [pluck + 0.015] : [];
  let last = null, unclear = false;
  // A plucked note with no pluck heard, its pitch there anyway, is the benefit of the doubt:
  // a re-pluck of a note still ringing can be too soft to tell from it ringing on.
  if (pluck === null && !needsPluck) {
    // A hammer-on or pull-off is a change of pitch: if the expected pitch was
    // already ringing just before the note (an earlier note at that pitch),
    // finding it now proves nothing.
    // Only since the previous note began: before that, the pitch may well have
    // been ringing (a 7-5-7 hammer-on). Too little room to tell: no verdict.
    const end = at - 0.045, start = Math.max(end - 3.5 / freq - lagRoom, prev + 0.015);
    const i = Math.round(start * sr), j = Math.round(end * sr);
    if (i >= 0 && j <= x.length && end - start >= 1.5 / freq + lagRoom && pitchPresent(x.subarray(i, j), sr, freq).match) return { hit: false, offset: null, pluck: null, why: 'already sounding' };
  }
  // A plucked note with no pluck heard: the pitch at the end of its window, when whatever was
  // played has taken over from what rang before it. In a fast run, though, the end of the window
  // runs into the next note's pluck (one can come 0.1 s early, too soft to be heard and stopped
  // short of): unless the end clearly says right or wrong, the latest look that's over before then.
  // Legato notes: anywhere in the window.
  if (pluck === null && needsPluck) {
    const over = s => s + Math.min(room(s), 3.5 / freq) + lagRoom <= next - 0.1;
    let end = null, before = null;
    for (let s = at + late; s >= at; s -= 0.02) if (room(s) >= 1.5 / freq) { if (end === null) end = s; if (over(s)) { before = s; break; } }
    let s0 = end;
    if (end !== null && before !== null && before !== end) {
      const i = Math.max(0, Math.round(end * sr)), need = Math.ceil((room(end) + lagRoom) * sr) + 4;
      const v = i + need <= x.length ? pitchCheck(xp.subarray(i, i + need), sr, freq).verdict : null;
      if (v !== 'right' && v !== 'wrong') s0 = before;
    }
    if (s0 !== null) starts.push(s0);
  } else if (pluck === null) for (let s = at - early; s <= at + late; s += 0.02) starts.push(s);
  for (const s of starts) {
    const look = room(s);
    if (look < 1.5 / freq) continue;
    const i = Math.max(0, Math.round(s * sr)), need = Math.ceil((look + lagRoom) * sr) + 4;
    if (i + need > x.length) continue;
    const seg = x.subarray(i, i + need);
    // Down in the cable's noise nothing is sounding, whatever its hum repeats at.
    if (noise && meanSquare(seg) < noise.energy * QUIET) continue;
    const p = pitchCheck(xp.subarray(i, i + need), sr, freq);
    last = p;
    if (p.verdict === 'right') return { hit: true, offset: pluck === null ? null : pluck - at, pluck };
    if (p.verdict === 'unclear') unclear = true;
  }
  // Plucked on time, and nothing clearly says it was another note: the benefit of the doubt.
  if (pluck !== null && unclear && last && last.verdict !== 'wrong') return { hit: true, offset: pluck - at, pluck, unsure: true };
  return { hit: false, offset: pluck === null ? null : pluck - at, pluck, why: needsPluck && pluck === null ? 'no pluck' : 'wrong pitch', pitch: last };
}

/**
 * Follows a song as it plays, judging each note once its window has passed.
 *   chart, notes   the chart and the notes being played (the player's, at its difficulty)
 *   sectionOf(t)   index of the section a time falls in
 *   noise          the cable's noise, from the soundcheck (noiseOf), or null
 */
export class Scorer {
  constructor(chart, notes, sectionOf, noise = null) {
    this.chart = chart;
    this.noise = noise;
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
      const from = ev.t - (EARLY + 0.2) * rate; // room before the window, to hear a pluck that came too early
      const seg = input(from, close);
      if (seg === 'later') break; // the input for it is still on its way: next frame
      this.next++;
      if (!seg) continue; // no input for that stretch (paused, unplugged): not judged
      const real = t => (t - seg.t0) / rate; // song time -> seconds into seg.x
      const taken = this.taken.filter(t => t > from).map(real);
      const prev = this.next >= 2 ? real(this.notes[this.next - 2].t) : -Infinity;
      const nextT = this.next < this.notes.length ? real(this.notes[this.next].t) : Infinity;
      const r = judge(seg.x, seg.sr, real(ev.t), ev, this.chart, taken, { prev, next: nextT, noise: this.noise });
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
