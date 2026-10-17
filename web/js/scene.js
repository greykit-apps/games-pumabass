// The title and song-list backdrop: a stage in the Tactical tribe's line art.
// A note highway runs from the front of the stage to the back wall, with an
// amp stack either side and two lights from the truss. Paths only, no text.
// On the title it plays (mountScene's live): a groove rides the highway, and
// the cones pump on every beat. No sound; still under reduced motion.

const STRING_COLORS = ['#e8413c', '#f2c623', '#2e8ff0', '#f5892a'];

// The highway's floor: narrow at the back (y = 700), wide at the front (y = 900).
const BACK = { y: 700, l: 742, r: 858 };
const FRONT = { y: 900, l: 420, r: 1180 };
const lerp = (a, b, t) => a + (b - a) * t;
// A point on the highway floor: u across (0 left .. 1 right), v from back (0) to front (1).
function floor(u, v) {
  const y = lerp(BACK.y, FRONT.y, v);
  return [lerp(lerp(BACK.l, BACK.r, u), lerp(FRONT.l, FRONT.r, u), v), y];
}

// An amp stack standing on the stage floor (y = 700): a 2x2 cabinet with a
// clear gap between the cones, and the head on top, its power light past the
// knobs. Both stacks are the same model, side by side, not mirrored.
const CONE = 44, PITCH = 100;           // cone radius, centre-to-centre spacing (gap = PITCH - 2 * CONE)
const CAB_W = 280, CAB_H = 210, CAB_Y = 700 - CAB_H, HEAD_H = 56, HEAD_Y = CAB_Y - 4 - HEAD_H;
function amp(x) {
  const headMid = HEAD_Y + HEAD_H / 2;
  const knobs = [0, 1, 2, 3, 4, 5].map(i => `<circle class="sd" cx="${x + 40 + i * 30}" cy="${headMid}" r="6"/>`).join('');
  const cx0 = x + (CAB_W - PITCH) / 2, cy0 = CAB_Y + (CAB_H - PITCH) / 2;
  const speakers = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => {
    const cx = cx0 + i * PITCH, cy = cy0 + j * PITCH;
    return `<g class="scone"><circle class="sd" cx="${cx}" cy="${cy}" r="${CONE}"/><circle class="sd scap" cx="${cx}" cy="${cy}" r="12"/></g>`;
  }).join('');
  return `<g class="samp"><rect class="sf" x="${x}" y="${HEAD_Y}" width="${CAB_W}" height="${HEAD_H}" rx="4"/>${knobs}<circle class="sled" cx="${x + 254}" cy="${headMid}" r="4"/>` +
    `<rect class="sf" x="${x}" y="${CAB_Y}" width="${CAB_W}" height="${CAB_H}" rx="4"/>${speakers}</g>`;
}

// A gem on string s at v down the highway, as the still scene draws them.
function gemBox(s, v) {
  const [x, y] = floor((s + 0.5) / 4, v);
  const w = lerp(16, 64, v), h = lerp(6, 22, v);
  return { x: x - w / 2, y: y - h - lerp(2, 10, v), width: w, height: h, rx: h / 4 };
}

