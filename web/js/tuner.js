// The tuner: a sheet over whatever screen you are on, listening to the
// instrument input. It knows the tuning the song wants, including the cent
// offset some Rocksmith songs carry (recordings that weren't at A440), works
// out which string you are playing, and ticks each one off once it holds in
// tune.
import { tunerPitch, levelDb, midiToFreq, freqToMidi, noteName, centsBetween } from './pitch.js';

const STANDARD = { 4: [28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64] };
const STRING_COLORS = ['#e8413c', '#f2c623', '#2e8ff0', '#f5892a', '#3fc75e', '#b351e8'];
const IN_TUNE = 3;        // cents either way that count as in tune
const HOLD = 0.5;         // seconds a string has to stay in tune to be ticked off
const READINGS = 5;       // the shown pitch is the median of this many readings
const EVERY = 80;         // ms between readings

/** The open-string targets for a tuning: semitone offsets per string, plus the song's cent offset. */
export function tuningTargets(tuning, strings, centOffset = 0) {
  return STANDARD[strings].map((m, s) => {
    const midi = m + (tuning[s] || 0);
    return { s, midi, name: noteName(midi), freq: midiToFreq(midi) * 2 ** (centOffset / 1200) };
  });
}

/** A key that changes whenever the tuning does, cent offset included. */
export const tuningKey = (tuning, strings, centOffset = 0) => `${strings}:${tuning.slice(0, strings).join(',')}:${Math.round(centOffset)}`;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Open the tuner. Resolves { allTuned } when it is closed.
 *   input      an open InstrumentInput
 *   targets    from tuningTargets
 *   label      what the tuning is called ("Drop D · D A D G")
 *   centOffset the song's offset, to say so
 *   hear       { volume, set(v) } for the "Hear your bass" switch
 *   onInput    called by "Change input" (the tuner closes first)
 */
