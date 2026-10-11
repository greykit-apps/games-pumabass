// The song list, and choosing the songs folder.

import { tuningName, formatTime, arrangementLabel, difficultyLevel, numberAlternates } from './chart.js';
import { alertSheet } from './title.js';
import { api, WEB, SERVER_API, notInDemo } from './api.js';
import { $, esc, toast, screen, songs, info, setScreen, setLibrary, ownSongs } from './core.js';
import { DEMOS } from './demos.js';
import { MAKE } from './help.js';
import { showTuner } from './instrument.js';
import { showTitle, leaveTitle, openHelp, openSettings, partsLabel } from './menu.js';
import { openSong, scoreMode } from './player.js';
import { nearest } from './spatial.js';
import { KEY_RECENT, KEY_FAVS, KEY_STATS, load, prefs, savePrefs, toggleFav } from './store.js';

/* The songs folder, picked from this computer's folders through the server,
 * then scanned. From Settings, the title (with no songs yet) or the empty list. */
export async function pickLibrary() {
  if (WEB) return notInDemo('Choosing a Rocksmith folder');
  let chosen;
  try {
    chosen = await chooseFolder();
    if (!chosen) return;
    await loadLibrary();
  } catch (e) {
    await alertSheet(e.message, "Can't choose the songs folder");
    return;
  }
  const playable = songs.filter(s => s.audio !== false && (s.sources || []).includes('folder'));
  const bass = playable.filter(s => s.type === 'bass').length;
  const files = ((info.libraries || []).find(l => l.key === 'folder') || {}).files || 0;
  await alertSheet(files
    ? `Found ${new Set(playable.map(s => s.songKey)).size} songs with ${bass} bass parts in ${files} song ${files === 1 ? 'file' : 'files'}. They're on the Rocksmith folder tab of the song list.`
    : `No Rocksmith 2014 songs were found in ${chosen.libraryDir} or the folders inside it. Choose the folder that holds your .psarc song files.`, 'Rocksmith folder');
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
  const [list, about] = WEB ? [[], { api: SERVER_API, vgmstream: true, libraries: [] }]
    : await Promise.all([api('/api/songs'), api('/api/info')]);
  numberAlternates(list);
  setLibrary([...list, ...DEMOS], about); // the demo song comes with PumaBass: always there
  if (screen === 'library') renderLibrary();
}

