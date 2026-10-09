// What PumaBass keeps in the browser: settings, favorites, play counts.

/* ---- storage (games-meta STANDARD.md §5): every key is pumabass_<feature>_v<n>,
 * so Forget everything (§2) can find them all by the prefix. */
export const KEY_PREFS = 'pumabass_prefs_v1';      // song-list filters and player preferences
export const KEY_OFFSETS = 'pumabass_offsets_v1';  // per-song audio offset, ms
export const KEY_RECENT = 'pumabass_recent_v1';    // per-song last-opened time
export const KEY_RESUME = 'pumabass_resume_v1';    // the song and spot you left off at
export const KEY_TUNER = 'pumabass_tuner_v1';      // the day and tuning you last tuned to
export const KEY_FAVS = 'pumabass_favorites_v1';   // { id: true } for each favorite part
export const KEY_STATS = 'pumabass_stats_v1';      // { id: { plays, finished, last } }

export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
export function save(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window */ }
}

/* Before the standard, settings lived under "pb:<name>". Read them once into the
 * new keys, then drop them, so nobody loses their offsets. */
(function migrateOldKeys() {
  try {
    const old = {};
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('pb:')) continue;
      try { old[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* unreadable */ }
      localStorage.removeItem(k);
    }
    if (!Object.keys(old).length) return;
    const p = load(KEY_PREFS, {}), offsets = load(KEY_OFFSETS, {});
    for (const n of ['type', 'sort', 'showMissing', 'difficulty', 'lookahead', 'invert', 'volume']) if (n in old && !(n in p)) p[n] = old[n];
    for (const [n, v] of Object.entries(old)) if (n.startsWith('offset:')) offsets[n.slice(7)] = v;
    save(KEY_PREFS, p);
    save(KEY_OFFSETS, offsets);
    if (old.recent) save(KEY_RECENT, old.recent);
  } catch (e) { /* no storage */ }
})();

// Lessons were taken out: their progress goes too.
try { localStorage.removeItem('pumabass_lessons_v1'); localStorage.removeItem('pumabass_muted_v1'); } catch (e) { /* no storage */ }

export const prefs = Object.assign({
  type: 'bass', sort: 'artist', sortRev: false, showMissing: false, difficulty: 100, lookahead: 3, invert: true, volume: 100, startSpeed: 100,
  input: null,      // { id, label } of the instrument input
  hear: true,       // play the input through the speakers (playing along, you hear yourself with the song)
  bassBoost: 12,    // dB added to the input: the cable's signal is quiet next to a finished record
  recordedBass: 'full', // the song's own bass: full, reduced or cut (RECORDED_BASS)
  favOnly: false,   // the song list shows favorites only
  avOffset: 0,      // ms the notes land later, for every song: this computer's sound vs. its picture (calibrated)
  inputOffset: 0,   // ms your plucks reach us later than the notes you see, through the input (from the sync test)
  soundcheck: null, // the sync test's soundcheck: { device, energy, diff, db, pluckDb }, the input's noise floor for scoring
  screen: 'couch',  // 'couch': drawn bigger on a TV, to read from across the room; 'desk': as is
  noteLabels: 'fret', // on the highway's notes: 'fret' numbers, note 'name's, or 'off'
  notation: true,   // the notation band: standard notation over tab, above the highway
  notationStaff: true, // the notation band's standard notation...
  notationTab: true,   // ...and its tab, each on or off
  staffNames: true, // note names under the notes in the notation band
  lefty: false,     // left-handed: the highway mirrored, the nut on the right (tab and notation are the same either way)
  view: 'highway',  // what the song is played from: the 'highway', or the 'tab' view in its place (V)
}, load(KEY_PREFS, {}));
if (typeof prefs.hear === 'number') prefs.hear = prefs.hear > 0; // was a volume
// Settings that are gone: the tuner always offers itself, the riff repeater has
// fixed steps, sound is always on.
for (const k of ['hearLast', 'autoTune', 'repeatFrom', 'repeatStep', 'scoring']) delete prefs[k];
// Note labels were on or off before note names joined them.
if (prefs.noteLabels === true) prefs.noteLabels = 'fret';
if (prefs.noteLabels === false) prefs.noteLabels = 'off';
// Notes moved to five stops (100, 80, 60, 40, 20): between 100 and 80 every phrase
// just lost a note or two. A saved in-between value goes to the nearest stop.
prefs.difficulty = Math.max(20, Math.min(100, Math.round(Number(prefs.difficulty) / 20) * 20 || 100));
// Low string on top became the default, as in Rocksmith. Every saved setting carries
// "invert", so the old default can't be told from a choice: everyone moves over
// once, and Settings decides after that.
if (!prefs.lowOnTopDefault) { prefs.invert = true; prefs.lowOnTopDefault = true; }
// Scoring became a mode of its own ("Score a song"), and playing along you hear the cable:
// everyone moves over to hearing it once, and the Mix decides after that.
if (!prefs.hearDefault) { prefs.hear = true; prefs.hearDefault = true; }
export const savePrefs = () => save(KEY_PREFS, prefs);

/* The couch scale (style.css): a class on the page, the sizes in the stylesheet. */
export const applyScreen = () => document.documentElement.classList.toggle('couch', prefs.screen !== 'desk');

/* ---- favorites and play counts ---- */
export const isFav = id => !!load(KEY_FAVS, {})[id];
export function toggleFav(id) {
  const favs = load(KEY_FAVS, {});
  if (favs[id]) delete favs[id]; else favs[id] = true;
  save(KEY_FAVS, favs);
  return !!favs[id];
}
export const statsOf = id => load(KEY_STATS, {})[id] || { plays: 0, finished: 0 };
export function bumpStat(id, field) {
  const all = load(KEY_STATS, {});
  const st = all[id] || { plays: 0, finished: 0 };
  st[field] = (st[field] || 0) + 1;
  st.last = Date.now();
  all[id] = st;
  save(KEY_STATS, all);
}

/* Settings' "Forget everything" (games-meta STANDARD.md §2): every key PumaBass
 * owns, found by its prefix, and only those -- every game on greykit.com shares
 * one origin, so one storage. */
export function forgetEverything() {
  for (const area of ['localStorage', 'sessionStorage']) {
    try {
      const s = window[area];
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k && k.startsWith('pumabass')) s.removeItem(k);
      }
    } catch (e) { /* no storage */ }
  }
  location.reload();
}
