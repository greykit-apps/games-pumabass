// The riff repeater.

import { $, toast } from './core.js';
import { chart, loop, scorer, toggleSectionLoop, renderLoop, setSpeed } from './player.js';
import { prefs } from './store.js';

/* ---- the riff repeater: the loop, a little faster each time round ---- */
export let repeater = null; // while on: { passes, mark } (mark: scoring's counts when this time round began)
export function stopRepeater() { repeater = null; }

export function toggleRepeater() {
  if (!chart) return;
  if (repeater) { repeater = null; toast('Riff repeater off'); }
  else {
    if (!loop) toggleSectionLoop();
    if (Number($('speed').value) >= 100) setSpeed(prefs.repeatFrom);
    repeater = { passes: 0, mark: scorer ? { hits: scorer.hits, judged: scorer.judged } : null };
    toast(`Riff repeater: ${$('speed').value}% up to 100%`);
  }
  renderLoop();
}

/* The loop came round: up the speed (with scoring on, only after a good time round). */
export function repeaterPass() {
  if (!repeater) return;
  repeater.passes++;
  const v = Number($('speed').value);
  let good = true, note = '';
  if (scorer && repeater.mark) {
    const judged = scorer.judged - repeater.mark.judged, hits = scorer.hits - repeater.mark.hits;
    if (judged >= 3) { good = hits / judged >= 0.7; note = ` \u00b7 ${Math.round((100 * hits) / judged)}% hit`; }
  }
  repeater.mark = scorer ? { hits: scorer.hits, judged: scorer.judged } : null;
  if (v >= 100) { toast(`Full speed, time ${repeater.passes}${note}`); return; }
  if (!good) { toast(`Again at ${v}%${note} (70% to speed up)`); return; }
  const next = Math.min(100, v + prefs.repeatStep);
  setSpeed(next);
  toast(next >= 100 ? `Full speed!${note}` : `Speed ${next}%${note}`);
}
