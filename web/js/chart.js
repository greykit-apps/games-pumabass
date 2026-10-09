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

// The open strings' names, low to high. A top string with the bottom one's name is
// written small, as guitarists write it: E A D G B e.
export function tuningNotes(tuning, strings) {
  const names = STANDARD[strings].map((m, i) => NOTE_NAMES[(m + (tuning[i] || 0) + 120) % 12]);
  if (strings > 4 && names[strings - 1] === names[0]) names[strings - 1] = names[0].toLowerCase();
  return names;
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

/**
 * Rocksmith's difficulty rating for a part (0 to 1; for the full chart) as a level
 * of 1 to 5, by fixed steps so a song keeps its level as the library grows. Bass
 * parts run from about 0.1 to 0.6. 0 when there is no rating.
 */
export function difficultyLevel(d) {
  if (typeof d !== 'number') return 0;
  return d < 0.2 ? 1 : d < 0.3 ? 2 : d < 0.4 ? 3 : d < 0.5 ? 4 : 5;
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* A section's name as a person says it: the charts' own are run together and
 * numbered ("prechorus2", "noguitar", "postvs"). */
const SECTION_WORDS = { noguitar: 'Rest', prechorus: 'Pre-chorus', postchorus: 'Post-chorus', postvs: 'Post-verse', postbrdg: 'Post-bridge',
  preverse: 'Pre-verse', modchorus: 'Chorus', modverse: 'Verse', buildup: 'Build-up', fadein: 'Fade-in', fadeout: 'Fade-out', brdg: 'Bridge' };
export function sectionName(name) {
  const n = String(name || '').trim().replace(/[\s\d]+$/, ''), k = n.toLowerCase().replace(/\s+/g, '');
  return SECTION_WORDS[k] || (n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : 'Section');
}

/* A part's name: its type, or the chart's own name with the type it's played as
 * ("Combo (lead)": Rocksmith's combo parts follow the lead or the rhythm path).
 * Alternates say so ("Alt. lead", "Bonus lead"), numbered where a song has two alike. */
export function arrangementLabel(s) {
  const label = partLabel(s);
  return s.altNo > 1 ? `${label} ${s.altNo}` : label;
}
function partLabel(s) {
  const base = s.type === 'bass' ? 'Bass' : s.type === 'lead' ? 'Lead' : 'Rhythm';
  const name = s.arrangement && s.arrangement !== base ? `${s.arrangement} (${s.type})` : base;
  const alt = s.bonus ? 'Bonus' : s.represent === false ? 'Alt.' : '';
  return alt ? `${alt} ${name[0].toLowerCase()}${name.slice(1)}` : name;
}
/* Number a song's alternates that would otherwise read alike ("Alt. combo (lead) 2"). */
export function numberAlternates(songs) {
  const groups = new Map();
  for (const s of songs) {
    if (s.represent !== false && !s.bonus) continue;
    const k = `${s.songKey}|${s.platform}|${partLabel(s)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(s);
  }
  for (const g of groups.values()) if (g.length > 1) g.sort((a, b) => a.id.localeCompare(b.id)).forEach((s, i) => { s.altNo = i + 1; });
}

/* ---- pitch, for the notation band and note names ---- */
// The open strings' MIDI pitches in standard tuning, by how many strings: 4 and 5
// are bass (5 adds a low B), 6 and 7 guitar (7 adds a low B).
const OPEN = { 4: [28, 33, 38, 43], 5: [23, 28, 33, 38, 43], 6: [40, 45, 50, 55, 59, 64], 7: [35, 40, 45, 50, 55, 59, 64] };
// Frets are counted from the nut, capo or not: an open string sounds at the capo.
export const pitchOf = (chart, s, f) => (OPEN[chart.strings] || OPEN[4])[s] + (chart.tuning[s] || 0) + (f || chart.capo || 0);

// Major keys by tonic pitch class, with their sharps (+) or flats (-).
const KEYS = [['C', 0, 0], ['G', 7, 1], ['D', 2, 2], ['A', 9, 3], ['E', 4, 4], ['B', 11, 5], ['F#', 6, 6],
  ['F', 5, -1], ['Bb', 10, -2], ['Eb', 3, -3], ['Ab', 8, -4], ['Db', 1, -5]];
// The key signature that leaves the fewest notes needing an accidental (on a tie,
// the one with fewer sharps or flats). flats: whether to spell the others as flats.
export function keyOf(chart, notes) {
  const count = new Array(12).fill(0);
  for (const e of notes) for (const p of e.notes || [e]) count[((pitchOf(chart, p.s, p.f) % 12) + 12) % 12]++;
  let best = null;
  for (const [name, tonic, acc] of KEYS) {
    const fit = [0, 2, 4, 5, 7, 9, 11].reduce((n, i) => n + count[(tonic + i) % 12], 0);
    if (!best || fit > best.fit || (fit === best.fit && Math.abs(acc) < Math.abs(best.acc))) best = { name, acc, fit };
  }
  return { name: best.name, flats: best.acc < 0 };
}
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (midi, flats) => (flats ? FLATS : SHARPS)[((midi % 12) + 12) % 12];

// A bar starts where the bar number changes: charts number every beat with its bar
// (some only the first), so a number alone doesn't mark a downbeat.
export const isDownbeat = (beats, i) => beats[i].m !== null && (i === 0 || beats[i].m !== beats[i - 1].m);