export function openTuner({ input, targets, label, centOffset = 0, hear, onInput }) {
  return new Promise(resolve => {
    const back = document.activeElement;
    const el = document.createElement('div');
    el.className = 'gk-sheet tuner-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Tuner');
    const lo = Math.min(...targets.map(t => t.freq)), hi = Math.max(...targets.map(t => t.freq));
    const range = { minFreq: lo / 1.5, maxFreq: hi * 1.6 };
    const offsetNote = Math.round(centOffset)
      ? ` <span class="tn-off">${centOffset > 0 ? '+' : ''}${Math.round(centOffset)} cents, as the song was recorded</span>` : '';
    const ticks = [-50, -25, 0, 25, 50].map(c => `<i style="left:${50 + c}%"></i><b style="left:${50 + c}%">${c > 0 ? '+' : ''}${c}</b>`).join('');
    el.innerHTML = `<div class="gk-box tuner">
      <div class="gk-head"><h2>Tuner</h2><button data-x aria-label="Close">&times;</button></div>
      <div class="gk-body">
        <p class="tn-tuning">${esc(label)}${offsetNote}</p>
        <div class="tn-strings">${targets.map(t => `<div class="tn-str" data-s="${t.s}" style="--c:${STRING_COLORS[t.s]}"><span>${esc(t.name.replace(/-?\d+$/, ''))}</span><small>${t.freq.toFixed(1)} Hz</small><em aria-hidden="true">&#10003;</em></div>`).join('')}</div>
        <div class="tn-read"><span class="tn-name">&ndash;</span><span class="tn-hz"></span></div>
        <div class="tn-meter" aria-hidden="true"><div class="tn-zone"></div>${ticks}<div class="tn-needle"></div></div>
        <p class="tn-hint" aria-live="polite">Play an open string.</p>
        <div class="tn-input"><span class="tn-label"></span><div class="tn-level"><i></i></div></div>
        <div class="gk-row">
          <button class="primary" data-done><kbd>Enter</kbd>Done</button>
          <button data-input>Change input</button>
          ${hear ? `<button data-hear aria-pressed="${hear.volume > 0}">Hear your bass</button>` : ''}
        </div>
      </div></div>`;
    const $ = sel => el.querySelector(sel);
    $('.tn-label').textContent = `Input: ${input.label}`;

    const recent = [];
    const tuned = new Set();
    let heldSince = null, heldString = null, lastPitch = 0, lastSound = performance.now(), lastRead = 0, raf = 0, done = false;

    function show(reading) {
      const name = $('.tn-name'), hz = $('.tn-hz'), needle = $('.tn-needle'), hint = $('.tn-hint');
      el.querySelectorAll('.tn-str').forEach(n => n.classList.remove('on'));
      if (!reading) {
        name.textContent = '–'; hz.textContent = ''; needle.style.opacity = 0; el.classList.remove('good');
        return;
      }
      const { freq, target, cents } = reading;
      name.textContent = target ? target.name.replace(/-?\d+$/, '') : noteName(freqToMidi(freq)).replace(/-?\d+$/, '');
      hz.textContent = `${freq.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents`;
      needle.style.opacity = 1;
      needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      const good = Math.abs(cents) <= IN_TUNE;
      el.classList.toggle('good', good);
      if (target) el.querySelector(`.tn-str[data-s="${target.s}"]`).classList.add('on');
      hint.textContent = good ? 'In tune' : cents < 0 ? 'Tune up ↑' : 'Tune down ↓';
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (now - lastRead < EVERY) return;
      lastRead = now;
      const buf = input.read();
      if (!buf) return;
      const db = levelDb(buf);
      $('.tn-level i').style.width = `${Math.max(0, Math.min(100, (db + 70) * (100 / 64)))}%`;
      if (db > -70) lastSound = now;
      const r = db > -55 ? tunerPitch(buf, input.sampleRate, range) : null;
      if (!r || r.clarity < 0.75) {
        if (now - lastPitch > 600) { recent.length = 0; heldSince = null; show(null); }
        if (now - lastSound > 4000) $('.tn-hint').textContent = `No sound from ${input.label}. Is the bass plugged in, with its volume up?`;
        else if (now - lastPitch > 600) $('.tn-hint').textContent = tuned.size === targets.length ? 'All strings in tune.' : 'Play an open string.';
        return;
      }
      lastPitch = now;
      // A new string (or a big jump) starts the median afresh.
      if (recent.length && Math.abs(centsBetween(r.freq, recent[recent.length - 1])) > 50) recent.length = 0;
      recent.push(r.freq);
      if (recent.length > READINGS) recent.shift();
      const freq = [...recent].sort((a, b) => a - b)[recent.length >> 1];
      const target = targets.reduce((best, t) => (Math.abs(centsBetween(freq, t.freq)) < Math.abs(centsBetween(freq, best.freq)) ? t : best));
      const near = Math.abs(centsBetween(freq, target.freq)) < 300 ? target : null;
      // Off every string by more than a minor third: show the plain note instead.
      const cents = near ? centsBetween(freq, near.freq) : (freqToMidi(freq) - Math.round(freqToMidi(freq))) * 100;
      show({ freq, target: near, cents });
      if (near && Math.abs(cents) <= IN_TUNE && recent.length >= 3) {
        if (heldString !== near.s) { heldString = near.s; heldSince = now; }
        if (now - heldSince >= HOLD * 1000 && !tuned.has(near.s)) {
          tuned.add(near.s);
          el.querySelector(`.tn-str[data-s="${near.s}"]`).classList.add('done');
          if (tuned.size === targets.length) $('[data-done]').focus();
        }
      } else heldString = null;
    }

    const close = (why = 'done') => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (back && back.isConnected) back.focus({ preventScroll: true });
      resolve({ allTuned: tuned.size === targets.length, why });
    };
    const onKey = e => {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.target.closest('button'))) { e.preventDefault(); e.stopPropagation(); close(); return; }
      e.stopPropagation(); // nothing reaches the screen behind (Space must not start the song)
    };
    el.addEventListener('click', e => {
      if (e.target === el) return close();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-x') || b.hasAttribute('data-done')) return close();
      if (b.hasAttribute('data-input')) { close('input'); if (onInput) onInput(); return; }
      if (b.hasAttribute('data-hear')) {
        hear.set(hear.volume > 0 ? 0 : (hear.last || 0.6));
        b.setAttribute('aria-pressed', String(hear.volume > 0));
      }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    input.resume();
    $('[data-done]').focus();
    raf = requestAnimationFrame(tick);
  });
}