export function showLibrary() {
  setScreen('library');
  // Score a song says so over the list; Learn a song is plain Songs.
  $('library').querySelector('.top h1').innerHTML = scoreMode ? 'Score a song' : 'Songs';
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

/* The libraries, each a tab on the song list and a folder the server reads
 * (server/library.js: SOURCES). A library with no songs in its folder has no
 * tab (your own Rocksmith folder: none until you choose one); All always does.
 * New isn't a folder: the songs whose files arrived in any of them lately, the newest first. */
const NEW_DAYS = 30;
export const LIBRARIES = [
  ['all', 'All'],
  ['new', 'New', `songs added in the last ${NEW_DAYS} days, the newest first`],
  ['music', 'Music', 'songs you made, and your recordings'],
  ['cdlc', 'CDLC', 'custom songs you download'],
  ['bundles', 'Bundles', 'Rocksmith 2014 song sets'],
  ['folder', 'Rocksmith folder', 'the Rocksmith folder chosen in Settings'],
  ['demo', 'Demo', 'the song that comes with PumaBass'],
];
// The demo (its tab, and in All) only until there are songs of your own.
const hasOwn = () => songs.some(s => !s.demo);
const inLibrary = (s, key) => (key === 'all' ? !s.demo || !hasOwn()
  : key === 'new' ? s.added > Date.now() - NEW_DAYS * 864e5 : (s.sources || ['folder']).includes(key));
const shownLibraries = () => LIBRARIES.filter(([k]) => k === 'all' || (k === 'demo' ? !hasOwn() : songs.some(s => inLibrary(s, k))));

export const stringsOf = s => (s.type === 'bass' ? 4 : 6);
export function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const recent = load(KEY_RECENT, {});
  const libs = shownLibraries();
  if (!libs.some(([k]) => k === prefs.library)) prefs.library = 'all'; // its folder was taken out of Settings
  const ofPart = songs.filter(s => prefs.type === 'all' || s.type === prefs.type);
  const ofType = ofPart.filter(s => inLibrary(s, prefs.library));
  const favs = load(KEY_FAVS, {}), stats = load(KEY_STATS, {});
  // Each tab counts the songs it would list, with these parts.
  const tabs = $('lib-tabs');
  tabs.innerHTML = libs.map(([k, name, about]) => {
    const n = new Set(ofPart.filter(s => inLibrary(s, k) && (prefs.showMissing || s.audio !== false)).map(s => s.songKey)).size;
    return `<button data-lib="${k}" aria-pressed="${k === prefs.library}" title="${esc(about ? `${name}: ${about}` : 'Every library')}"><span>${esc(name)}</span><small>${n}</small></button>`;
  }).join('');
  let list = ofType.filter(s => (prefs.showMissing || s.audio !== false) && (!prefs.favOnly || favs[s.id]));
  if (q) list = list.filter(s => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  const fresh = prefs.library === 'new', sort = fresh ? 'added' : prefs.sort; // New: always the newest first
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
    added: (a, b) => b.added - a.added || a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  }[sort] || (() => 0);
  const dir = prefs.sortRev && !fresh ? -1 : 1; // a second click on a heading: the other way round
  list.sort((a, b) => dir * (cmp(a, b) || arrangementLabel(a).localeCompare(arrangementLabel(b))));

  for (const b of document.querySelectorAll('#type-filter button')) b.setAttribute('aria-pressed', String(b.dataset.type === prefs.type));
  for (const b of document.querySelectorAll('.songs-head .sorter')) {
    const on = b.dataset.sort === sort, up = !DESC.has(b.dataset.sort) !== prefs.sortRev; // up: A to Z, least first
    b.dataset.dir = on ? (up ? 'up' : 'down') : '';
    b.setAttribute('aria-pressed', String(on));
    b.disabled = fresh;
  }
  $('fav-filter').setAttribute('aria-pressed', String(prefs.favOnly));

  // From the couch, the list is long: the songs played last come first, on a shelf of their own, and the
  // rest is split into groups by what it's sorted on (initials, tunings, difficulty), to jump between.
  // A list that fits on the screen needs no shelf.
  const shelf = !q && !prefs.favOnly && !fresh && prefs.sort !== 'recent' && list.length > 2 * SHELF
    ? list.filter(s => s.audio !== false && recent[s.id]).sort((a, b) => recent[b.id] - recent[a.id]).slice(0, SHELF) : [];
  const groupOf = {
    artist: s => initial(s.artist), title: s => initial(s.title), tuning: s => tuningName(s.tuning, stringsOf(s)),
    difficulty: s => (difficultyLevel(s.difficulty) ? `Difficulty ${difficultyLevel(s.difficulty)} of 5` : 'No difficulty rating'),
  }[sort];

  const el = $('song-list');
  const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest('#song-list .song');
  const keepId = keep && keep.dataset.id, keepShelf = keep && keep.classList.contains('shelved');
  const lib = LIBRARIES.find(([k]) => k === prefs.library);
  el.innerHTML = list.length ? '' : !songs.length
    ? `<div class="empty"><p>No songs yet. Make your own song files (<code>.psarc</code>) and put them in PumaBass's <code>music</code> folder, or download some into <code>cdlc</code>, then Rescan. It's also compatible with Rocksmith 2014's: put them in <code>bundles</code>, or show it a Rocksmith folder.</p><button class="primary" data-act="make">Make your own songs</button> <button data-act="choose">Choose a Rocksmith folder</button></div>`
    : `<div class="empty">${q ? 'No songs match that search.' : prefs.favOnly ? 'No favorites here yet. Press <kbd>F</kbd> on a song, or its heart, to add it.'
      : prefs.library !== 'all' && !ofType.length
        ? `None of the songs in ${esc(lib[1])} have ${esc(prefs.type)} parts. Choose All parts above, or another library.`
        : 'No songs here.'}</div>`;
  const frag = document.createDocumentFragment();
  const head = text => { const h = document.createElement('div'); h.className = 'group'; h.appendChild(document.createElement('span')).textContent = text; frag.appendChild(h); };
  let group = null;
  const groups = []; // for the index beside the list
  if (shelf.length) head('Recently played');
  [...shelf.map(s => [s, true]), ...list.map(s => [s, false])].forEach(([s, shelved]) => {
    if (!shelved) {
      const g = groupOf ? groupOf(s) : shelf.length ? 'All songs' : null;
      if (g !== null && g !== group) { group = g; head(g); groups.push(g); }
    }
    const row = document.createElement('div');
    row.className = 'song' + (s.audio === false ? ' noaudio' : '') + (shelved ? ' shelved' : '');
    row.tabIndex = 0;
    row.dataset.id = s.id;
    if (!shelved && group !== null) row.dataset.group = group;
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
  // Only the demo so far: say where your own songs go, under it.
  if (list.length && !ownSongs().length && !q && !prefs.favOnly) {
    const hint = document.createElement('div');
    hint.className = 'empty';
    hint.innerHTML = WEB
      ? `<p>This is PumaBass's web demo, with one song to play: <i>Gods of the Copybook Headings</i>, Kipling's poem set to music by Suno AI. On your own computer, PumaBass plays song files (<code>.psarc</code>) that you make yourself, and is also compatible with CustomsForge and Rocksmith 2014 songs.</p><button class="primary" data-act="make">Make your own songs</button>`
      : `<p>That's the demo song, to play while you set up. Make your own song files (<code>.psarc</code>) and put them in PumaBass's <code>music</code> folder, or download some into <code>cdlc</code>, then Rescan. It's also compatible with Rocksmith 2014's: put them in <code>bundles</code>, or show it a Rocksmith folder.</p><button class="primary" data-act="make">Make your own songs</button> <button data-act="choose">Choose a Rocksmith folder</button>`;
    frag.appendChild(hint);
  }
  el.appendChild(frag);
  buildIndex(groupOf ? groups : []);
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
  if (e.target.closest('[data-act=make]')) return openHelp(MAKE);
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
$('lib-tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.library = b.dataset.lib;
  savePrefs();
  renderLibrary();
});
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
  else if (b.dataset.act === 'rescan' && WEB) notInDemo('Rescan');
  else if (b.dataset.act === 'rescan') {
    b.textContent = 'Scanning';
    try { await api('/api/rescan'); await loadLibrary(); }
    catch (err) { await alertSheet(err.message, "Can't rescan"); }
    b.textContent = 'Rescan';
  }
});

