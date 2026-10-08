// What PumaBass keeps in the browser: settings, favorites, play counts.

/* ---- storage (games-meta STANDARD.md §5): every key is pumabass_<feature>_v<n>,
 * so Forget everything (§2) can find them all by the prefix. */
export const KEY_PREFS = 'pumabass_prefs_v1';      // song-list filters and player preferences
export const KEY_OFFSETS = 'pumabass_offsets_v1';  // per-song audio offset, ms
export const KEY_RECENT = 'pumabass_recent_v1';    // per-song last-opened time
export const KEY_RESUME = 'pumabass_resume_v1';    // the song and spot you left off at
export const KEY_MUTED = 'pumabass_muted_v1';      // "1" muted, "0" not (§8)
export const KEY_TUNER = 'pumabass_tuner_v1';      // the day and tuning you last tuned to
export const KEY_FAVS = 'pumabass_favorites_v1';   // { id: true } for each favorite part
export const KEY_STATS = 'pumabass_stats_v1';      // { id: { plays, finished, last } }
export const KEY_LESSONS = 'pumabass_lessons_v1';  // { lesson key: { part name: true } }: lesson practice played through

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

export const prefs = Object.assign({
  type: 'bass', sort: 'artist', showMissing: false, difficulty: 100, lookahead: 3, invert: false, volume: 100, startSpeed: 100,
  input: null,      // { id, label } of the instrument input
  hear: false,      // play the input through the speakers
  bassBoost: 12,    // dB added to the input: the cable's signal is quiet next to a finished record
  recordedBass: 'full', // the song's own bass: full, reduced or cut (RECORDED_BASS)
  autoTune: true,   // open the tuner on the day's first song and when the tuning changes
  favOnly: false,   // the song list shows favorites only
  avOffset: 0,      // ms the notes land later, for every song: this computer's sound vs. its picture (calibrated)
  scoring: true,    // score the playing (only ever while an instrument input is open)
  repeatFrom: 60,   // the riff repeater starts here (%), when the song is at full speed
  repeatStep: 5,    // and speeds up this much (%) each time round
  inputOffset: 0,   // ms your plucks reach us later than the notes you see, through the input (from the sync test)
}, load(KEY_PREFS, {}));
if (typeof prefs.hear === 'number') prefs.hear = prefs.hear > 0; // was a volume
delete prefs.hearLast;
export const savePrefs = () => save(KEY_PREFS, prefs);

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
