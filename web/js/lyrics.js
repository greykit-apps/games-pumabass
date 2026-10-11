// The song's words at the top of the player, a line at a time as Rocksmith shows them: the line
// being sung, each syllable lighting up as it comes, and the next line under it (Y, Settings).
// When a line is sung it scrolls up and fades away, the next one rises into its place, and the one
// after fades in under it: each line its own element, moved between slots (style.css, .ly-line).
// From the vocals arrangement (server/library.js, lyrics): a syllable ending in '-' runs into the
// next one, '+' ends the line. Lines also break at a pause the words don't mark, and when long.
import { $ } from './core.js';

const LINGER = 0.3;   // s a line stays after its last syllable, then the next rises into its place:
                      // a last word is often held past its marked end
const BREAK = 6;      // s between lines that's a break: the line sung goes, and the next comes...
const LEAD = 2;       // ...this long before it's sung (so does the first line)
const HOLD = 1.5;     // s a line stays after its last syllable before a break, or at the end
const PAUSE = 2.5;    // s of silence that ends a line the words don't end
const LONGEST = 40;   // characters a line runs to before it breaks at the next word anyway (it must fit on a TV)

let lines = [];       // [{ t, end, from, syl: [{ t, end, text, space }] }]
let shown = -2, lit = -1, singing = false;
const els = new Map(); // line index -> its element, while it's in a slot

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The words for the song now up: chart.lyrics, or nothing (no vocals, the demo, the sync test). */
export function setLyrics(words) {
  lines = [];
  let line = null, chars = 0, ended = true;
  for (const w of words || []) {
    let text = w.w || '', breaks = false, joins = false;
    if (text.endsWith('+')) { breaks = true; text = text.slice(0, -1); }
    if (text.endsWith('-')) { joins = true; text = text.slice(0, -1); }
    const last = line && line.syl[line.syl.length - 1];
    if (!line || ended || w.t - line.end > PAUSE || (chars > LONGEST && last.space)) {
      line = { t: w.t, end: w.t, syl: [] };
      lines.push(line);
      chars = 0;
    }
    line.syl.push({ t: w.t, end: w.t + (w.d || 0), text, space: !joins });
    line.end = Math.max(line.end, w.t + (w.d || 0));
    chars += text.length + (joins ? 0 : 1);
    ended = breaks;
  }
  // When each line takes over: as soon as the line before has been sung (and lingered), to wait
  // there until it's sung, unless the line has begun by then; after a break, a little before it's sung.
  lines.forEach((l, k) => {
    const before = lines[k - 1];
    l.from = before && l.t - before.end <= BREAK ? Math.min(l.t, before.end + LINGER) : l.t - LEAD;
  });
  clear();
}

/* Every line off at once (a new song, a seek, the lyrics turned off). */
function clear() {
  for (const d of els.values()) d.remove();
  els.clear();
  shown = -2; lit = -1; singing = false;
}

export const hasLyrics = () => lines.length > 0;

const lineHTML = line => line.syl.map(s => `<span>${esc(s.text)}</span>${s.space ? ' ' : ''}`).join('');

/** Each frame: the line for song time t, lit up to the syllable being sung; nothing when !show. */
export function renderLyrics(t, show) {
  let i = -1;
  if (show) {
    // the last line to have taken over, while it's still being sung or held
    for (let k = 0; k < lines.length && lines[k].from <= t; k++) i = k;
    if (i >= 0 && t > lines[i].end + HOLD) i = -1;
  }
  if (i !== shown) {
    // On to the next line (or past the last, or in from nothing): scroll. A seek: start over, still.
    const jump = shown >= 0 && i >= 0 && i !== shown + 1, was = shown;
    if (!show || jump) clear();
    shown = i; lit = -1; singing = false;
    const sung = k => (i >= 0 ? k < i : k <= was);
    const box = $('lyrics'), want = new Map();
    if (i >= 0) { want.set(i, 'now'); if (lines[i + 1]) want.set(i + 1, 'next'); }
    for (const [k, d] of els) {
      if (want.has(k)) continue;
      // sung: up and away; not yet (a break comes first): back down
      for (const span of d.children) { span.classList.remove('singing'); span.classList.toggle('sung', sung(k)); }
      d.className = `ly-line ${sung(k) ? 'gone' : 'below'}`;
      els.delete(k);
      setTimeout(() => d.remove(), 600);
    }
    let fresh = false;
    for (const k of want.keys()) {
      if (els.has(k)) continue;
      const d = document.createElement('div');
      d.className = `ly-line ${jump ? want.get(k) : 'below'}`;
      d.innerHTML = lineHTML(lines[k]);
      box.appendChild(d);
      els.set(k, d);
      fresh = true;
    }
    if (fresh && !jump) void box.offsetWidth; // the new lines start below, so they rise into their slots
    for (const [k, slot] of want) els.get(k).className = `ly-line ${slot}`;
  }
  if (i < 0) return;
  const syl = lines[i].syl;
  let n = 0;
  while (n < syl.length && syl[n].t <= t) n++;
  const now = n > 0 && t < syl[n - 1].end;
  if (n === lit && now === singing) return;
  lit = n; singing = now;
  const spans = els.get(i).children;
  for (let k = 0; k < spans.length; k++) {
    spans[k].classList.toggle('sung', k < n && !(now && k === n - 1));
    spans[k].classList.toggle('singing', now && k === n - 1);
  }
}