/* The heading (title, tabs, search, columns) and the foot (Menu, Rescan...) stay put over the list, but
 * slide away while you go down it, for more of the list, and come back as soon as you go up, reach the
 * top, or use them (style.css: .lib-head, .head-away). A group's name stays at the top either way. */
const libEl = $('library'), libHead = libEl.querySelector('.lib-head'), libFoot = libEl.querySelector('.pb > .bar');
function headAway(on) { libEl.classList.toggle('head-away', on && libEl.scrollTop > libHead.offsetHeight); }
// Where the list was when you last scrolled it. Moving to a row scrolls too, but that isn't you
// scrolling (focusRow resets this), or bringing the foot back would nudge the list down and send it away.
let libLastY = 0;
{
  libEl.addEventListener('scroll', () => {
    const y = libEl.scrollTop, d = y - libLastY;
    if (Math.abs(d) < 4) return; // a nudge either way changes nothing
    headAway(d > 0);
    libLastY = y;
  }, { passive: true });
  // Tabbing to the search box, a tab or a button there: back it comes.
  libHead.addEventListener('focusin', () => headAway(false));
  libFoot.addEventListener('focusin', () => headAway(false));
}
/* The index beside the list: its groups as sorted (initials, tunings, difficulty), the one you're in lit.
 * Click one to go there, or press and slide along it to skim. (The keys do the same: Left / Right.) */
const libIndex = $('lib-index');
let indexRows = [];
const indexLabel = g => g.replace(/^Difficulty (\d) of 5$/, '$1').replace(/^No difficulty rating$/, '–').replace(/ Standard$/, ' Std');
function buildIndex(groups) {
  libIndex.hidden = groups.length < 2;
  libIndex.innerHTML = libIndex.hidden ? '' : groups.map(g => `<button tabindex="-1" data-g="${esc(g)}" title="${esc(g)}">${esc(indexLabel(g))}</button>`).join('');
  indexRows = [...$('song-list').querySelectorAll('.song[data-group]')];
  markIndex();
}
// Where the rows start: under the heading (when it's there) and the group's name pinned below it.
function rowsTop() {
  const away = libEl.classList.contains('head-away'), g = $('song-list').querySelector('.group');
  return (away ? libEl.getBoundingClientRect().top : libHead.getBoundingClientRect().bottom) + (g ? g.getBoundingClientRect().height : 0);
}
function markIndex() {
  if (libIndex.hidden || !indexRows.length) return;
  const y = rowsTop() + 2;
  let lo = 0, hi = indexRows.length - 1; // the first row not yet scrolled past
  while (lo < hi) { const m = (lo + hi) >> 1; if (indexRows[m].getBoundingClientRect().bottom > y) hi = m; else lo = m + 1; }
  const g = indexRows[lo].dataset.group;
  for (const b of libIndex.children) b.classList.toggle('on', b.dataset.g === g);
}
function jumpToGroup(g) {
  const row = indexRows.find(r => r.dataset.group === g);
  if (!row) return;
  const down = row.getBoundingClientRect().top > rowsTop();
  libEl.classList.toggle('head-away', down); // going down the heading goes; up, it comes back
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'start' });
  if (libEl.scrollTop <= libHead.offsetHeight) libEl.classList.remove('head-away');
  libLastY = libEl.scrollTop;
  markIndex();
}
{
  let ticking = false, scrub = false;
  libEl.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; markIndex(); });
  }, { passive: true });
  const at = e => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.closest && t.closest('#lib-index button'); };
  libIndex.addEventListener('pointerdown', e => {
    const b = at(e);
    if (!b) return;
    e.preventDefault();
    scrub = true;
    libIndex.setPointerCapture(e.pointerId);
    jumpToGroup(b.dataset.g);
  });
  libIndex.addEventListener('pointermove', e => { const b = scrub && at(e); if (b && !b.classList.contains('on')) jumpToGroup(b.dataset.g); });
  const stop = () => { scrub = false; };
  libIndex.addEventListener('pointerup', stop);
  libIndex.addEventListener('pointercancel', stop);
}

