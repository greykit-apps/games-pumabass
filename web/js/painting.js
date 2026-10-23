// The title's backdrop: a pixel-art painting of the puma on stage from behind, bass slung, facing
// a crowd of animals and their lights (web/art/, made by tools/make-stage-art.py). Drawn at its own
// size into a canvas the page scales up square-pixelled, and played to the theme (title-sound.js):
// the stage lights pulse on its beat, the crowd bobs to it row by row, the lights in the stands
// twinkle, the phones held up glint and the lighters flicker, and haze drifts along the front of the
// stage behind the puma; the puma bobs on the beat, nods with it, and swings its tail. With the
// theme not playing (not yet, or no sound), it keeps the theme's time by itself. Still under
// reduced motion, and held while a sheet is up.
//
// After a song (the end screen's, `after`), the same arena once the last note has rung: the house
// dark but for the glow left over the stage, the rig's lights holding still, the puma standing,
// its tail swaying slow, and the crowd applauding, their paws catching the light as they clap and
// a row jostling now and then: all of them for a song played through (`cheer`), a scatter for one
// that wasn't.

import { themeBeats, themeBeat } from './title-sound.js';

const ART = name => new URL(`../art/${name}`, import.meta.url).href;
const PULSE = 0.18;                      // seconds a beat's light takes to die away
const BOB = 0.16;                        // seconds a row of the crowd stays up on its beat
const DIP = 0.14;                        // seconds the puma's body stays down on its beat
const NOD = [0.03, 0.22];                // when in the beat its head is down a pixel more (it follows the body)
const SWAY = 8, SWING = 5, FLICK = 4;    // the tail: beats to swing once there and back, pixels at its tip, and its flick on the bar
const CLAP = [4.5, 7];                   // claps a second, after a song: the slowest and quickest pair of paws

function load(name) {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = ART(name); });
}

// A steady pseudo-random number in [0, 1) for a pair of numbers.
function rnd(a, b) { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); }

export function mountPainting(el, { after = false, cheer = true } = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const cv = el.appendChild(document.createElement('canvas'));
  cv.className = 'painting';
  const names = ['stage.png', 'stage-crowd.png', 'stage-front.png', 'stage-puma.png', 'stage-puma-body.png', 'stage-puma-head.png', 'stage-haze.png'];
  Promise.all([...names.map(load), ...['stage-crowd.json', 'stage-puma.json'].map(n => fetch(ART(n)).then(r => r.json()))])
    .then(([stage, crowd, front, legs, body, head, haze, meta, pose]) =>
      play(cv, { stage, crowd, front, legs, body, head, haze, meta, pose }, still, { after, cheer }));
}

