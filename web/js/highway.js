// Rocksmith-style 3D note highway drawn with Canvas 2D.
// World units: X = frets (fret wire k sits at x = k), Y = height above the floor,
// Z = distance into the screen (proportional to time until the note).

export const STRING_COLORS = ['#e8413c', '#f2c623', '#2e8ff0', '#f5892a', '#3fc75e', '#b351e8'];
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const MAX_FRET = 24;

// Camera planning, in frets and seconds.
const MIN_VIEW = 9;     // never show fewer frets than this
const MARGIN = 2;       // frets of room either side of the notes in view
const COMFORT = 7;      // hand positions whose notes fit in this many frets share one view: no move at all
const MAX_SPAN = 14;    // the widest a view may get to save a move
const MIN_HOLD = 3;     // a view held for less than this is worth merging into a neighbour
const GLIDE_GAP = 1.6;  // with at least this long between positions, glide straight across
const ZOOM_OUT = 0.9;   // seconds to pull back before a quick jump
const ZOOM_IN = 0.9;    // seconds to settle in after it

export class Highway {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chart = null;
    this.notes = [];
    this.anchors = [];
    this.lookahead = 3.0;   // seconds of notes visible
    this.invert = false;    // true = low string on top
    this.camX = 5;
    this.camWidth = MIN_VIEW;
    this.camPath = [];
  }

  setChart(chart, playable) {
    this.chart = chart;
    this.notes = playable.notes;
    this.anchors = playable.anchors;
    this.camPath = planCamera(this.notes, this.anchors);
  }

  // The camera window (centre and visible width, in frets) at song time t,
  // read off the planned path so it is the same however you got to t.
  camAt(t) {
    const keys = this.camPath;
    if (!keys.length) return { c: 4.5, w: MIN_VIEW };
    if (t <= keys[0].t) return keys[0];
    let i = 1;
    while (i < keys.length && keys[i].t <= t) i++;
    if (i === keys.length) return keys[keys.length - 1];
    const a = keys[i - 1], b = keys[i];
    const u = ease((t - a.t) / (b.t - a.t));
    // Interpolate the edges, not centre and width: a window that contains a
    // range at both ends then contains it all the way between.
    const l = lerp(a.c - a.w / 2, b.c - b.w / 2, u), r = lerp(a.c + a.w / 2, b.c + b.w / 2, u);
    return { c: (l + r) / 2, w: r - l };
  }

  anchorAt(t) {
    const list = this.anchors;
    let lo = 0, hi = list.length - 1, found = list[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= t) { found = list[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return found || { fret: 1, width: 4 };
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
  }

  stringY(s) {
    const n = this.chart.strings;
    const idx = this.invert ? n - 1 - s : s;
    return 0.35 + idx * this.stringGap;
  }

  draw(now) {
    this.resize();
    const { ctx, W, H } = this;
    const chart = this.chart;
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);
    if (!chart) return;

    // The camera follows the path planned for the whole song (planCamera).
    const anchor = this.anchorAt(now + 0.35);
    const cam = this.camAt(now);
    this.camX = cam.c;
    this.camWidth = cam.w;

    // Camera setup. s0 = pixels per world unit on the "now" plane.
    const nStr = chart.strings;
    this.stringGap = nStr === 4 ? 0.34 : 0.24;
    const topY = this.stringY(this.invert ? 0 : nStr - 1);
    const D = 18;                                  // camera distance to the "now" plane (larger = flatter perspective)
    this.D = D;
    let s0 = (W * 0.92) / this.camWidth;           // the hand window fills the width
    this.labelPx = Math.min(30, Math.max(12, s0 * 0.26));
    const boardBottom = H - 96 - this.labelPx - 10; // leave room for fret numbers and the control bar
    this.zScale = 40 / this.lookahead;             // world units per second
    const zMax = this.lookahead * this.zScale;
    // Pick the camera height so the far end of the highway lands near the top of the screen
    // (shrink = how small the far end is drawn), but always high enough to look down onto the strings.
    const shrink = D / (zMax + D);
    const farY = H * 0.12;
    let H0 = (farY - shrink * boardBottom) / (1 - shrink);
    let camY = (boardBottom - H0) / s0;
    if (camY < topY + 1.2) { camY = topY + 1.2; H0 = boardBottom - camY * s0; }
    this.camY = camY;
    this.F = s0 * D;
    this.H0 = H0;

    this.drawFloor(now, zMax, anchor);
    this.drawBeats(now, zMax);
    this.drawBoard(now, anchor);
    this.drawNotes(now, zMax);
  }

  // Project a world point to the screen. Returns [x, y, scale].
  P(x, y, z) {
    const s = this.F / (z + this.D);
    return [this.W / 2 + (x - this.camX) * s, this.H0 + (this.camY - y) * s, s];
  }

  quad(pts, fill) {
    const { ctx } = this;
    ctx.beginPath();
    pts.forEach(([x, y, z], i) => { const p = this.P(x, y, z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  line(a, b, color, width) {
    const { ctx } = this;
    const p = this.P(...a), q = this.P(...b);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  zOf(t, now) { return (t - now) * this.zScale; }

  drawFloor(now, zMax, current) {
    // Base floor.
    this.quad([[0, 0, 0], [MAX_FRET, 0, 0], [MAX_FRET, 0, zMax], [0, 0, zMax]], '#151922');
    // Hand-position lanes: highlight the frets you should be covering.
    for (const a of this.anchors) {
      if (a.end < now || a.t > now + this.lookahead) continue;
      const z0 = Math.max(0, this.zOf(a.t, now)), z1 = Math.min(zMax, this.zOf(a.end, now));
      const x0 = a.fret - 1, x1 = a.fret - 1 + a.width;
      this.quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], a === current ? 'rgba(80,120,200,0.22)' : 'rgba(80,120,200,0.12)');
    }
    // Fret lines running into the distance.
    for (let f = 0; f <= MAX_FRET; f++) {
      this.line([f, 0, 0], [f, 0, zMax], f === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)', 1);
    }
    // Fade the far end.
    const g = this.ctx.createLinearGradient(0, this.P(0, 0, zMax)[1], 0, this.P(0, 0, zMax * 0.6)[1]);
    g.addColorStop(0, 'rgba(13,15,20,1)');
    g.addColorStop(1, 'rgba(13,15,20,0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.W, this.P(0, 0, zMax * 0.6)[1]);
  }

  drawBeats(now, zMax) {
    for (const b of this.chart.beats) {
      if (b.t < now - 0.05) continue;
      if (b.t > now + this.lookahead) break;
      const z = this.zOf(b.t, now);
      const measure = b.m !== null;
      const x0 = this.camX - this.camWidth * 2, x1 = this.camX + this.camWidth * 2;
      this.line([x0, 0, z], [x1, 0, z], measure ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)', measure ? 2 : 1);
    }
  }

  drawBoard(now, anchor) {
    const { ctx } = this;
    const nStr = this.chart.strings;
    const yTop = this.stringY(this.invert ? 0 : nStr - 1) + 0.3;
    // Board backing.
    this.quad([[0, 0, 0], [MAX_FRET, 0, 0], [MAX_FRET, yTop, 0], [0, yTop, 0]], 'rgba(30,24,20,0.55)');
    // Fret wires.
    for (let f = 0; f <= MAX_FRET; f++) {
      this.line([f, 0.1, 0], [f, yTop, 0], f === 0 ? '#ddd' : 'rgba(200,200,210,0.55)', f === 0 ? 4 : 2);
    }
    // Inlays.
    for (const f of INLAYS) {
      const [x, y, s] = this.P(f - 0.5, yTop / 2, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      const r = s * 0.13;
      if (f % 12 === 0) {
        ctx.beginPath(); ctx.arc(x, y - s * 0.4, r, 0, Math.PI * 2); ctx.arc(x, y + s * 0.4, r, 0, Math.PI * 2); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    // Strings (thicker = lower).
    for (let s = 0; s < nStr; s++) {
      const y = this.stringY(s);
      const ringing = this.ringing(now, s);
      this.line([0, y, 0], [MAX_FRET, y, 0], ringing ? '#fff' : STRING_COLORS[s], (nStr === 4 ? 5 : 4) - s * 0.5 + (ringing ? 2 : 0));
    }
    // Fret numbers, anchor frets highlighted.
    for (let f = 1; f <= MAX_FRET; f++) {
      const [x, y, s] = this.P(f - 0.5, 0, 0);
      const inAnchor = f >= anchor.fret && f < anchor.fret + anchor.width;
      ctx.font = `${inAnchor ? 'bold ' : ''}${Math.round(this.labelPx)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = inAnchor ? '#ffd76a' : 'rgba(255,255,255,0.45)';
      ctx.fillText(String(f), x, y + 6);
    }
  }

  ringing(now, s) {
    for (let i = this.firstVisible ?? 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > now) break;
      const end = n.t + Math.max(n.sus || 0, 0.12);
      if (end < now) continue;
      if (n.notes ? n.notes.some(c => c.s === s) : n.s === s) return true;
    }
    return false;
  }

  drawNotes(now, zMax) {
    const notes = this.notes;
    // Binary search for the first note that might still be visible (long sustains included).
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].t < now - 12) lo = mid + 1; else hi = mid; }
    this.firstVisible = lo;
    const visible = [];
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > now + this.lookahead) break;
      const end = n.t + (n.sus || 0);
      if (end < now - 0.25) continue;
      visible.push(n);
    }
    // Far to near so close notes paint on top.
    for (let i = visible.length - 1; i >= 0; i--) this.drawEvent(visible[i], now, zMax);
  }

  drawEvent(n, now, zMax) {
    const parts = n.notes ? n.notes : [n];
    const zNote = this.zOf(n.t, now);
    const anchor = this.anchorAt(n.t);
    // Sustain trails first.
    for (const p of parts) {
      const sus = n.sus || p.sus || 0;
      if (sus > 0) this.drawSustain(p, n.t, sus, now, zMax, anchor);
    }
    if (zNote < -0.5) return; // the gem has passed; only the sustain remains
    const passed = n.t < now;
    const alpha = passed ? Math.max(0, 1 - (now - n.t) / 0.2) : 1;
    if (alpha <= 0) return;
    const z = Math.max(0, zNote);

    if (n.notes && parts.length > 1) this.drawChordFrame(parts, z, alpha, anchor, n);
    for (const p of parts) this.drawGem(p, z, alpha, anchor, passed, n.tech ? n.tech : p.tech);
  }

  noteX(fret, anchor) {
    if (fret === 0) return anchor.fret - 1 + anchor.width / 2;
    return fret - 0.5;
  }

  drawSustain(p, t, sus, now, zMax, anchor) {
    const z0 = Math.max(0, this.zOf(t, now));
    const z1 = Math.min(zMax, this.zOf(t + sus, now));
    if (z1 <= z0) return;
    const y = this.stringY(p.s);
    const startX = this.noteX(p.f, anchor);
    const endX = p.slideTo !== undefined ? this.noteX(p.slideTo, anchor) : startX;
    const xAt = z => {
      const frac = Math.min(1, Math.max(0, (z / this.zScale + now - t) / sus));
      return startX + (endX - startX) * frac;
    };
    const steps = startX === endX ? 1 : 12;
    const half = p.f === 0 ? anchor.width / 2 - 0.1 : 0.22;
    const { ctx } = this;
    ctx.beginPath();
    const left = [], right = [];
    for (let i = 0; i <= steps; i++) {
      const z = z0 + ((z1 - z0) * i) / steps;
      const x = xAt(z);
      left.push(this.P(x - half, y, z));
      right.push(this.P(x + half, y, z));
    }
    left.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = hexA(STRING_COLORS[p.s], 0.45);
    ctx.fill();
  }

  drawChordFrame(parts, z, alpha, anchor, n) {
    const xs = parts.map(p => this.noteX(p.f, anchor));
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5;
    const ys = parts.map(p => this.stringY(p.s));
    const y0 = 0.05, y1 = Math.max(...ys) + 0.3;
    const { ctx } = this;
    const a = this.P(x0, y1, z), b = this.P(x1, y0, z);
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * alpha})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    const name = this.chart.chordTemplates[n.chord]?.name;
    if (name && a[2] > 14) {
      ctx.font = `bold ${Math.round(a[2] * 0.35)}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(name, (a[0] + b[0]) / 2, a[1] - 3);
    }
  }

  drawGem(p, z, alpha, anchor, passed, tech = []) {
    const { ctx } = this;
    const y = this.stringY(p.s);
    const color = STRING_COLORS[p.s];
    const open = p.f === 0;
    const x = this.noteX(p.f, anchor);
    const halfW = open ? anchor.width / 2 - 0.05 : 0.38;
    const halfH = open ? this.stringGap * 0.3 : this.stringGap * 0.47;
    const [cx, cy, s] = this.P(x, y, z);
    const w = halfW * 2 * s, h = halfH * 2 * s;

    // Drop line to the floor so you can judge depth and fret.
    const floor = this.P(x, 0, z);
    ctx.strokeStyle = hexA(color, 0.35 * alpha);
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath(); ctx.moveTo(cx, cy + h / 2); ctx.lineTo(floor[0], floor[1]); ctx.stroke();

    ctx.globalAlpha = alpha;
    const muted = tech.includes('mute');
    const harmonic = tech.includes('harmonic') || tech.includes('pinch');
    ctx.fillStyle = muted ? '#777' : color;
    if (passed) { ctx.shadowColor = color; ctx.shadowBlur = 25; }
    if (harmonic && !open) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.9); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h * 0.9); ctx.lineTo(cx - w / 2, cy);
      ctx.closePath(); ctx.fill();
    } else {
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(h / 2, s * 0.08));
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, s * (tech.includes('accent') ? 0.07 : 0.035));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    if (muted) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - h * 0.35, cy - h * 0.35); ctx.lineTo(cx + h * 0.35, cy + h * 0.35);
      ctx.moveTo(cx + h * 0.35, cy - h * 0.35); ctx.lineTo(cx - h * 0.35, cy + h * 0.35);
      ctx.stroke();
    }

    // Fret number on the gem, sized to sit inside it: its ink, not its line
    // box, is fitted to the gem's height and width and centred on the gem.
    // (The border is stroked on the edge, so half of it is inside.)
    if (!muted) drawFitted(ctx, String(p.f), cx, cy, (open ? h * 1.6 : w * 0.8), h - ctx.lineWidth - Math.max(2, h * 0.14));

    // Technique labels above the gem.
    const label = techLabel(p, tech);
    if (label && s > 12) {
      ctx.font = `bold ${Math.round(s * 0.24)}px system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cx, cy - h / 2 - 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Text that fits a box of maxW x maxH, centred on (cx, cy) by its actual ink.
function drawFitted(ctx, text, cx, cy, maxW, maxH) {
  if (maxH < 6) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic'; // the ink measurements below are from the baseline
  let px = Math.floor(maxH * 1.35);
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  let m = ctx.measureText(text);
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const scale = Math.min(maxH / inkH, maxW / m.width);
  px = Math.floor(px * scale);
  if (px < 7) return;
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  m = ctx.measureText(text);
  ctx.fillStyle = '#111';
  ctx.fillText(text, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

function techLabel(p, tech) {
  const out = [];
  if (tech.includes('hammer')) out.push('H');
  if (tech.includes('pull')) out.push('P');
  if (tech.includes('tap')) out.push('T');
  if (tech.includes('slap')) out.push('SLAP');
  if (tech.includes('pop')) out.push('POP');
  if (tech.includes('palm')) out.push('PM');
  if (tech.includes('vibrato')) out.push('~');
  if (tech.includes('tremolo')) out.push('TR');
  if (p.bend) out.push(`↑${p.bend >= 1 ? p.bend : '½'}`);
  if (p.slideTo !== undefined) out.push(p.slideTo > p.f ? '↗' + p.slideTo : '↘' + p.slideTo);
  return out.join(' ');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)); // smoothstep: eases in and out

/* The camera path for a whole song, planned once rather than chased frame by
 * frame, so long jumps can be seen coming.
 *
 * 1. Each hand position (anchor) that has notes becomes a span of frets those
 *    notes need, and the time from its first note to the end of its last.
 * 2. Neighbouring positions merge into one "shot" while their notes fit in
 *    COMFORT frets (no move at all). Then a shot held for less than MIN_HOLD
 *    merges into a neighbour, up to MAX_SPAN frets wide: staying zoomed out
 *    beats moving back and forth.
 * 3. Between shots, with time to spare the camera glides across the gap. On
 *    a quick jump it pulls back until both ends are in view, arriving there
 *    as the last note of the old position lands, then eases in on the new one.
 * Returns keyframes { t, c, w }: the window's centre and width in frets. */
function planCamera(notes, anchors) {
  const anchorIndex = t => {
    let lo = 0, hi = anchors.length - 1, found = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (anchors[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
  };
  const segs = anchors.map(a => ({ lo: a.fret - 1, hi: a.fret - 1 + a.width, first: Infinity, last: -Infinity }));
  for (const n of notes) {
    const seg = segs[anchorIndex(n.t)];
    if (!seg) continue;
    for (const p of n.notes || [n]) {
      for (const f of [p.f, p.slideTo]) if (f > 0) { seg.lo = Math.min(seg.lo, f - 1); seg.hi = Math.max(seg.hi, f); }
    }
    seg.first = Math.min(seg.first, n.t);
    seg.last = Math.max(seg.last, n.t + (n.sus || 0));
  }
  let shots = segs.filter(s => s.first !== Infinity).map(s => ({ ...s }));
  if (!shots.length) return [];

  const span = (a, b) => Math.max(a.hi, b.hi) - Math.min(a.lo, b.lo);
  const dur = s => s.last - s.first;
  const merge = (a, b) => ({ lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi), first: Math.min(a.first, b.first), last: Math.max(a.last, b.last) });

  // Rocksmith repeats an anchor every phrase, so first join neighbours that fit
  // in COMFORT frets into runs: a run's length is how long the hand really stays.
  const runs = [shots[0]];
  for (const s of shots.slice(1)) {
    const cur = runs[runs.length - 1];
    if (span(cur, s) <= COMFORT) runs[runs.length - 1] = merge(cur, s);
    else runs.push(s);
  }
  // Then fold any run held too briefly into whichever neighbour stays narrower.
  shots = runs;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < shots.length && shots.length > 1; i++) {
      if (dur(shots[i]) >= MIN_HOLD) continue;
      const opts = [i - 1, i + 1].filter(j => j >= 0 && j < shots.length && span(shots[i], shots[j]) <= MAX_SPAN);
      if (!opts.length) continue;
      const j = opts.reduce((a, b) => (span(shots[i], shots[a]) <= span(shots[i], shots[b]) ? a : b));
      const [a, b] = j < i ? [j, i] : [i, j];
      shots.splice(a, 2, merge(shots[a], shots[b]));
      changed = true;
      break;
    }
  }

  // The window that shows a span of frets, kept from sliding past the nut.
  const view = (lo, hi) => {
    const w = Math.max(hi - lo + 2 * MARGIN, MIN_VIEW);
    return { c: Math.max((lo + hi) / 2, w / 2 - 0.6), w };
  };
  const keys = [{ t: shots[0].first - 1, ...view(shots[0].lo, shots[0].hi) }];
  for (let i = 1; i < shots.length; i++) {
    const A = shots[i - 1], B = shots[i];
    const a = view(A.lo, A.hi), b = view(B.lo, B.hi);
    const prev = keys[keys.length - 1].t;
    const tA = Math.max(A.last, prev + 0.05), tB = Math.max(B.first, tA + 0.05);
    if (tB - tA >= GLIDE_GAP) {
      // Time to spare: hold, then glide across, settled a little before the first new note.
      const end = tB - 0.4, start = Math.max(tA + 0.05, end - 1.4);
      keys.push({ t: start, ...a }, { t: end, ...b });
    } else {
      // A quick jump: pull back to show both ends, then ease in.
      const both = view(Math.min(A.lo, B.lo), Math.max(A.hi, B.hi));
      const start = Math.max(prev + 0.01, tA - ZOOM_OUT);
      if (start < tA) keys.push({ t: start, ...a });
      keys.push({ t: tA, ...both }, { t: Math.max(tB + 0.2, tA + ZOOM_IN), ...b });
    }
  }
  return keys;
}
export { planCamera }; // for checking camera paths from Node
