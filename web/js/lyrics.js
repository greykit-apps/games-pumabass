// The song's words at the top of the player, a line at a time as Rocksmith shows them: the line
// being sung, each syllable lighting up as it comes, and the next line under it (Y, Settings).
// From the vocals arrangement (server/library.js, lyrics): a syllable ending in '-' runs into the
// next one, '+' ends the line. Lines also break at a pause the words don't mark, and when long.
import { $ } from './core.js';

const LEAD = 1;       // s a line shows before its first syllable, once the line before is sung
const LINGER = 0.3;   // s a line stays after its last syllable when the next line follows on: it's
                      // under it already, and a last word is often held past its marked end
const HOLD = 1.5;     // s it stays after its last syllable when nothing follows soon
const PAUSE = 2.5;    // s of silence that ends a line the words don't end
const LONGEST = 40;   // characters a line runs to before it breaks at the next word anyway (it must fit on a TV)

let lines = [];       // [{ t, end, from, syl: [{ t, end, text, space }] }]
let shown = -2, lit = -1, singing = false;

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
  // When each line takes over: its lead-in, but not before the line before has been sung (and
  // lingered), unless the line itself has begun.
  lines.forEach((l, k) => {
    l.from = l.t - LEAD;
    if (k > 0) l.from = Math.min(l.t, Math.max(l.from, lines[k - 1].end + LINGER));
  });
  shown = -2; lit = -1; singing = false;
}

export const hasLyrics = () => lines.length > 0;

const lineHTML = line => line.syl.map(s => `<span>${esc(s.text)}</span>${s.space ? ' ' : ''}`).join('');

/** Each frame: the line for song time t, lit up to the syllable being sung; nothing when !show. */
export function renderLyrics(t, show) {
  const el = $('lyrics');
  let i = -1;
  if (show) {
    // the last line to have taken over, while it's still being sung or held
    for (let k = 0; k < lines.length && lines[k].from <= t; k++) i = k;
    if (i >= 0 && t > lines[i].end + HOLD) i = -1;
  }
  if (i !== shown) {
    shown = i; lit = -1; singing = false;
    el.classList.toggle('hidden', i < 0);
    if (i >= 0) {
      el.querySelector('.ly-now').innerHTML = lineHTML(lines[i]);
      const next = lines[i + 1];
      el.querySelector('.ly-next').innerHTML = next ? lineHTML(next) : '';
    }
  }
  if (i < 0) return;
  const syl = lines[i].syl;
  let n = 0;
  while (n < syl.length && syl[n].t <= t) n++;
  const now = n > 0 && t < syl[n - 1].end;
  if (n === lit && now === singing) return;
  lit = n; singing = now;
  const spans = el.querySelector('.ly-now').children;
  for (let k = 0; k < spans.length; k++) {
    spans[k].classList.toggle('sung', k < n && !(now && k === n - 1));
    spans[k].classList.toggle('now', now && k === n - 1);
  }
}
