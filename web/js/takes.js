// Takes: what the input heard during a play, saved to tune scoring with.

import { arrangementLabel } from './chart.js';
import { alertSheet } from './title.js';
import { SERVER_DOWN, SERVER_OLD } from './api.js';
import { $, highway, input, toast } from './core.js';
import { chart, song, offsetMs, scorer, sync } from './player.js';
import { prefs } from './store.js';

/* A take: what the input heard, with the clock and the verdicts, kept to save
 * for tuning the scoring. Only when asked for (Record a take, in the Mix
 * panel), and only while scoring: a song's worth of input is ~100 MB. */
export let take = null;
export let recordTake = false; // asked for: stays on until switched off (not saved)
export function clearTake() { input.tape = null; input.taping = false; take = null; $('save-take').disabled = true; }
/* The clock and each verdict, as the song plays. */
export function logTakeSync(t, sync) { if (take) take.syncs.push([Math.round(t * 1e4) / 1e4, Math.round(sync.ctx * 1e5) / 1e5, sync.rate]); }
export function logTakeVerdict(ev, r) { if (take) take.verdicts.push([ev.t, r.hit ? 1 : 0, r.why || '', r.offset === null ? null : Math.round(r.offset * 1e4) / 1e4]); }
export function startTake() {
  if (scorer && recordTake) { input.startTape(); take = { syncs: [], verdicts: [] }; }
  else { input.tape = null; take = null; }
  $('save-take').disabled = !take;
}

/* Save the take so far to the PumaBass folder (takes/): the playing, the song's
 * notes and how each was judged, to study and tune scoring with. */
export async function saveTake() {
  const tape = input.tape;
  if (!tape || !tape.samples || !take || !chart) { toast('Nothing recorded yet: tick Record a take, then play.'); return false; }
  const { levels, ...songChart } = chart;
  const meta = {
    title: `${song.title} (${arrangementLabel(song)})`, artist: song.artist, songId: song.id,
    difficulty: prefs.difficulty, sampleRate: input.sampleRate, input: input.label,
    latency: input.latency, inputOffset: prefs.inputOffset, avOffset: prefs.avOffset, offsetMs, bassBoost: prefs.bassBoost,
    chunks: tape.chunks.map(c => c.length), t0s: tape.t0s,
    syncs: take.syncs, verdicts: take.verdicts, chart: songChart, notes: highway.notes,
  };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const len = new DataView(new ArrayBuffer(4));
  len.setUint32(0, json.length, true);
  toast('Saving the take\u2026');
  try {
    const r = await fetch('/api/takes', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([len, json, ...tape.chunks]) });
    if (!r.ok) throw new Error(r.status === 404 ? SERVER_OLD : `The server said ${r.status}.`);
    const { file } = await r.json();
    toast(`Take saved: takes/${file.split(/[\\/]/).pop()}`);
    return true;
  } catch (e) {
    await alertSheet(e.message === 'Failed to fetch' ? SERVER_DOWN : e.message, "Can't save the take");
    return false;
  }
}


$('save-take').addEventListener('click', () => saveTake());
$('record-take').addEventListener('change', () => { recordTake = $('record-take').checked; startTake(); });
