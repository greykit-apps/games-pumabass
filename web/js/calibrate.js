// Timing calibration: how far apart the sound and the picture reach you.
//
// Two short tests, the way rhythm games do it:
//   Listen - clicks, nothing to watch: tap with what you hear.
//   Watch  - silence, notes falling onto a line: tap as they land.
// Each measures how late your taps are against the beat. Both include your
// own reaction and the input's delay; only the first includes the sound's
// delay (speakers, a TV, Bluetooth), only the second the picture's. So
// Listen minus Watch is how much later the sound arrives than the picture:
// the offset the highway needs (positive = notes arrive later).
//
// The clicks play through a media element into the mixer, the same path as
// a song, so what is measured is what a song does.

const BEAT = 0.5;        // seconds between beats (120 BPM)
const LEAD = 1.0;        // silence before the first beat
const BEATS = 20;        // beats in each test (10 s)
const WARMUP = 3;        // beats to find the groove before taps count
const SR = 48000;
const STRING_COLORS = ['#e8413c', '#f2c623', '#2e8ff0', '#f5892a'];

/** A WAV (as a blob URL) of clicks on the beat, or of silence of the same length. */
function track(clicks) {
  const n = Math.ceil((LEAD + BEATS * BEAT + 0.6) * SR);
  const data = new Int16Array(n);
  if (clicks) {
    for (let b = 0; b < BEATS; b++) {
      const start = Math.round((LEAD + b * BEAT) * SR), f = b % 4 === 0 ? 1500 : 1000;
      for (let i = 0; i < 0.03 * SR; i++) data[start + i] = Math.round(0.7 * 32767 * Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (0.006 * SR)));
    }
  }
  const head = new DataView(new ArrayBuffer(44));
  const str = (o, s) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); head.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, SR, true); head.setUint32(28, SR * 2, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
  str(36, 'data'); head.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([head, data], { type: 'audio/wav' }));
}

let player = null; // one media element for every calibration: an element can join the mixer only once

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/** Each tap's distance (s) from its nearest beat, after the warm-up; strays dropped. */
export function tapErrors(taps) {
  const out = [];
  for (const t of taps) {
    const b = Math.round((t - LEAD) / BEAT);
    if (b < WARMUP || b >= BEATS) continue;
    const e = t - (LEAD + b * BEAT);
    if (Math.abs(e) < BEAT * 0.4) out.push(e);
  }
  return out;
}

