// The song list, and choosing the songs folder.

import { tuningName, formatTime, arrangementLabel, difficultyLevel, numberAlternates } from './chart.js';
import { alertSheet } from './title.js';
import { api } from './api.js';
import { $, esc, toast, screen, songs, setScreen, setLibrary } from './core.js';
import { showTuner } from './instrument.js';
import { showTitle, leaveTitle, openHelp, openSettings, partsLabel } from './menu.js';
import { openSong } from './player.js';
import { KEY_RECENT, KEY_FAVS, KEY_STATS, load, prefs, savePrefs, toggleFav } from './store.js';

/* The songs folder, picked from this computer's folders through the server,
 * then scanned. From Settings, the title (with no songs yet) or the empty list. */
export async function pickLibrary() {
  let chosen;
  try {
    chosen = await chooseFolder();
    if (!chosen) return;
    await loadLibrary();
  } catch (e) {
    await alertSheet(e.message, "Can't choose the songs folder");
    return;
  }
  const playable = songs.filter(s => s.audio !== false);
  const bass = playable.filter(s => s.type === 'bass').length;
  await alertSheet(chosen.songs
    ? `Found ${new Set(playable.map(s => s.songKey)).size} songs with ${bass} bass parts in ${chosen.archives} song ${chosen.archives === 1 ? 'file' : 'files'}.`
    : `No Rocksmith 2014 songs were found in ${chosen.libraryDir} or the folders inside it. Choose the folder that holds your .psarc song files.`, 'Songs folder');
  if (screen === 'title') { leaveTitle(); showTitle().reveal(); }
  else if (screen === 'library') renderLibrary();
}