function play(cv, art, still, { after, cheer }) {
  const { stage, crowd, front, legs, body, head, haze, meta, pose } = art;
  const W = stage.width, H = stage.height, ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  ctx.imageSmoothingEnabled = false;
  const px = (() => { const c = layer(); c.getContext('2d').drawImage(stage, 0, 0); return c.getContext('2d').getImageData(0, 0, W, H).data; })();
  const pm = (() => { const c = layer(), g = c.getContext('2d'); for (const p of [legs, body, head]) g.drawImage(p, 0, 0); return g.getImageData(0, 0, W, H).data; })();
  function layer() { return Object.assign(document.createElement('canvas'), { width: W, height: H }); }
  const isPuma = (x, y) => pm[(y * W + x) * 4 + 3] > 0;
  const lum = i => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const top = Math.min(...meta.rows.map(r => r.y));             // where the crowd's heads begin

  // The lights: the bright of the rig and the air above the crowd, as a layer to add on the beat.
  const lights = layer();
  const lc = lights.getContext('2d'), ld = lc.createImageData(W, H);
  for (let y = 0; y < top; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, l = lum(i);
    if (l < 110 || isPuma(x, y)) continue;
    const k = Math.min(1, (l - 110) / 120) * (1 - y / top);
    ld.data[i] = px[i] * k; ld.data[i + 1] = px[i + 1] * k; ld.data[i + 2] = px[i + 2] * k; ld.data[i + 3] = 255;
  }
  lc.putImageData(ld, 0, 0);

  // The stands' lights: each point of light (brighter than what's round it, not the dither in a
  // beam), with a pace and a moment of its own.
  const dots = [];
  const ring = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]];
  for (let y = Math.round(H * 0.26); y < top + 4; y++) for (let x = 2; x < W - 2; x++) {
    const i = (y * W + x) * 4, l = lum(i);
    if (l < 175 || isPuma(x, y)) continue;
    if (lum(i - 4) > l || lum(i + 4) >= l || lum(i - W * 4) > l || lum(i + W * 4) >= l) continue;
    if (l - ring.reduce((s, [dx, dy]) => s + lum(i + (dy * W + dx) * 4), 0) / ring.length < 50) continue;
    const dim = `rgb(${px[i] * 0.45 | 0},${px[i + 1] * 0.4 | 0},${px[i + 2] * 0.5 | 0})`;
    dots.push({ x, y, dim, rate: 0.6 + rnd(x, y) * 1.6, at: rnd(y, x) * 6.283 });
  }

  // After a song: the house's dark, the stage keeping a glow, drawn over everything by multiplying.
  const dark = layer(), dg = dark.getContext('2d');
  const glow = dg.createRadialGradient(W * 0.6, H * 0.42, 10, W * 0.6, H * 0.42, W * 0.62);
  glow.addColorStop(0, cheer ? '#a69cbc' : '#8a82a2');
  glow.addColorStop(1, cheer ? '#3a3050' : '#2a2340');
  dg.fillStyle = glow;
  dg.fillRect(0, 0, W, H);
  // and who's clapping, each at their own pace, in bursts; all of them after a song played through
  // (their paws lighter than their rims: the house's dark is drawn over them)
  const lighter = hex => '#' + [1, 3, 5].map(k => Math.round(parseInt(hex.slice(k, k + 2), 16) * 0.4 + 255 * 0.6).toString(16).padStart(2, '0')).join('');
  const clappers = (meta.animals || []).map((a, i) => ({ ...a, f: CLAP[0] + rnd(i, 1) * (CLAP[1] - CLAP[0]), at: rnd(i, 2) * 6.283,
    burst: rnd(i, 3) * 6.283, keen: rnd(i, 4) < (cheer ? 0.75 : 0.3), lift: Math.round((rnd(i, 5) - 0.3) * a.r * 0.8), paw: lighter(a.rim) }))
    .filter(a => a.keen && a.x > -2 && a.x < W + 2);

  function draw(t) {
    if (after) return drawAfter(t);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(stage, 0, 0);
    // The stands' lights: now and then one dips, and the brightest catch a glint.
    for (const d of dots) {
      const k = Math.sin(d.at + t * d.rate);
      if (k < -0.55) { ctx.fillStyle = d.dim; ctx.fillRect(d.x, d.y, 1, 1); }
      else if (k > 0.93) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = (k - 0.93) / 0.07 * 0.8;
        ctx.fillRect(d.x - 1, d.y, 3, 1); ctx.fillRect(d.x, d.y - 1, 1, 3);
        ctx.globalAlpha = 1;
      }
    }
    // The rig's lights pulse on every beat (the bar's first hardest), and breathe slowly between.
    const beat = themeBeat(), heard = themeBeats(), at = heard === null ? t / beat : heard;
    const n = Math.floor(at), into = (at - n) * beat;
    const pulse = (n % 4 === 0 ? 1 : 0.6) * Math.exp(-into / PULSE);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08 + 0.06 * Math.sin(t * 0.7) + 0.3 * pulse;
    ctx.drawImage(lights, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // The crowd, back row first: every other row bobs up a pixel on the beat, the rest on the off-beat.
    const up = [into < BOB && n % 2 === 0, into < BOB && n % 2 === 1];
    meta.rows.forEach((r, i) => ctx.drawImage(crowd, 0, r.sy, W, r.h, 0, r.y - (up[i % 2] ? 1 : 0), W, r.h));
    // Phones held up glint now and then; lighters flicker.
    meta.lights.forEach((l, i) => {
      const y = l.y - (up[l.row % 2] ? 1 : 0);
      if (l.kind === 'lighter') {
        ctx.fillStyle = rnd(i, Math.floor(t * 12)) < 0.5 ? '#ffd27a' : '#ff9a3c';
        ctx.fillRect(l.x, y, 1, 1);
      } else {
        const k = Math.sin(rnd(i, 3) * 6.283 + t * (0.8 + rnd(i, 4)));
        if (k > 0.9) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = (k - 0.9) / 0.1;
          ctx.fillRect(l.x - 1, y, 3, 1); ctx.fillRect(l.x, y - 1, 1, 3);
          ctx.globalAlpha = 1;
        }
      }
    });
    ctx.drawImage(front, 0, 0);
    // Haze drifting along the front of the stage, two banks at their own speeds.
    for (const [speed, alpha, lift] of [[2.2, 0.7, 0], [-1.3, 0.45, 10]]) {
      const x = Math.round(((t * speed) % W + W) % W);
      ctx.globalAlpha = alpha;
      ctx.drawImage(haze, x - W, H - haze.height - lift);
      ctx.drawImage(haze, x, H - haze.height - lift);
    }
    ctx.globalAlpha = 1;
    drawPuma(at, n, into);
  }

  function drawAfter(t) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(stage, 0, 0);
    for (const d of dots) {                                        // the stands' lights, slower now
      if (Math.sin(d.at + t * d.rate * 0.5) < -0.55) { ctx.fillStyle = d.dim; ctx.fillRect(d.x, d.y, 1, 1); }
    }
    // The crowd, a row now and then up on its toes.
    const jostle = i => (rnd(i, Math.floor(t * 3 + i * 0.37)) > (cheer ? 0.78 : 0.9) ? 1 : 0);
    meta.rows.forEach((r, i) => ctx.drawImage(crowd, 0, r.sy, W, r.h, 0, r.y - jostle(i), W, r.h));
    meta.lights.forEach((l, i) => {
      if (l.kind !== 'lighter') return;
      ctx.fillStyle = rnd(i, Math.floor(t * 8)) < 0.5 ? '#ffd27a' : '#ff9a3c';
      ctx.fillRect(l.x, l.y - jostle(l.row), 1, 1);
    });
    // The applause: each pair of paws catching what light there is, meeting and parting (behind
    // the stage's front and the puma, which are drawn over them).
    for (const a of clappers) {
      if (!cheer && Math.sin(a.burst + t * 0.6) < -0.2) continue;   // a scatter: clapping in bursts
      const c = (1 + Math.sin(a.at + t * a.f * 2 * Math.PI)) / 2, big = a.r >= 6 ? 2 : 1;
      const gap = Math.round(c * (a.r * 0.45 + 1)), x = Math.round(a.x), y = Math.round(a.y + a.r * 0.9) - a.lift - jostle(a.row);
      ctx.fillStyle = a.paw;
      if (gap < 1) ctx.fillRect(x - big, y, big * 2, big);
      else { ctx.fillRect(x - gap - big, y, big, big); ctx.fillRect(x + gap, y, big, big); }
    }
    ctx.drawImage(front, 0, 0);
    for (const [speed, alpha, lift] of [[1.4, 0.75, 0], [-0.8, 0.5, 10]]) {
      const x = Math.round(((t * speed) % W + W) % W);
      ctx.globalAlpha = alpha;
      ctx.drawImage(haze, x - W, H - haze.height - lift);
      ctx.drawImage(haze, x, H - haze.height - lift);
    }
    ctx.globalAlpha = 1;
    drawPuma(t / 2, 0, 1, true);
    ctx.globalCompositeOperation = 'multiply';                     // the house's dark
    ctx.drawImage(dark, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // The puma: its legs stand; its tail, nearest us, swings lazily, flicking on the bar; its body
  // dips a pixel on the beat, and its head follows it down a pixel further, a moment late.
  const tailAt = new Uint8Array(W * H), touched = [];
  // (After a song, it stands still, its tail swaying slow and small.)
  function drawPuma(at, n, into, calm = false) {
    ctx.drawImage(legs, 0, 0);
    const pts = pose.tail, last = pts.length - 1, sway = Math.sin(at / SWAY * 2 * Math.PI) * (calm ? 0.5 : 1);
    const bar = at % 4, flick = calm ? 0 : Math.exp(-bar / 0.35) * Math.sin(bar * 9);
    const moved = pts.map(([x, y], i) => {
      const w = Math.pow(i / last, 1.6), dx = (sway * SWING + flick * FLICK) * w;
      return [x + dx, y - Math.abs(dx) * 0.3 * w];
    });
    for (const i of touched) tailAt[i] = 0;
    touched.length = 0;
    const disc = (x, y, r) => {
      for (let py = Math.floor(y - r); py <= y + r; py++) for (let px = Math.floor(x - r); px <= x + r; px++) {
        if (px < 0 || py < 0 || px >= W || py >= H || (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 > r * r) continue;
        const j = py * W + px;
        if (!tailAt[j]) { tailAt[j] = 1; touched.push(j); }
      }
    };
    for (let i = 0; i < last; i++) {                              // Catmull-Rom through the points
      const p0 = moved[Math.max(i - 1, 0)], p1 = moved[i], p2 = moved[i + 1], p3 = moved[Math.min(i + 2, last)];
      for (let u = 0; u < 1; u += 0.12) {
        const u2 = u * u, u3 = u2 * u;
        const c = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
        disc(c(0), c(1), pose.width[i] + (pose.width[i + 1] - pose.width[i]) * u);
      }
    }
    disc(moved[last][0], moved[last][1], pose.width[last]);       // its end, round
    ctx.fillStyle = pose.colour;
    for (const j of touched) ctx.fillRect(j % W, (j / W) | 0, 1, 1);
    const dip = !calm && into < DIP ? 1 : 0, nod = !calm && into > NOD[0] && into < NOD[1] ? 1 : 0;
    ctx.drawImage(body, 0, dip);
    ctx.drawImage(head, 0, dip + nod);
  }


  // Held while a sheet is up over it (one it isn't itself the backdrop of).
  const covered = () => [...document.querySelectorAll('.gk-sheet')].some(s => !s.contains(cv));
  let t = 0, last = performance.now();
  function frame(now) {
    if (!cv.isConnected) return;                       // its screen has gone
    if (still.matches) { draw(0); return; }            // reduced motion turned on
    const dt = Math.max(0, Math.min(now - last, 100)) / 1000;
    last = now;
    if (!covered()) { t += dt; draw(t); }
    requestAnimationFrame(frame);
  }
  draw(0);
  if (!still.matches) requestAnimationFrame(frame);
}