/** The middle of the taps and how much they wander (both ms), or null with too few. */
export function summarise(errors) {
  if (errors.length < 6) return null;
  const mid = median(errors);
  return { ms: mid * 1000, spread: median(errors.map(e => Math.abs(e - mid))) * 1000, taps: errors.length };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => `${ms >= 0 ? '+' : '−'}${Math.abs(Math.round(ms))} ms`;

/**
 * Run the calibration in a sheet. Resolves the offset in ms to use, or null.
 *   mixer   the app's mixer (the clicks go through it, like a song)
 *   input   the instrument input, if open: strums count as taps
 *   current the offset in use now, to show
 */
export function calibrate({ mixer, input, current = 0 }) {
  return new Promise(resolve => {
    const back = document.activeElement;
    const el = document.createElement('div');
    el.className = 'gk-sheet calib-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Timing calibration');
    if (!player) { player = new Audio(); player.preload = 'auto'; }
    const media = player;
    mixer.attachSong(media);
    const urls = { clicks: track(true), silence: track(false) };
    const results = {};
    let phase = 'intro', taps = [], raf = 0, clock = { raw: 0, stamp: 0 }, lastStrum = 0, closed = false;
    const strumsOn = !!(input && input.open);

    const frame = body => `<div class="gk-box calib"><div class="gk-head"><h2>Timing</h2><button data-x aria-label="Close">&times;</button></div><div class="gk-body">${body}</div></div>`;
    const how = `Tap with any key, a click or a tap on the screen${strumsOn ? ', or a strum on the cable' : ''}. Use the same way both times.`;

    function draw() {
      if (phase === 'intro') {
        el.innerHTML = frame(`<p>Two short tests, ten seconds each, to line the notes up with the sound on this computer, its speakers and its screen.</p>
          <ol><li><b>Listen:</b> clicks play. Tap along with what you <b>hear</b>; no need to look.</li>
          <li><b>Watch:</b> no sound. Notes fall onto a line: tap as each one <b>lands</b>.</li></ol>
          <p class="gk-note">${how} Now: ${fmt(current)}.</p>
          <div class="gk-row"><button class="primary" data-start><kbd>Enter</kbd>Start</button><button data-x>Cancel</button></div>`);
      } else if (phase === 'listen' || phase === 'watch') {
        el.innerHTML = frame(`<p class="calib-step">${phase === 'listen' ? '1 of 2 &middot; <b>Listen</b>: tap with the clicks' : '2 of 2 &middot; <b>Watch</b>: tap as the notes land'}</p>
          <canvas class="calib-canvas" aria-hidden="true"></canvas>
          <p class="calib-count" aria-live="polite">Get ready&hellip;</p>
          <div class="gk-row"><button data-x>Cancel</button></div>`);
      } else if (phase === 'result') {
        const { listen, watch } = results;
        if (!listen || !watch) {
          el.innerHTML = frame(`<p>Not enough taps to measure${!listen ? ' in Listen' : ' in Watch'}. Tap on every beat, after the first few.</p>
            <div class="gk-row"><button class="primary" data-start><kbd>Enter</kbd>Try again</button><button data-x>Cancel</button></div>`);
        } else {
          const offset = listen.ms - watch.ms, shaky = Math.max(listen.spread, watch.spread) > 35;
          el.innerHTML = frame(`<p class="calib-result">${fmt(offset)}</p>
            <p>${Math.abs(offset) < 10 ? 'Sound and picture reach you together.' : offset > 0 ? `The sound reaches you ${Math.round(offset)} ms after the picture, so the notes will land that much later.` : `The picture reaches you ${Math.round(-offset)} ms after the sound, so the notes will land that much earlier.`}</p>
            <table class="calib-table"><tr><td>Listen</td><td>${fmt(listen.ms)}</td><td>taps within &plusmn;${Math.round(listen.spread)} ms</td></tr>
            <tr><td>Watch</td><td>${fmt(watch.ms)}</td><td>taps within &plusmn;${Math.round(watch.spread)} ms</td></tr></table>
            ${shaky ? '<p class="gk-note warn">Your taps wandered quite a bit, so this is a rough reading. Another go may give a steadier one.</p>' : ''}
            <p class="gk-note">Now: ${fmt(current)}. This applies to every song; a song's own offset adds to it.</p>
            <div class="gk-row"><button class="primary" data-use><kbd>Enter</kbd>Use ${fmt(offset)}</button><button data-start>Try again</button><button data-x>Cancel</button></div>`);
          el.dataset.offset = String(Math.round(offset));
        }
      }
      (el.querySelector('.primary') || el.querySelector('[data-x]')).focus({ preventScroll: true });
    }

    // The media clock, smoothed as the player does: currentTime moves in steps.
    function mediaTimeAt(ts) {
      const t = media.currentTime;
      if (t !== clock.raw) { clock.raw = t; clock.stamp = performance.now(); }
      return clock.raw + Math.min(0.25, Math.max(0, (ts - clock.stamp) / 1000));
    }
    const tap = ts => { if (phase === 'listen' || phase === 'watch') { if (!media.paused) taps.push(mediaTimeAt(ts)); paint(true); } };

    async function run(which) {
      phase = which;
      taps = [];
      draw();
      media.src = which === 'listen' ? urls.clicks : urls.silence;
      mixer.resume();
      await new Promise(r => { media.oncanplay = r; media.load(); });
      clock = { raw: 0, stamp: performance.now() };
      await media.play();
      await new Promise(r => { media.onended = r; });
      return summarise(tapErrors(taps));
    }

    let flash = 0;
    function paint(tapped) {
      if (tapped) flash = performance.now();
      const cv = el.querySelector('.calib-canvas');
      if (!cv) return;
      const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = mediaTimeAt(performance.now()), line = h - 34;
      const lit = performance.now() - flash < 120;
      ctx.fillStyle = lit ? '#dbe4fb' : '#47609c';
      ctx.fillRect(16, line, w - 32, lit ? 4 : 2);
      if (phase === 'watch') {
        // notes fall from the top to the line over 1.2 s, landing on each beat
        for (let b = 0; b < BEATS; b++) {
          const due = LEAD + b * BEAT, ahead = due - t;
          if (ahead < -0.12 || ahead > 1.2) continue;
          const y = line - (ahead / 1.2) * (line - 10), gw = 64, gh = 22;
          ctx.globalAlpha = ahead < 0 ? Math.max(0, 1 + ahead / 0.12) : 1;
          ctx.fillStyle = STRING_COLORS[b % 4];
          ctx.fillRect(w / 2 - gw / 2, y - gh, gw, gh);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = '#7d8aa8';
        ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('listen, and tap with the clicks', w / 2, line / 2);
      }
      const n = tapErrors(taps).length;
      const beat = Math.floor((t - LEAD) / BEAT);
      el.querySelector('.calib-count').textContent = media.paused || beat < 0 ? 'Get ready…' : beat < WARMUP ? `Find the beat… ${WARMUP - beat}` : `${n} ${n === 1 ? 'tap' : 'taps'}`;
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      paint(false);
      // A strum on the cable is a tap: a jump in level, timed within the input's buffer.
      if (strumsOn && input.open && (phase === 'listen' || phase === 'watch')) {
        const buf = input.read(), sr = input.sampleRate, hop = Math.round(0.005 * sr);
        if (buf) {
          const win = Math.round(0.08 * sr);
          for (let i = buf.length - win; i < buf.length - hop; i += hop) {
            let a = 0, b = 0;
            for (let k = 0; k < hop; k++) { a += buf[i - hop + k] ** 2; b += buf[i + k] ** 2; }
            const ts = performance.now() - ((buf.length - i) / sr) * 1000;
            if (b / hop > 1e-4 && b > 6 * (a + 1e-9) && ts - lastStrum > 150) { lastStrum = ts; tap(ts); break; }
          }
        }
      }
    }

    async function start() {
      results.listen = await run('listen');
      if (closed) return;
      results.watch = await run('watch');
      if (closed) return;
      phase = 'result';
      draw();
    }

    const close = v => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      media.pause();
      media.removeAttribute('src');
      Object.values(urls).forEach(URL.revokeObjectURL);
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (back && back.isConnected) back.focus({ preventScroll: true });
      resolve(v);
    };
    const onKey = e => {
      e.stopPropagation(); // nothing reaches the screen behind
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if (phase === 'listen' || phase === 'watch') { if (!e.repeat) { e.preventDefault(); tap(e.timeStamp); } return; }
      if (e.key === 'Enter' && !e.target.closest('button')) {
        e.preventDefault();
        if (phase === 'result' && el.dataset.offset !== undefined && results.listen && results.watch) close(Number(el.dataset.offset));
        else if (phase === 'intro' || phase === 'result') { phase = 'starting'; start(); }
      }
    };
    el.addEventListener('pointerdown', e => {
      if ((phase === 'listen' || phase === 'watch') && !e.target.closest('button')) { e.preventDefault(); tap(e.timeStamp); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (e.target === el && phase !== 'listen' && phase !== 'watch') return close(null);
      if (!b) return;
      if (b.hasAttribute('data-x')) return close(null);
      if (b.hasAttribute('data-start')) { phase = 'starting'; start(); }
      if (b.hasAttribute('data-use')) close(Number(el.dataset.offset));
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    draw();
    raf = requestAnimationFrame(loop);
    window.pumabassDebug && (window.pumabassDebug.calibration = { media, get phase() { return phase; } });
  });
}

export const CALIBRATION = { BEAT, LEAD, BEATS, WARMUP };
