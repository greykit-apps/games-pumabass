// Rocksmith-style 3D note highway drawn with Canvas 2D.
// World units: X = frets (fret wire k sits at x = k), Y = height above the floor,
// Z = distance into the screen (proportional to time until the note).

import { pitchOf, keyOf, noteName, isDownbeat } from './chart.js';

export const STRING_COLORS = ['#e8413c', '#f2c623', '#2e8ff0', '#f5892a', '#3fc75e', '#b351e8'];
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const MAX_FRET = 24;

// Camera planning, in frets and seconds.
const MIN_VIEW = 9;     // never show fewer frets than this
const MARGIN = 2;       // frets of room either side of the notes in view
const COMFORT = 7;      // hand positions whose notes fit in this many frets share one view: no move at all
const MAX_SPAN = 14;    // the widest a view may get to save a move
const MIN_HOLD = 3;     // a view held for less than this is worth merging into a neighbour
const GLIDE_GAP = 3;    // with at least this long between positions, glide straight across
const LEAD = 0.6;       // a widening edge is in place this long before the first new note
const MOVE_MIN = 2;     // an edge takes this long to move a short way...
const MOVE_MAX = 3.5;   // ...and this long to move a long way
const moveTime = frets => Math.min(MOVE_MAX, Math.max(MOVE_MIN, 1.4 + 0.18 * Math.abs(frets)));
// A single note comes in standing on end and turns as it nears, lying flat along its
// string the moment it reaches it, as in Rocksmith: a second way to see when. Seconds:
const TURN_S = 1;
// Notes come into being past the far end of the floor, fully transparent, and fade
// in as they approach: no popping into view. As fractions of the lookahead's depth:
const SPAWN = 1.12;  // where a note (or beat line) first exists
const SOLID = 0.8;   // where it is fully drawn
// Notes are glass (half filled, edged in their colour) until a hit fills them in. A
// note reaching its string lands with a pulse and fades: a little splash. With
// scoring live it waits there for its verdict: a hit fills in bright as it goes,
// a miss is crossed out and drops off the board.
const SPLASH = 0.3;  // s (song time), the pulse and fade with no verdict to wait for
const WAIT = 0.5;    // s (song time), the most a scored note waits on its string for its verdict
const HIT_MS = 380;  // a hit, filling in bright as it fades
const MISS_MS = 600; // a miss, crossed out and falling away
const LINGER = 1.4;  // s (song time) a note stays in the running after it lands
const easeOut = k => 1 - (1 - k) * (1 - k);