/* Their heights let a row brought into view clear them, and a group's name sit under the heading. */
{
  const lib = libEl, head = libHead, foot = libFoot;
  const measure = () => {
    const group = $('song-list').querySelector('.group');
    lib.style.setProperty('--lib-head-h', `${head.offsetHeight}px`);
    lib.style.setProperty('--lib-foot-h', `${foot.offsetHeight}px`);
    lib.style.setProperty('--lib-group-h', `${group ? group.offsetHeight : 0}px`); // some sorts have no groups
  };
  const seen = new ResizeObserver(measure);
  seen.observe(head);
  seen.observe(foot);
  new MutationObserver(measure).observe($('song-list'), { childList: true });
}

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
  libLastY = libEl.scrollTop;
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
  else if (k === 'ArrowDown' && rows.length && i === rows.length - 1) {
    // Past the last song: down to the buttons at the foot of the list.
    e.preventDefault();
    const to = nearest($('library').querySelector('.bar'), rows[i], k);
    if (to) { to.focus({ preventScroll: true }); to.scrollIntoView({ block: 'nearest' }); }
  }
  // Going down the list the heading slides away; going up it comes back (headAway), before the row is
  // brought into view, so the row lands clear of it.
  else if (k === 'ArrowDown' && rows.length) { e.preventDefault(); headAway(true); focusRow(rows[Math.min(rows.length - 1, i + 1)]); }
  else if (k === 'ArrowUp' && rows.length && i >= 0) { e.preventDefault(); headAway(false); if (i === 0) { $('search').focus(); $('library').scrollTop = 0; } else focusRow(rows[i - 1]); }
  else if (k === 'PageDown' && rows.length && !typing) { e.preventDefault(); headAway(true); focusRow(rows[Math.min(rows.length - 1, Math.max(0, i) + page())]); }
  else if (k === 'PageUp' && rows.length && !typing) { e.preventDefault(); headAway(false); focusRow(rows[Math.max(0, i - page())]); }
  else if (k === 'Home' && rows.length && !typing) { e.preventDefault(); headAway(false); focusRow(rows[0]); $('library').scrollTop = 0; }
  else if (k === 'End' && rows.length && !typing) { e.preventDefault(); headAway(true); focusRow(rows[rows.length - 1]); }
  else if ((k === 'ArrowRight' || k === 'ArrowLeft') && rows.length && i >= 0) {
    // The next or previous group: the next initial, tuning or difficulty, as the list is sorted.
    e.preventDefault();
    const st = starts();
    const to = k === 'ArrowRight' ? st.find(r => rows.indexOf(r) > i) : st.filter(r => rows.indexOf(r) < i).pop();
    headAway(k === 'ArrowRight');
    if (to) { focusRow(to); toast(to.previousElementSibling.textContent); }
  }
  else if ((k === 'o' || k === 'O') && !typing && prefs.library !== 'new') { // New stays newest first
    e.preventDefault();
    const n = SORTS[(SORTS.findIndex(([v]) => v === prefs.sort) + 1) % SORTS.length];
    prefs.sort = n[0]; prefs.sortRev = false; savePrefs(); renderLibrary(); toast(`Sorted by ${n[1]}`);
  }
  else if ((k === 'p' || k === 'P') && !typing) {
    e.preventDefault();
    const n = PARTS[(PARTS.findIndex(([v]) => v === prefs.type) + 1) % PARTS.length];
    prefs.type = n[0]; savePrefs(); renderLibrary(); toast(n[1]);
  }
  else if ((k === 'l' || k === 'L') && !typing) {
    e.preventDefault();
    const libs = shownLibraries();
    const n = libs[(libs.findIndex(([v]) => v === prefs.library) + 1) % libs.length];
    prefs.library = n[0]; savePrefs(); renderLibrary(); toast(n[0] === 'all' ? 'All libraries' : n[1]);
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