export function chooseFolder() {
  return new Promise(async (resolve, reject) => {
    if (document.querySelector('.gk-sheet')) return resolve(null);
    const back = document.activeElement;
    // Up at once, so a click always shows something, then filled in.
    const el = document.createElement('div');
    el.className = 'gk-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Songs folder');
    el.innerHTML = '<div class="gk-box"><div class="gk-head"><h2>Songs folder</h2></div><div class="gk-body"><p>Reading your folders…</p></div></div>';
    document.body.appendChild(el);
    let roots, start;
    try { ({ roots, start } = await api('/api/folders')); } catch (e) { el.remove(); return reject(e); }
    const home = roots[0];
    let cur = null, err = '';
    const into = d => cur.path + (cur.path.endsWith(cur.sep) ? '' : cur.sep) + d;
    const draw = () => {
      const n = cur.psarc, k = cur.dirs.length;
      el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>Songs folder</h2><button data-x aria-label="Close">&times;</button></div>
      <div class="gk-body">
        <p>Pick the folder with your Rocksmith 2014 song files (<code>.psarc</code>). The folders inside it are searched too,
        so a whole Rocksmith folder, a copied <code>dlc</code> folder or a USB stick all work.</p>
        <div class="gk-row">${roots.map(r => `<button data-go="${esc(r)}">${esc(r === home ? 'Home' : r)}</button>`).join('')}</div>
        <form class="folder-path"><input name="p" value="${esc(cur.path)}" aria-label="Folder" spellcheck="false" autocomplete="off"><button>Go</button></form>
        ${err ? `<p class="gk-note warn">${esc(err)}</p>` : ''}
        <p class="gk-note">${n ? `<b>${n}</b> song ${n === 1 ? 'file' : 'files'} right here` : 'No song files right here'}${k ? `, and ${k} ${k === 1 ? 'folder' : 'folders'} inside` : ''}.</p>
        <div class="folders">${cur.parent ? `<button data-go="${esc(cur.parent)}">.. up</button>` : ''}${cur.dirs.map(d => `<button data-go="${esc(into(d))}">${esc(d)}</button>`).join('')}</div>
        <div class="gk-row"><button class="primary" data-use>Use this folder</button><button data-x>Cancel</button></div>
      </div></div>`;
      (el.querySelector('.folders button') || el.querySelector('[data-use]')).focus({ preventScroll: true });
    };
    const go = async dir => {
      const j = await api(`/api/folders?path=${encodeURIComponent(dir)}`).catch(e => ({ error: e.message }));
      if (j.error) err = j.error; else { cur = j; err = ''; }
      draw();
    };
    const close = v => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (back && back.isConnected) back.focus({ preventScroll: true });
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } };
    el.addEventListener('submit', e => { e.preventDefault(); go(el.querySelector('input[name=p]').value.trim()); });
    el.addEventListener('click', async e => {
      if (e.target === el) return close(null);
      const b = e.target.closest('button');
      if (!b || b.closest('form')) return; // the form's Go button submits it
      if (b.hasAttribute('data-x')) return close(null);
      if (b.dataset.go) return go(b.dataset.go);
      if (b.hasAttribute('data-use')) {
        b.textContent = 'Scanning';
        const r = await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: cur.path }) })
          .catch(e => ({ error: e.message }));
        if (r.error) { err = r.error; draw(); return; }
        close(r);
      }
    });
    document.addEventListener('keydown', onKey, true);
    await go(start);
  });
}


/* ---- the song list ---- */
export async function loadLibrary() {
  const [list, about] = await Promise.all([api('/api/songs'), api('/api/info')]);
  numberAlternates(list);
  setLibrary(list, about);
  if (screen === 'library') renderLibrary();
}

export function showLibrary() {
  setScreen('library');
  $('player').classList.add('hidden');
  $('library').classList.remove('hidden');
  renderLibrary();
  const first = $('song-list').querySelector('.song:not(.noaudio)');
  (first || $('search')).focus({ preventScroll: true });
}

/* The song list, with a song's row in focus and in view (back from the player). */
export function showSongInList(id) {
  showLibrary();
  const row = $('song-list').querySelector(`.song[data-id="${CSS.escape(id)}"]`);
  if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); }
}

export const stringsOf = s => (s.type === 'bass' ? 4 : 6);
export function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const recent = load(KEY_RECENT, {});
  const ofType = songs.filter(s => prefs.type === 'all' || s.type === prefs.type);
  const favs = load(KEY_FAVS, {}), stats = load(KEY_STATS, {});
  let list = ofType.filter(s => (prefs.showMissing || s.audio !== false) && (!prefs.favOnly || favs[s.id]));
  if (q) list = list.filter(s => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  const cmp = {
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
    difficulty: (a, b) => (a.difficulty ?? 9) - (b.difficulty ?? 9) || a.artist.localeCompare(b.artist),
    tuning: (a, b) => tuningName(a.tuning, stringsOf(a)).localeCompare(tuningName(b.tuning, stringsOf(b))) || a.artist.localeCompare(b.artist),
    recent: (a, b) => (recent[b.id] || 0) - (recent[a.id] || 0) || a.artist.localeCompare(b.artist),
    plays: (a, b) => ((stats[b.id] || {}).plays || 0) - ((stats[a.id] || {}).plays || 0) || ((stats[b.id] || {}).finished || 0) - ((stats[a.id] || {}).finished || 0) || a.artist.localeCompare(b.artist),
    finished: (a, b) => ((stats[b.id] || {}).finished || 0) - ((stats[a.id] || {}).finished || 0) || ((stats[b.id] || {}).plays || 0) - ((stats[a.id] || {}).plays || 0) || a.artist.localeCompare(b.artist),
    part: (a, b) => arrangementLabel(a).localeCompare(arrangementLabel(b)) || a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    length: (a, b) => (a.length || 0) - (b.length || 0) || a.artist.localeCompare(b.artist),
  }[prefs.sort] || (() => 0);
  const dir = prefs.sortRev ? -1 : 1; // a second click on a heading: the other way round
  list.sort((a, b) => dir * (cmp(a, b) || arrangementLabel(a).localeCompare(arrangementLabel(b))));

  for (const b of document.querySelectorAll('#type-filter button')) b.setAttribute('aria-pressed', String(b.dataset.type === prefs.type));
  for (const b of document.querySelectorAll('.songs-head .sorter')) {
    const on = b.dataset.sort === prefs.sort, up = !DESC.has(b.dataset.sort) !== prefs.sortRev; // up: A to Z, least first
    b.dataset.dir = on ? (up ? 'up' : 'down') : '';
    b.setAttribute('aria-pressed', String(on));
  }
  $('fav-filter').setAttribute('aria-pressed', String(prefs.favOnly));

  // From the couch, the list is long: the songs played last come first, on a shelf of their own, and the
  // rest is split into groups by what it's sorted on (initials, tunings, difficulty), to jump between.
  const shelf = !q && !prefs.favOnly && prefs.sort !== 'recent'
    ? list.filter(s => s.audio !== false && recent[s.id]).sort((a, b) => recent[b.id] - recent[a.id]).slice(0, SHELF) : [];
  const groupOf = {
    artist: s => initial(s.artist), title: s => initial(s.title), tuning: s => tuningName(s.tuning, stringsOf(s)),
    difficulty: s => (difficultyLevel(s.difficulty) ? `Difficulty ${difficultyLevel(s.difficulty)} of 5` : 'No difficulty rating'),
  }[prefs.sort];

  const el = $('song-list');
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest('#song-list .song');
  const keepId = keep && keep.dataset.id, keepShelf = keep && keep.classList.contains('shelved');
  el.innerHTML = list.length ? '' : !songs.length
    ? '<div class="empty"><p>No songs yet. PumaBass plays your own Rocksmith 2014 song files: show it where they are.</p><button class="primary" data-act="choose">Choose your songs folder</button></div>'
    : `<div class="empty">${q ? 'No songs match that search.' : prefs.favOnly ? 'No favorites here yet. Press <kbd>F</kbd> on a song, or its heart, to add it.' : 'No songs here.'}</div>`;
  const frag = document.createDocumentFragment();
  const head = text => { const h = document.createElement('div'); h.className = 'group'; h.appendChild(document.createElement('span')).textContent = text; frag.appendChild(h); };
  let group = null;
  if (shelf.length) head('Recently played');
  [...shelf.map(s => [s, true]), ...list.map(s => [s, false])].forEach(([s, shelved]) => {
    if (!shelved) {
      const g = groupOf ? groupOf(s) : shelf.length ? 'All songs' : null;
      if (g !== null && g !== group) { group = g; head(g); }
    }
    const row = document.createElement('div');
    row.className = 'song' + (s.audio === false ? ' noaudio' : '') + (shelved ? ' shelved' : '');
    row.tabIndex = 0;
    row.dataset.id = s.id;
    row.setAttribute('role', 'listitem');
    const tn = tuningName(s.tuning, stringsOf(s));
    const st = stats[s.id] || {}, fav = !!favs[s.id];
    const num = v => `<span class="num${v ? '' : ' zero'}">${v || '\u2013'}</span>`;
    const level = difficultyLevel(s.difficulty);
    row.innerHTML = `<button class="heart" data-fav aria-label="Favorite: ${esc(s.title)}" aria-pressed="${fav}" title="Favorite (F)" tabindex="-1"><span class="ico heart-ico" aria-hidden="true"></span></button>
      <div style="min-width:0"><div class="t"></div><div class="a"></div></div>
      <span class="arr"></span>
      <span class="diff" ${level ? `title="Difficulty ${level} of 5 (Rocksmith rates it ${s.difficulty.toFixed(2)})" aria-label="Difficulty ${level} of 5"` : 'aria-label="No difficulty rating"'}>${level ? `<span class="pips" aria-hidden="true">${[1, 2, 3, 4, 5].map(n => `<i${n <= level ? ' class="on"' : ''}></i>`).join('')}</span>` : '\u2013'}</span>
      <span class="tun${tn === 'E Standard' ? ' std' : ''}"></span>
      ${num(st.plays)}${num(st.finished)}
      <span class="len">${formatTime(s.length)}</span>`;
    row.querySelector('.t').textContent = s.title;
    row.querySelector('.a').textContent = `${s.artist}${s.album ? ' · ' + s.album : ''}${s.year ? ' (' + s.year + ')' : ''}`;
    row.querySelector('.arr').innerHTML = s.audio === false ? 'No audio' : esc(arrangementLabel(s)) + (s.audio === 'user' ? ' <span class="mine">· yours</span>' : '');
    row.querySelector('.tun').textContent = tn + (s.centOffset ? ` ${s.centOffset > 0 ? '+' : ''}${Math.round(s.centOffset)}¢` : '');
    if (s.audio === false) row.title = 'No audio for this song yet. Put a recording named like "Artist - Title.mp3" in the music folder, then Rescan.';
    frag.appendChild(row);
  });
  el.appendChild(frag);
  if (keepId) {
    const back = el.querySelector(`.song${keepShelf ? '.shelved' : ':not(.shelved)'}[data-id="${CSS.escape(keepId)}"]`) || el.querySelector(`.song[data-id="${CSS.escape(keepId)}"]`);
    const to = back || el.querySelector('.song');
    if (to) to.focus({ preventScroll: true }), to.scrollIntoView({ block: 'nearest' });
  }
  $('count').textContent = prefs.favOnly ? `${list.length} ${list.length === 1 ? 'favorite' : 'favorites'}` : partsLabel(list.length);
  const missing = ofType.filter(s => s.audio === false).length;
  $('missing-toggle').classList.toggle('hidden', !missing);
  $('missing-toggle').textContent = prefs.showMissing ? `Hide the ${missing} without audio` : `Show ${missing} without audio`;
}

/* Heart a part, from its row: the row stays where it is (it only leaves the
 * list when the favorites filter is on). */
export function heartRow(row) {
  const on = toggleFav(row.dataset.id);
  for (const b of $('song-list').querySelectorAll(`.song[data-id="${CSS.escape(row.dataset.id)}"] [data-fav]`)) {
    b.setAttribute('aria-pressed', String(on));
  }
  if (prefs.favOnly && !on) { const next = row.nextElementSibling || row.previousElementSibling; renderLibrary(); const n = next && $('song-list').querySelector(`.song[data-id="${CSS.escape(next.dataset.id || '')}"]`); if (n) n.focus({ preventScroll: true }); }
}

$('song-list').addEventListener('click', e => {
  if (e.target.closest('[data-act=choose]')) return pickLibrary();
  if (e.target.closest('[data-fav]')) { heartRow(e.target.closest('.song')); return; }
  const row = e.target.closest('.song');
  const s = row && songs.find(x => x.id === row.dataset.id);
  if (s && s.audio !== false) openSong(s);
});
$('search').addEventListener('input', renderLibrary);
$('missing-toggle').addEventListener('click', () => { prefs.showMissing = !prefs.showMissing; savePrefs(); renderLibrary(); });
$('library').querySelector('.songs-head').addEventListener('click', e => {
  const b = e.target.closest('.sorter');
  if (!b) return;
  if (b.dataset.sort === prefs.sort) prefs.sortRev = !prefs.sortRev;
  else { prefs.sort = b.dataset.sort; prefs.sortRev = false; }
  savePrefs(); renderLibrary();
});
$('fav-filter').addEventListener('click', () => { prefs.favOnly = !prefs.favOnly; savePrefs(); renderLibrary(); });
$('type-filter').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.type = b.dataset.type;
  savePrefs();
  renderLibrary();
});
$('library').querySelector('.bar').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'menu') { showTitle().reveal(); }
  else if (b.dataset.act === 'help') openHelp();
  else if (b.dataset.act === 'settings') openSettings();
  else if (b.dataset.act === 'rescan') {
    b.textContent = 'Scanning';
    try { await api('/api/rescan'); await loadLibrary(); }
    catch (err) { await alertSheet(err.message, "Can't rescan"); }
    b.textContent = 'Rescan';
  }
});

const SHELF = 4; // songs on the Recently played shelf
const initial = t => { const c = String(t || '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : c ? '#' : '#'; };
const DESC = new Set(['plays', 'finished', 'recent']); // sorts that put the most first
const SORTS = [['artist', 'artist'], ['title', 'title'], ['difficulty', 'difficulty'], ['tuning', 'tuning'], ['recent', 'recently played'], ['plays', 'most played']];
const PARTS = [['bass', 'Bass parts'], ['lead', 'Lead guitar parts'], ['rhythm', 'Rhythm guitar parts'], ['all', 'Every part']];

/* Focus a row and bring it into view; a group's first row shows its heading too. */
function focusRow(row) {
  row.focus({ preventScroll: true });
  const h = row.previousElementSibling;
  (h && h.classList.contains('group') ? h : row).scrollIntoView({ block: 'nearest' });
  row.scrollIntoView({ block: 'nearest' });
}

export function libraryKey(e, typing) {
  const k = e.key;
  const rows = [...$('song-list').querySelectorAll('.song')];
  const i = rows.indexOf(document.activeElement);
  const starts = () => rows.filter(r => { const h = r.previousElementSibling; return h && h.classList.contains('group'); });
  const page = () => Math.max(3, Math.floor($('library').clientHeight / (rows[0].offsetHeight || 50)) - 3);
  if (k === 'Escape') {
    e.preventDefault();
    if (typing && $('search').value) { $('search').value = ''; renderLibrary(); }
    else if (typing) $('search').blur();
    else showTitle().reveal();
  } else if (k === '/' && !typing) { e.preventDefault(); $('search').focus(); }
  else if ((k === '?' || k === 'h') && !typing) { e.preventDefault(); openHelp(); }
  else if ((k === 't' || k === 'T') && !typing) { e.preventDefault(); showTuner(); }
  else if (k === 'ArrowDown' && rows.length) { e.preventDefault(); focusRow(rows[Math.min(rows.length - 1, i + 1)]); }
  else if (k === 'ArrowUp' && rows.length && i >= 0) { e.preventDefault(); if (i === 0) { $('search').focus(); $('library').scrollTop = 0; } else focusRow(rows[i - 1]); }
  else if (k === 'PageDown' && rows.length && !typing) { e.preventDefault(); focusRow(rows[Math.min(rows.length - 1, Math.max(0, i) + page())]); }
  else if (k === 'PageUp' && rows.length && !typing) { e.preventDefault(); focusRow(rows[Math.max(0, i - page())]); }
  else if (k === 'Home' && rows.length && !typing) { e.preventDefault(); focusRow(rows[0]); $('library').scrollTop = 0; }
  else if (k === 'End' && rows.length && !typing) { e.preventDefault(); focusRow(rows[rows.length - 1]); }
  else if ((k === 'ArrowRight' || k === 'ArrowLeft') && rows.length && i >= 0) {
    // The next or previous group: the next initial, tuning or difficulty, as the list is sorted.
    e.preventDefault();
    const st = starts();
    const to = k === 'ArrowRight' ? st.find(r => rows.indexOf(r) > i) : st.filter(r => rows.indexOf(r) < i).pop();
    if (to) { focusRow(to); toast(to.previousElementSibling.textContent); }
  }
  else if ((k === 'o' || k === 'O') && !typing) {
    e.preventDefault();
    const n = SORTS[(SORTS.findIndex(([v]) => v === prefs.sort) + 1) % SORTS.length];
    prefs.sort = n[0]; prefs.sortRev = false; savePrefs(); renderLibrary(); toast(`Sorted by ${n[1]}`);
  }
  else if ((k === 'p' || k === 'P') && !typing) {
    e.preventDefault();
    const n = PARTS[(PARTS.findIndex(([v]) => v === prefs.type) + 1) % PARTS.length];
    prefs.type = n[0]; savePrefs(); renderLibrary(); toast(n[1]);
  }
  else if (k === 'F' && e.shiftKey && !typing) {
    e.preventDefault();
    prefs.favOnly = !prefs.favOnly; savePrefs(); renderLibrary(); toast(prefs.favOnly ? 'Favorites only' : 'All songs');
  }
  else if ((k === 's' || k === 'S') && !typing) { e.preventDefault(); openSettings(); }
  else if ((k === 'f' || k === 'F') && !typing && i >= 0) { e.preventDefault(); heartRow(rows[i]); }
  else if (k === 'Enter' && i >= 0) {
    const s = songs.find(x => x.id === rows[i].dataset.id);
    if (s && s.audio !== false) openSong(s);
  }
}
