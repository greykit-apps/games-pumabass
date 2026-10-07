// Chart helpers: difficulty selection and tuning names.

// Build the playable note list for a difficulty percentage (100 = full song).
// Rocksmith stores every phrase at several levels; each phrase has its own max level.
export function buildPlayable(chart, percent) {
  const byDiff = new Map(chart.levels.map(l => [l.difficulty, l]));
  const notes = [];
  const anchors = [];
  chart.phraseIterations.forEach((it, i) => {
    const maxD = chart.phrases[it.phrase]?.maxDifficulty ?? 0;
    const want = Math.round((maxD * percent) / 100);
    // Fall back to the closest available level at or below the target.
    let level = null;
    for (let d = want; d >= 0 && !level; d--) level = byDiff.get(d);
    if (!level) return;
    for (const n of level.notes) if (n.pi === i) notes.push(n);
    for (const a of level.anchors) if (a.pi === i) anchors.push(a);
  });
  notes.sort((a, b) => a.t - b.t);
  anchors.sort((a, b) => a.t - b.t);
  if (!anchors.length) anchors.push({ t: 0, end: chart.songLength, fret: 1, width: 4 });
  return { notes, anchors };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const STANDARD = { 4: [28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64] };

export function tuningNotes(tuning, strings) {
  return STANDARD[strings].map((m, i) => NOTE_NAMES[(m + (tuning[i] || 0) + 120) % 12]);
}

export function tuningName(tuning, strings) {
  const t = tuning.slice(0, strings);
  const rest = t.slice(1);
  const allSame = rest.every(v => v === t[0]);
  const restSame = rest.every(v => v === rest[0]);
  const std = { 0: 'E Standard', [-1]: 'Eb Standard', [-2]: 'D Standard', [-3]: 'C# Standard', [-4]: 'C Standard', [-5]: 'B Standard', 1: 'F Standard' };
  if (allSame && std[t[0]]) return std[t[0]];
  if (restSame && t[0] === rest[0] - 2) {
    const low = tuningNotes(t, strings)[0];
    return `Drop ${low}`;
  }
  return tuningNotes(t, strings).join(' ');
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function arrangementLabel(s) {
  const base = s.type === 'bass' ? 'Bass' : s.type === 'lead' ? 'Lead' : 'Rhythm';
  const name = s.arrangement && s.arrangement !== base ? s.arrangement : base;
  return s.represent === false || s.bonus ? `${name} (alt)` : name;
}