// beam: the light's gradient id, unique per copy (a gradient in a hidden copy doesn't paint).
// live: leaves the frets and gems to liveScene, which moves them.
export function sceneSVG(beam = 'pb-beam', live = false) {
  const lanes = STRING_COLORS.map((c, i) => {
    const u = (i + 0.5) / STRING_COLORS.length;
    const [x0, y0] = floor(u, 0), [x1, y1] = floor(u, 1);
    return `<line class="sstr" data-s="${i}" stroke="${c}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
  }).join('');
  // Fret lines, closer together towards the back.
  const frets = [0.06, 0.15, 0.27, 0.42, 0.6, 0.8].map(v => {
    const [x0, y] = floor(0, v), [x1] = floor(1, v);
    return `<line class="sd" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
  }).join('');
  // A few notes on their way in.
  const gems = [[0, 0.2], [2, 0.34], [1, 0.52], [3, 0.7], [0, 0.88]].map(([s, v]) => {
    const b = gemBox(s, v);
    return `<rect class="sgem" fill="${STRING_COLORS[s]}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}"/>`;
  }).join('');
  // Where each string's notes land, lit as one does.
  const flashes = STRING_COLORS.map((c, i) => {
    const [x, y] = floor((i + 0.5) / 4, NOW);
    return `<ellipse class="sflash" data-s="${i}" fill="${c}" filter="url(#${beam}-glow)" cx="${x}" cy="${y - 8}" rx="70" ry="14"/>`;
  }).join('');
  const hw = [floor(0, 0), floor(1, 0), floor(1, 1), floor(0, 1)].map(p => p.join(',')).join(' ');
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true"${live ? ' class="live"' : ''}>
  <defs><linearGradient id="${beam}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#54f2ff" stop-opacity=".16"/><stop offset="1" stop-color="#54f2ff" stop-opacity="0"/>
  </linearGradient>${live ? `<filter id="${beam}-glow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>` : ''}</defs>
  <path class="sd" d="M0 70 H1600 M0 96 H1600 ${Array.from({ length: 33 }, (_, i) => `M${i * 50} 70 L${i * 50 + 25} 96 L${i * 50 + 50} 70`).join(' ')}"/>
  <polygon class="sbeam" fill="url(#${beam})" points="470,96 500,96 760,700 380,700"/>
  <polygon class="sbeam" fill="url(#${beam})" points="1100,96 1130,96 1220,700 840,700"/>
  <rect class="sx" x="455" y="88" width="60" height="20" rx="3"/><rect class="sx" x="1085" y="88" width="60" height="20" rx="3"/>
  <rect class="sground" x="0" y="700" width="1600" height="200"/>
  <line class="sl" x1="0" y1="700" x2="1600" y2="700"/>
  <polygon class="sf" points="${hw}"/>
  ${live ? `<g class="sbeats"></g>${lanes}${nowLine()}${flashes}<g class="sgems"></g>` : frets + lanes + gems}
  ${amp(110)}${amp(1210)}
  <line class="sa" x1="${FRONT.l}" y1="${FRONT.y - 1}" x2="${FRONT.r}" y2="${FRONT.y - 1}"/>
</svg>`;
}

export function mountScene(el, beam = 'pb-beam', { live = false } = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  el.innerHTML = sceneSVG(beam, live && !still.matches);
  if (live && !still.matches) liveScene(el, beam, still);
}

/* ---- the live stage ---- */

const BPM = 112, BEAT = 60 / BPM;
const LOOK = 4;                          // beats a note is on the highway before it lands
const NEAR = 1, FAR = 3;                 // the camera's distance to the front and the back of the highway
// Two bars of a root-and-fifth groove, in beats: [when, string].
const RIFF = [[0, 0], [1, 0], [1.5, 0], [2, 1], [3, 2], [3.5, 1],
  [4, 0], [5, 0], [5.5, 1], [6, 2], [6.5, 3], [7, 2]];
const LOOP = 8;
const PUMP = 0.11, FLASH = 0.16;         // seconds a cone's push and a landing's light take to die away
// The notes land on a line short of the front: the credit's shade covers the last of the floor.
const NOW = 0.74;
function nowLine() { const [x0, y] = floor(0, NOW), [x1] = floor(1, NOW); return `<line class="snow" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`; }

// Down the highway: z beats-to-go over LOOK (1 at the back, 0 landing) to the floor's v,
// in perspective, so a note gathers speed as it comes.
function depthV(z) { return (1 / (NEAR + (FAR - NEAR) * z) - 1 / FAR) / (1 / NEAR - 1 / FAR); }
// The same, for the floor between the back and the now line (z < 0: past it, towards the front).
const nowV = z => NOW * depthV(z);
const ago = (b, at) => (b - at) * BEAT; // seconds since beat `at`

function liveScene(el, beam, still) {
  const svg = el.firstElementChild, NS = 'http://www.w3.org/2000/svg';
  const pool = (g, n, cls) => Array.from({ length: n }, () => {
    const e = g.appendChild(document.createElementNS(NS, cls[0]));
    e.setAttribute('class', cls[1]);
    return e;
  });
  const beats = pool(svg.querySelector('.sbeats'), LOOK + 2, ['line', 'sd sbeat']);
  const gems = pool(svg.querySelector('.sgems'), 12, ['rect', 'sgem']);
  const lanes = [...svg.querySelectorAll('.sstr')], flashes = [...svg.querySelectorAll('.sflash')];
  const set = (e, a) => { for (const k in a) e.setAttribute(k, a[k]); };

  let b = 0, last = performance.now();
  function draw() {
    // The beat lines, every bar's heavier, coming in with the notes and on past the now line.
    beats.forEach((e, i) => {
      const k = Math.floor(b) + i, z = (k - b) / LOOK;
      if (z > 1 || nowV(z) > 1) { e.style.opacity = 0; return; }
      const v = nowV(z), [x0, y] = floor(0, v), [x1] = floor(1, v);
      set(e, { x1: x0, y1: y, x2: x1, y2: y });
      e.classList.toggle('sbar', k % 4 === 0);
      e.style.opacity = Math.min(1, (1 - z) * 4);
    });
    // The notes in view, and when each string and the amps last sounded.
    let n = 0, hit = 0;
    const lit = [-1e9, -1e9, -1e9, -1e9];
    for (let r = Math.floor((b - 1) / LOOP); r * LOOP <= b + LOOK; r++) {
      for (const [at, s] of RIFF) {
        const t = r * LOOP + at, z = (t - b) / LOOK;
        if (t <= b) { lit[s] = Math.max(lit[s], t); hit = Math.max(hit, t); }
        if (z > 1 || z < -0.06 || n >= gems.length) continue;
        const e = gems[n++];
        set(e, { ...gemBox(s, nowV(Math.max(z, 0))), fill: STRING_COLORS[s] });
        e.style.opacity = z < 0 ? 0.7 * (1 + z / 0.06) : Math.min(0.7, (1 - z) * 2.5) * lerp(0.55, 1, 1 - z);
      }
    }
    for (; n < gems.length; n++) gems[n].style.opacity = 0;
    lanes.forEach((e, s) => {
      const f = Math.exp(-ago(b, lit[s]) / FLASH);
      e.style.opacity = 0.3 + 0.45 * f;
      flashes[s].style.opacity = 0.5 * f;
    });
    // The cones push on every beat (the bar's first hardest) and on every note.
    const beat = Math.floor(b), kick = (beat % 4 === 0 ? 1 : 0.75) * Math.exp(-ago(b, beat) / PUMP);
    const pump = Math.max(kick, 0.8 * Math.exp(-ago(b, hit) / PUMP));
    svg.style.setProperty('--pump', pump.toFixed(3));
    // and the stacks buzz with it: a pixel or so, never the same way twice.
    const ph = b * BEAT * Math.PI * 2;
    svg.style.setProperty('--sx', (Math.sin(ph * 31) * 1.4 * pump).toFixed(2) + 'px');
    svg.style.setProperty('--sy', (Math.cos(ph * 23) * 0.8 * pump).toFixed(2) + 'px');
  }
  function frame(now) {
    if (!el.isConnected) return;                                    // the title has gone
    if (still.matches) { el.innerHTML = sceneSVG(beam); return; }   // reduced motion turned on
    // Held while a sheet is up (Settings, Help, the tuner): it covers the stage, and the
    // tuner wants the frame to itself. A long gap (a background tab) resumes, not jumps.
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    if (!document.querySelector('.gk-sheet')) { b += dt / BEAT; draw(); }
    requestAnimationFrame(frame);
  }
  draw();
  requestAnimationFrame(frame);
}
