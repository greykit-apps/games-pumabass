// The title and song-list backdrop: a stage in the Tactical tribe's line art.
// A note highway runs from the front of the stage to the back wall, with an
// amp stack either side and two lights from the truss. Paths only, no text.

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
// clear gap between the cones, and the head on top.
const CONE = 44, PITCH = 100;           // cone radius, centre-to-centre spacing (gap = PITCH - 2 * CONE)
const CAB_W = 280, CAB_H = 210, CAB_Y = 700 - CAB_H, HEAD_H = 56, HEAD_Y = CAB_Y - 4 - HEAD_H;
function amp(x, flip) {
  const headMid = HEAD_Y + HEAD_H / 2;
  const knobs = [0, 1, 2, 3, 4, 5].map(i => `<circle class="sd" cx="${x + 40 + i * 30}" cy="${headMid}" r="6"/>`).join('');
  const cx0 = x + (CAB_W - PITCH) / 2, cy0 = CAB_Y + (CAB_H - PITCH) / 2;
  const speakers = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => {
    const cx = cx0 + i * PITCH, cy = cy0 + j * PITCH;
    return `<circle class="sd" cx="${cx}" cy="${cy}" r="${CONE}"/><circle class="sd" cx="${cx}" cy="${cy}" r="12"/>`;
  }).join('');
  const led = flip ? x + 254 : x + 26;
  return `<rect class="sf" x="${x}" y="${HEAD_Y}" width="${CAB_W}" height="${HEAD_H}" rx="4"/>${knobs}<circle class="sled" cx="${led}" cy="${headMid}" r="4"/>` +
    `<rect class="sf" x="${x}" y="${CAB_Y}" width="${CAB_W}" height="${CAB_H}" rx="4"/>${speakers}`;
}

export function sceneSVG() {
  const lanes = STRING_COLORS.map((c, i) => {
    const u = (i + 0.5) / STRING_COLORS.length;
    const [x0, y0] = floor(u, 0), [x1, y1] = floor(u, 1);
    return `<line class="sstr" stroke="${c}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
  }).join('');
  // Fret lines, closer together towards the back.
  const frets = [0.06, 0.15, 0.27, 0.42, 0.6, 0.8].map(v => {
    const [x0, y] = floor(0, v), [x1] = floor(1, v);
    return `<line class="sd" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
  }).join('');
  // A few notes on their way in.
  const gems = [[0, 0.2], [2, 0.34], [1, 0.52], [3, 0.7], [0, 0.88]].map(([s, v]) => {
    const [x, y] = floor((s + 0.5) / 4, v);
    const w = lerp(16, 64, v), h = lerp(6, 22, v);
    return `<rect class="sgem" fill="${STRING_COLORS[s]}" x="${x - w / 2}" y="${y - h - lerp(2, 10, v)}" width="${w}" height="${h}" rx="${h / 4}"/>`;
  }).join('');
  const hw = [floor(0, 0), floor(1, 0), floor(1, 1), floor(0, 1)].map(p => p.join(',')).join(' ');
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs><linearGradient id="pb-beam" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#54f2ff" stop-opacity=".16"/><stop offset="1" stop-color="#54f2ff" stop-opacity="0"/>
  </linearGradient></defs>
  <path class="sd" d="M0 70 H1600 M0 96 H1600 ${Array.from({ length: 33 }, (_, i) => `M${i * 50} 70 L${i * 50 + 25} 96 L${i * 50 + 50} 70`).join(' ')}"/>
  <polygon class="sbeam" points="470,96 500,96 760,700 380,700"/>
  <polygon class="sbeam" points="1100,96 1130,96 1220,700 840,700"/>
  <rect class="sx" x="455" y="88" width="60" height="20" rx="3"/><rect class="sx" x="1085" y="88" width="60" height="20" rx="3"/>
  <rect class="sground" x="0" y="700" width="1600" height="200"/>
  <line class="sl" x1="0" y1="700" x2="1600" y2="700"/>
  <polygon class="sf" points="${hw}"/>
  ${frets}${lanes}${gems}
  ${amp(110, false)}${amp(1210, true)}
  <line class="sa" x1="${FRONT.l}" y1="${FRONT.y - 1}" x2="${FRONT.r}" y2="${FRONT.y - 1}"/>
</svg>`;
}

export function mountScene(el) { el.innerHTML = sceneSVG(); }