export class Highway {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chart = null;
    this.notes = [];
    this.anchors = [];
    this.lookahead = 3.0;   // seconds of notes visible
    this.invert = true;     // true = low string on top, as in Rocksmith
    this.labels = 'fret';   // on the notes: 'fret' numbers, note 'name's, or 'off'; technique marks with either
    this.camX = 5;
    this.camWidth = MIN_VIEW;
    this.camPath = null;
    this.verdicts = new Map(); // scoring's verdicts, shown as the notes land: note event -> { hit, wall }
    this.judging = false;   // scoring is live: notes wait on their string for a verdict
    // A loop being played: { from, to }. Play goes back to `from` on reaching
    // `to`, so past `to` the highway shows the loop's start coming round
    // again, and the camera glides there, and the jump back is seamless.
    this.loop = null;
  }

  /** Shifts (s) at which the loop's start shows again within the lookahead of now: one per time round. */
  loopShifts(now) {
    const L = this.loop, out = [];
    if (!L || L.to - L.from < 0.5) return out;
    const period = L.to - L.from;
    for (let k = 1; L.to + (k - 1) * period < now + this.lookahead * SPAWN && k < 20; k++) out.push(k * period);
    return out;
  }

  /** Where the song will really be at time t, going round the loop. */
  looped(t) {
    const L = this.loop;
    if (!L || t < L.to || L.to - L.from < 0.5) return t;
    return L.from + ((t - L.to) % (L.to - L.from));
  }

  /** Scoring's verdict on a note, shown as it lands. */
  mark(ev, hit) {
    const wall = performance.now();
    this.verdicts.set(ev, { hit, wall });
    if (this.verdicts.size > 200) for (const [e, v] of this.verdicts) if (wall - v.wall > 3000) this.verdicts.delete(e);
  }
  /** After a jump (a loop coming round, say): the notes from t on are unplayed again. */
  forget(t) {
    for (const ev of this.verdicts.keys()) if (ev.t >= t) this.verdicts.delete(ev);
  }

  setChart(chart, playable) {
    this.verdicts.clear();
    this.chart = chart;
    this.notes = playable.notes;
    this.anchors = playable.anchors;
    this.camPath = planCamera(this.notes, this.anchors);
    this.flats = keyOf(chart, this.notes).flats; // how note names are spelt
  }

  // The camera window (centre and visible width, in frets) at song time t,
  // read off the planned path so it is the same however you got to t.
  camAt(t) {
    const path = this.camPath;
    if (!path) return { c: 4.5, w: MIN_VIEW };
    const l = edgeAt(path.L, path.l0, t), r = edgeAt(path.R, path.r0, t);
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
    // On the couch the page is zoomed (style.css): draw at the zoomed size, not blurred up.
    const dpr = (window.devicePixelRatio || 1) * (this.canvas.currentCSSZoom || 1);
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
    const anchor = this.anchorAt(this.looped(now + 0.35));
    let cam = this.camAt(now);
    // Coming up to the end of a loop: glide, as unhurried as the camera's
    // other moves, to where it will be at the loop's start, so the jump back
    // doesn't jolt.
    if (this.loop && this.loop.to - this.loop.from >= 0.5) {
      const glide = Math.min(MOVE_MAX - 1, (this.loop.to - this.loop.from) / 2);
      const into = now - (this.loop.to - glide);
      if (into > 0) {
        const k = Math.min(1, into / glide), e = k * k * (3 - 2 * k);
        const next = this.camAt(now - (this.loop.to - this.loop.from));
        cam = { c: cam.c + (next.c - cam.c) * e, w: cam.w + (next.w - cam.w) * e };
      }
    }
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
    this.zSolid = zMax * SOLID; this.zSpawn = zMax * SPAWN;
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
  // How solid a thing at depth z is drawn: 0 where it spawns, 1 from zSolid in, eased.
  farAlpha(z) {
    const k = Math.min(1, Math.max(0, (this.zSpawn - z) / (this.zSpawn - this.zSolid)));
    return k * k * (3 - 2 * k);
  }

  drawFloor(now, zMax, current) {
    // Base floor.
    this.quad([[0, 0, 0], [MAX_FRET, 0, 0], [MAX_FRET, 0, zMax], [0, 0, zMax]], '#151922');
    // Hand-position lanes: highlight the frets you should be covering.
    const lane = (a, at, lo, hi) => {
      const t0 = Math.max(a.t, lo), t1 = Math.min(a.end, hi);
      if (t1 < at || t0 > at + this.lookahead || t1 <= t0) return;
      const z0 = Math.max(0, this.zOf(t0, at)), z1 = Math.min(zMax, this.zOf(t1, at));
      const x0 = a.fret - 1, x1 = a.fret - 1 + a.width;
      this.quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], a === current ? 'rgba(80,120,200,0.22)' : 'rgba(80,120,200,0.12)');
    };
    const L = this.loop;
    for (const a of this.anchors) lane(a, now, -Infinity, L ? L.to : Infinity);
    for (const shift of this.loopShifts(now)) for (const a of this.anchors) lane(a, now - shift, L.from, L.to);
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
    const L = this.loop;
    this.beatsAt(now, -Infinity, L ? L.to : Infinity);
    for (const shift of this.loopShifts(now)) this.beatsAt(now - shift, L.from, L.to);
  }

  beatsAt(now, lo, hi) {
    const beats = this.chart.beats;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b.t < now - 0.05 || b.t < lo) continue;
      if (b.t > now + this.lookahead * SPAWN || b.t >= hi) break;
      const z = this.zOf(b.t, now), a = this.farAlpha(z);
      if (a <= 0) continue;
      const measure = isDownbeat(beats, i); // a bar line, stronger than a beat's
      const x0 = this.camX - this.camWidth * 2, x1 = this.camX + this.camWidth * 2;
      this.line([x0, 0, z], [x1, 0, z], `rgba(255,255,255,${(measure ? 0.32 : 0.12) * a})`, measure ? 2 : 1);
    }
  }

  drawBoard(now, anchor) {
    const { ctx } = this;
    const nStr = this.chart.strings;
    const yTop = this.stringY(this.invert ? 0 : nStr - 1) + 0.3;
    this.boardTop = this.P(0, yTop, 0)[1]; // the board's top edge on screen, for what sits over it
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
      ctx.font = `${inAnchor ? 'bold ' : ''}${Math.round(this.labelPx)}px Saira, system-ui, sans-serif`;
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
    const L = this.loop;
    // The loop coming round again, beyond its end: furthest first.
    const shifts = this.loopShifts(now);
    for (let k = shifts.length - 1; k >= 0; k--) {
      const at = now - shifts[k], round = [];
      for (const n of notes) {
        if (n.t < L.from) continue;
        if (n.t >= L.to || n.t > at + this.lookahead * SPAWN) break;
        if (n.t + (n.sus || 0) >= at - 0.25) round.push(n);
      }
      for (let i = round.length - 1; i >= 0; i--) this.drawEvent(round[i], at, zMax);
    }
    const visible = [];
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > now + this.lookahead * SPAWN || (L && n.t >= L.to)) break;
      const end = n.t + (n.sus || 0);
      if (end < now - LINGER) continue;
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
    if (n.t < now) { this.drawLanding(n, parts, now - n.t, anchor); return; }
    const z = zNote;
    const alpha = this.farAlpha(z); // fading in from the far end
    if (alpha <= 0) return;

    // Every note's tail first, so none is drawn over a note: notes played together
    // (an open string under a fretted one, say) stack on one mark and land as one.
    for (const p of parts) this.drawTail(p, z, alpha, anchor);
    if (n.notes && parts.length > 1) this.drawChordFrame(parts, z, alpha, anchor, n);
    for (const p of parts) this.drawGem(p, z, alpha, anchor, n.tech ? n.tech : p.tech, parts.length === 1);
  }

  // A note on its string (dt s after it arrived): the splash, or with scoring
  // live, the wait for its verdict and then the hit or the miss. Gems only: a
  // landed note has no tail or chord frame.
  drawLanding(n, parts, dt, anchor) {
    const v = this.verdicts.get(n);
    const pulse = 1 + 0.15 * easeOut(Math.min(1, dt / 0.08)); // the bump as it lands
    let fx;
    if (v) {
      const k = (performance.now() - v.wall) / (v.hit ? HIT_MS : MISS_MS);
      if (k >= 1) return;
      fx = v.hit ? { scale: pulse + 0.45 * easeOut(k), alpha: (1 - k) ** 1.3, bright: 1 - k / 2, ring: 1.3 + 1.7 * easeOut(k) }
        : { scale: pulse, alpha: 1 - k * k, drop: k * k, cross: true, glass: true };
    } else if (this.judging && dt < WAIT) fx = { scale: pulse, alpha: 1, glass: true };
    else {
      const k = (dt - (this.judging ? WAIT : 0)) / SPLASH;
      if (k >= 1) return;
      fx = { scale: pulse + 0.3 * easeOut(k), alpha: (1 - k) ** 1.5, ring: 1.1 + 1.2 * easeOut(k), glass: true };
    }
    for (const p of parts) this.drawGem(p, 0, fx.alpha, anchor, n.tech ? n.tech : p.tech, parts.length === 1, fx);
  }

  noteX(fret, anchor) {
    if (fret === 0) return anchor.fret - 1 + anchor.width / 2;
    return fret - 0.5;
  }

  // A sustain: a ribbon along its string, soft at the edges, fading along its
  // length and thinning to a rounded end, so it trails off rather than stops square.
  drawSustain(p, t, sus, now, zMax, anchor) {
    const z0 = Math.max(0, this.zOf(t, now));
    const z1 = Math.min(this.zSpawn, this.zOf(t + sus, now));
    if (z1 <= z0 || z0 >= this.zSpawn) return;
    const y = this.stringY(p.s);
    const startX = this.noteX(p.f, anchor);
    const endX = p.slideTo !== undefined ? this.noteX(p.slideTo, anchor) : startX;
    const fracAt = z => Math.min(1, Math.max(0, (z / this.zScale + now - t) / sus)); // 0 at the note, 1 at the end
    const xAt = z => startX + (endX - startX) * fracAt(z);
    const half = p.f === 0 ? anchor.width / 2 - 0.1 : 0.22;
    // The last TAPER s thin to a quarter, rounding off (only the real end: one cut
    // short by the far end of the highway runs on at full width).
    const taper = Math.min(0.15, sus * 0.3);
    // Its near end rounds off a little too, where it meets the strings.
    const head = Math.min(0.06, (z1 - z0) / this.zScale / 3);
    const widthAt = z => {
      const left = (1 - fracAt(z)) * sus, fromNear = (z - z0) / this.zScale;
      const tail = left >= taper ? 1 : 0.25 + 0.75 * Math.sin((Math.PI / 2) * (left / taper));
      const near = fromNear >= head ? 1 : 0.55 + 0.45 * Math.sin((Math.PI / 2) * (fromNear / head));
      return Math.min(tail, near);
    };
    // Points along it: evenly, and closer together where the ends round off.
    const zs = [];
    for (let i = 0; i <= 16; i++) zs.push(z0 + ((z1 - z0) * i) / 16);
    const zEnd = this.zOf(t + sus, now);
    for (let i = 1; i < 6; i++) zs.push(z0 + (head * this.zScale * i) / 6, zEnd - (taper * this.zScale * i) / 6);
    const { ctx } = this;
    ctx.beginPath();
    const left = [], right = [];
    for (const z of zs.filter(z => z >= z0 && z <= z1).sort((m, n) => m - n)) {
      const x = xAt(z), hw = half * widthAt(z);
      left.push(this.P(x - hw, y, z));
      right.push(this.P(x + hw, y, z));
    }
    left.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    const color = STRING_COLORS[p.s];
    // Fading along its length, and in from the far end as the notes do there.
    const a = this.P(xAt(z0), y, z0), b = this.P(xAt(z1), y, z1);
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    for (let i = 0; i <= 6; i++) {
      const z = z0 + ((z1 - z0) * i) / 6;
      g.addColorStop(i / 6, hexA(color, (0.5 - 0.3 * fracAt(z)) * this.farAlpha(z)));
    }
    ctx.fillStyle = g;
    ctx.shadowColor = hexA(color, 0.6); // soft edges
    ctx.shadowBlur = Math.max(4, a[2] * 0.08);
    ctx.fill();
    ctx.shadowBlur = 0;
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
      ctx.font = `bold ${Math.round(a[2] * 0.35)}px Saira, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(name, (a[0] + b[0]) / 2, a[1] - 3);
    }
  }

  // A note's tail: up from a mark on the floor at its time, so a note on the beat
  // floats over its beat line, as in Rocksmith. An open string's mark spans its bar.
  drawTail(p, z, alpha, anchor) {
    const { ctx } = this;
    const color = STRING_COLORS[p.s];
    const x = this.noteX(p.f, anchor);
    const half = p.f === 0 ? anchor.width / 2 - 0.05 : 0.42;
    const [cx, cy, s] = this.P(x, this.stringY(p.s), z);
    const floor = this.P(x, 0, z), a = this.P(x - half, 0, z), b = this.P(x + half, 0, z);
    ctx.strokeStyle = hexA(color, 0.6 * alpha);
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = hexA(color, 0.75 * alpha);
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath(); ctx.moveTo(floor[0], floor[1]); ctx.lineTo(cx, cy); ctx.stroke();
  }

  // fx: how a landed note is drawn (drawLanding): its scale, a fill of bright
  // (a hit), glass (not filled in), a drop and a cross (a miss), a splash ring.
  drawGem(p, z, alpha, anchor, tech = [], single = true, fx = null) {
    const { ctx } = this;
    const y = this.stringY(p.s);
    const color = STRING_COLORS[p.s];
    const open = p.f === 0;
    const x = this.noteX(p.f, anchor);
    const halfW = open ? anchor.width / 2 - 0.05 : 0.38;
    const halfH = open ? this.stringGap * 0.3 : this.stringGap * 0.47;
    const [cx, cy0, s] = this.P(x, y, z);
    const scale = fx ? fx.scale : 1, drop = fx && fx.drop ? fx.drop : 0;
    const cy = cy0 + drop * s * 2.2; // a miss falls away below its string
    const w = halfW * 2 * s * scale, h = halfH * 2 * s * scale;
    const glass = fx ? !!fx.glass : true; // notes are glass until a hit fills them in
    // Upright (a quarter turn) TURN_S out, flat on arrival. Open notes are bars across
    // the hand's frets, and a chord's notes arrive in its frame: neither turns.
    const turn = single && !open ? (Math.PI / 2) * Math.min(1, z / this.zScale / TURN_S) : 0;

    ctx.globalAlpha = alpha;
    const muted = tech.includes('mute');
    const harmonic = tech.includes('harmonic') || tech.includes('pinch');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-turn + drop * 0.5); // a miss tips as it falls
    ctx.fillStyle = muted ? '#777' : glass ? hexA(color, 0.42) : color;
    if (fx && fx.ring) { ctx.shadowColor = color; ctx.shadowBlur = fx.bright ? 30 + 30 * fx.bright : 18; } // the splash glows
    if (harmonic && !open) {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.9); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h * 0.9); ctx.lineTo(-w / 2, 0);
      ctx.closePath(); ctx.fill();
    } else {
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, s * 0.08));
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (fx && fx.bright) { ctx.fillStyle = `rgba(255,255,255,${0.55 * fx.bright})`; ctx.fill(); } // a hit, filled in white-hot
    const border = Math.max(1, s * (tech.includes('accent') ? 0.07 : 0.035));
    ctx.lineWidth = border;
    // its own colour, darker, for a crisp edge (a glass note's edge is the colour itself);
    // a white edge is kept for special notes
    ctx.strokeStyle = glass ? color : shade(color, 0.55);
    ctx.stroke();
    if (muted) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(-h * 0.35, -h * 0.35); ctx.lineTo(h * 0.35, h * 0.35);
      ctx.moveTo(h * 0.35, -h * 0.35); ctx.lineTo(-h * 0.35, h * 0.35);
      ctx.stroke();
    }
    if (fx && fx.cross) { // a miss: a red cross through it
      const k = h * 0.75;
      ctx.strokeStyle = '#ff5266';
      ctx.lineWidth = Math.max(2.5, s * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();
    if (fx && fx.ring) { // the splash: a ring in the string's colour, spreading as it fades
      const rw = halfW * 2 * s * fx.ring, rh = halfH * 2 * s * fx.ring;
      ctx.strokeStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(1.5, s * 0.05 * alpha);
      roundRect(ctx, cx - rw / 2, cy - rh / 2, rw, rh, Math.min(rh / 2, s * 0.1));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Fret number on the gem, sized to sit inside it: its ink, not its line
    // box, is fitted to the gem's height and width and centred on the gem.
    // (The border is stroked on the edge, so half of it is inside.) It stays
    // upright while the gem turns, shrinking to what fits at any angle.
    if (!muted && this.labels !== 'off' && !(fx && fx.cross)) {
      const k = Math.sin(turn), inner = h - border - Math.max(2, h * 0.14);
      const text = this.labels === 'name' ? noteName(pitchOf(this.chart, p.s, p.f), this.flats) : String(p.f);
      drawFitted(ctx, text, cx, cy, (open ? h * 1.6 : w * 0.8) * (1 - k) + h * 0.7 * k, inner * (1 - k) + h * 0.7 * k, glass ? '#fff' : '#111');
    }

    // Technique labels above the gem.
    const label = this.labels !== 'off' && techLabel(p, tech);
    if (label && s > 12 && !fx) {
      ctx.font = `bold ${Math.round(s * 0.24)}px Saira, system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cx, cy - (h / 2) * Math.cos(turn) - (w / 2) * Math.sin(turn) - 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Text that fits a box of maxW x maxH, centred on (cx, cy) by its actual ink.
function drawFitted(ctx, text, cx, cy, maxW, maxH, ink = '#111') {
  if (maxH < 6) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic'; // the ink measurements below are from the baseline
  let px = Math.floor(maxH * 1.35);
  ctx.font = `bold ${px}px Saira, system-ui, sans-serif`;
  let m = ctx.measureText(text);
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const scale = Math.min(maxH / inkH, maxW / m.width);
  px = Math.floor(px * scale);
  if (px < 7) return;
  ctx.font = `bold ${px}px Saira, system-ui, sans-serif`;
  m = ctx.measureText(text);
  ctx.fillStyle = ink;
  // Fade in as it grows legible, rather than appear at a size.
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * Math.min(1, (px - 6) / 5);
  ctx.fillText(text, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.globalAlpha = was;
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

// A colour darkened to k of its brightness.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round((n >> 16) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
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
 * 3. Between shots, each edge of the view moves once, slowly (MOVE_MIN to
 *    MOVE_MAX seconds). The edge that widens the view moves early, so the new
 *    spot is on screen before its notes arrive; the edge that narrows it waits
 *    until the old spot is finished. A long gap gets one glide instead.
 * Returns { l0, r0, L, R }: each edge's starting fret and its moves. */
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
    const c = Math.max((lo + hi) / 2, w / 2 - 0.6);
    return { l: c - w / 2, r: c + w / 2 };
  };

  // Each edge of the window moves on its own track of { t0, t1, from, to } moves.
  const first = view(shots[0].lo, shots[0].hi);
  const path = { l0: first.l, r0: first.r, L: [], R: [] };
  const at = { l: first.l, r: first.r }; // where each edge ends up after its last move
  // A move starts from wherever the edge is at t0, taking over from any move
  // still under way, so a widening edge is never late waiting its turn.
  const move = (edge, t0, dur, to) => {
    const track = edge === 'l' ? path.L : path.R;
    while (track.length && track[track.length - 1].t0 >= t0) track.pop();
    track.push({ t0, t1: t0 + dur, from: edgeAt(track, path[edge + '0'], t0), to });
    at[edge] = to;
    return t0 + dur;
  };

  for (let i = 1; i < shots.length; i++) {
    const A = shots[i - 1], B = shots[i];
    const b = view(B.lo, B.hi);
    const tA = A.last, tB = Math.max(B.first, tA);
    const dl = b.l - at.l, dr = b.r - at.r;
    if (!dl && !dr) continue;
    const dur = moveTime(Math.max(Math.abs(dl), Math.abs(dr)));
    const start = tA + 0.1;
    if (tB - tA >= GLIDE_GAP && Math.sign(dl) === Math.sign(dr) && start + dur <= tB - LEAD + 1e-9) {
      // Time to spare between the two: one glide across, both edges together.
      const t0 = Math.max(start, tB - LEAD - dur - 0.5);
      move('l', t0, dur, b.l);
      move('r', t0, dur, b.r);
      continue;
    }
    // Otherwise each edge moves once. An edge that has to widen the view goes
    // early, so the new spot is in view as its notes come in; an edge that
    // narrows it waits until the old spot's last note is played, and until the
    // widening is done, so the view never shrinks past either spot.
    let widened = -Infinity;
    if (dl < 0) widened = Math.max(widened, move('l', tB - LEAD - moveTime(dl), moveTime(dl), b.l));
    if (dr > 0) widened = Math.max(widened, move('r', tB - LEAD - moveTime(dr), moveTime(dr), b.r));
    if (dl > 0) move('l', Math.max(tA + 0.1, widened), moveTime(dl), b.l);
    if (dr < 0) move('r', Math.max(tA + 0.1, widened), moveTime(dr), b.r);
  }
  // A narrowing that the next move would reverse before it finished is just
  // wobble: drop it, and let the edge wait where it was. (Narrowing is never
  // what keeps a note on screen, so this is always safe.)
  for (const [track, start] of [[path.L, path.l0], [path.R, path.r0]]) {
    const inward = (m, edgeSign) => Math.sign(m.to - m.from) === edgeSign;
    const sign = track === path.L ? 1 : -1; // inward is up for the left edge, down for the right
    for (let i = 1; i < track.length; i++) {
      const prev = track[i - 1], m = track[i];
      if (m.t0 < prev.t1 && inward(prev, sign) && !inward(m, sign)) {
        track.splice(i - 1, 1);
        i = Math.max(0, i - 2);
      }
    }
    // Every move starts from where the edge really is by then.
    for (let i = 0; i < track.length; i++) track[i].from = edgeAt(track.slice(0, i), start, track[i].t0);
  }
  return path;
}

// An edge's position at time t: the latest move begun by then decides it.
function edgeAt(track, start, t) {
  let lo = 0, hi = track.length - 1, m = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (track[mid].t0 <= t) { m = track[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!m) return start;
  if (t >= m.t1) return m.to;
  return lerp(m.from, m.to, ease((t - m.t0) / (m.t1 - m.t0)));
}

export { planCamera }; // for checking camera paths from Node
