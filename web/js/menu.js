// The title screen, its Settings sheet, and Help.

import { formatTime } from './chart.js';
import { mountTitle, alertSheet, confirmSheet, gkIntegrate } from './title.js';
import { toggles, tick } from './title-sound.js';
import { mountScene } from './scene.js';
import { HELP, ABOUT, MAKE } from './help.js';
import { api, WEB, notInDemo } from './api.js';
import { $, highway, esc, fmtMs, songs, ownSongs, info, setScreen } from './core.js';
import { inputStatus, chooseInput, showTuner } from './instrument.js';
import { pickLibrary, loadLibrary, showLibrary } from './library-screen.js';
import { openSong, syncPlayerPrefs, setScoreMode } from './player.js';
import { KEY_RESUME, load, prefs, savePrefs, forgetEverything, applyScreen } from './store.js';
import { runCalibration } from './sync-test.js';
import { STRING_COLORS } from './highway.js';

export let title = null; // the title screen, while it is up

/* Score a song's note on the menu: scoring listens to your bass, so until an input is chosen
 * it says so (and choosing Score a song opens Settings instead). */
const scoreMeta = () => (prefs.input ? '' : 'Choose input');
function refreshScoreMeta() {
  const b = $('title-host') && $('title-host').querySelector('.gk-menu [data-act="score"]');
  if (!b) return;
  let m = b.querySelector('.gk-meta');
  if (!scoreMeta()) { if (m) m.remove(); return; }
  if (!m) { m = document.createElement('span'); m.className = 'gk-meta'; b.appendChild(m); }
  m.textContent = scoreMeta();
}

export function titleCfg() {
  const resume = load(KEY_RESUME, null);
  const rs = resume && songs.find(s => s.id === resume.id && s.audio !== false);
  const parts = playableParts().length;
  return {
    name: 'PumaBass',
    lines: ['Puma', 'Bass'],
    items: [
      rs && { act: 'resume', label: 'Resume game', key: 'R', meta: `${rs.title} · ${formatTime(resume.t)}` },
      { act: 'new', label: 'Learn a song', key: 'N', meta: ownSongs().length ? partsLabel(parts) : WEB ? 'demo' : 'demo library' },
      { act: 'score', label: 'Score a song', key: 'C', meta: scoreMeta() },
      { act: 'tuner', label: 'Tuner', key: 'T' },
      { act: 'sync', label: 'Sync', key: 'Y', meta: prefs.avOffset || prefs.inputOffset ? `notes ${fmtMs(prefs.avOffset)}${prefs.inputOffset ? ` \u00b7 cable ${fmtMs(prefs.inputOffset)}` : ''}` : '' },
      'gap',
      { act: 'settings', label: 'Settings', key: 'S' },
      { act: 'help', label: 'Help', key: '?' },
      { act: 'about', label: 'About', key: 'A' },
    ],
    primary: rs ? 'resume' : 'new',
    scene: el => mountScene(el, 'pb-beam', { live: true }),
    help: HELP,
    about: ABOUT,
    settings: { html: settingsHTML, onClick: settingsClick },
    onAct: act => {
      if (act === 'resume' && rs) { setScoreMode(resume.scored); leaveTitle(); openSong(rs, resume.t, { resumed: true }); }
      if (act === 'tuner') showTuner();
      if (act === 'sync') runCalibration();
      // No input to score from yet: Settings, with Choose input to hand.
      if (act === 'score' && !prefs.input) {
        const b = $('title-host').querySelector('.gk-menu [data-act="settings"]');
        if (b) { b.click(); const c = document.querySelector('.gk-sheet [data-set="input"]'); if (c) c.focus(); }
        return;
      }
      // Learn a song plays along; Score a song scores. The song list is the same.
      if (act === 'new' || act === 'score') {
        setScoreMode(act === 'score');
        leaveTitle(); showLibrary(); // with no songs of your own, the demo, and where yours go
      }
    },
  };
}

/* Esc twice on the menu: quit. The first asks, for a few seconds; the second stops the
 * server and closes the window (in a browser that won't let a page close its own tab, the
 * page says it has stopped instead). */
let quitAsked = 0;
export function titleEscape() {
  if (WEB) return; // a web page: nothing to quit
  const now = performance.now();
  if (now - quitAsked < 3000) { quitAsked = 0; quitGame(); return; }
  quitAsked = now;
  let el = document.querySelector('.quit-ask');
  if (!el) { el = document.createElement('div'); el.className = 'quit-ask'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = 'Press <kbd>Esc</kbd> again to quit PumaBass';
  el.classList.remove('gone');
  clearTimeout(el.timer);
  el.timer = setTimeout(() => { el.classList.add('gone'); quitAsked = 0; }, 3000);
}
// A sheet opened meanwhile (Settings, say) takes Esc for itself: the question goes.
new MutationObserver(() => {
  const ask = document.querySelector('.quit-ask');
  if (ask && !ask.classList.contains('gone') && document.querySelector('.gk-sheet')) { ask.classList.add('gone'); quitAsked = 0; }
}).observe(document.body, { childList: true });
async function quitGame() {
  const ask = document.querySelector('.quit-ask');
  if (ask) ask.remove();
  const el = document.createElement('div');
  el.className = 'quit-done';
  el.setAttribute('role', 'status');
  el.innerHTML = '<h1>PumaBass has stopped</h1><p>Close this window, or just turn off the TV. Starting PumaBass again starts it all again.</p>';
  document.body.appendChild(el);
  try { await fetch('/api/quit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* already gone */ }
  window.close();
}

/* The title. The first time, the intro (app.js) brings it in, with its switch and ticks;
 * coming back to it, they come with it here. */
export let titleSwitches = null; // the Sound switch's { refresh() }
export function showTitle({ intro = false } = {}) {
  setScreen('title');
  $('library').classList.add('hidden');
  $('player').classList.add('hidden');
  title = mountTitle($('title-host'), titleCfg());
  if (!intro) titleSwitches = integrateTitle();
  return title;
}
/* The credit under the menu, the Sound switch top right and the ticks (gk-intro.js: gkIntegrate). A
 * row's tick is its note on the way down the menu: which row comes first, then the tick. */
export function integrateTitle() {
  const el = $('title-host').querySelector('.gk-title');
  let row = 0;
  const which = ev => {
    const b = ev.target.closest && ev.target.closest('.gk-menu button');
    if (b) row = [...el.querySelectorAll('.gk-menu button')].indexOf(b);
    else if (ev.target.closest && ev.target.closest('.gki-tg')) row = 7;
  };
  el.addEventListener('pointerover', which);
  el.addEventListener('focusin', which);
  return gkIntegrate(el, { toggles, tick: () => tick(row) });
}
/* M on the title: the title's sound on or off (its switch shows the key). */
export function titleSoundKey() {
  toggles.sound.set(!toggles.sound.get());
  if (titleSwitches) titleSwitches.refresh();
}
export function setTitleSwitches(sw) { titleSwitches = sw; }
export function leaveTitle() {
  if (title) title.unmount();
  title = null;
  $('title-host').innerHTML = '';
}

/* How many songs and parts the library holds, in the same words everywhere:
 * the menu, the song list, Settings and the boot ("315 bass parts"). */
export function partsLabel(n) {
  return `${n} ${prefs.type === 'all' ? '' : prefs.type + ' '}${n === 1 ? 'part' : 'parts'}`;
}
const playableParts = () => ownSongs().filter(s => (prefs.type === 'all' || s.type === prefs.type) && s.audio !== false);
/* "299 songs, 315 bass parts on 290 of them": the boot and Settings. (The song list's All tab
 * counts the songs with such a part, so that number is here too.) */
export function libraryLabel() {
  const playable = ownSongs().filter(s => s.audio !== false), parts = playableParts();
  const all = new Set(playable.map(s => s.songKey)).size, withPart = new Set(parts.map(s => s.songKey)).size;
  return `${all} songs, ${partsLabel(parts.length)}${withPart < all ? ` on ${withPart} of them` : ''}`;
}

/* Settings is for setting up: the songs, the input, the screen, the highway.
 * What changes from song to song (the mix, recorded bass) lives in the
 * player's Mix panel. */
/* Settings that read better as a picture than a name: drawn the way the game draws
 * them, the name kept as the button's tooltip and label. Drawn on 72 x 40, shown a
 * quarter larger. */
const SVG = body => `<svg viewBox='0 0 72 40' width='90' height='50' aria-hidden='true'>${body}</svg>`;
const SC = STRING_COLORS;
// A glass note of the A string, carrying a fret number, a note name, or nothing.
const gemPic = t => SVG(`<rect x='14' y='8' width='44' height='24' rx='5' fill='${SC[1]}' fill-opacity='.42' stroke='${SC[1]}' stroke-width='2'/>${t
  ? `<text x='36' y='26.5' text-anchor='middle' font-size='17' font-weight='700' fill='#fff' font-family='Saira, system-ui, sans-serif'>${t}</text>` : ''}`);
// The four strings, low E (red) on top or at the bottom.
const stringsPic = lowOnTop => SVG((lowOnTop ? [0, 1, 2, 3] : [3, 2, 1, 0]).map((st, i) => `<text x='6' y='${10.5 + i * 9}' text-anchor='middle'
  font-size='9' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>${'EADG'[st]}</text>
<line x1='14' y1='${7 + i * 9}' x2='70' y2='${7 + i * 9}' stroke='${SC[st]}' stroke-width='3'/>`).join(''));
// A staff (five lines from y0, gap apart); a note head with its stem.
const staff = (y0, gap) => [0, 1, 2, 3, 4].map(i => `<line x1='4' y1='${y0 + i * gap}' x2='68' y2='${y0 + i * gap}' stroke='currentColor' stroke-opacity='.6'/>`).join('');
const head = (x, y, stem) => `<ellipse cx='${x}' cy='${y}' rx='4.6' ry='3.4' transform='rotate(-20 ${x} ${y})' fill='currentColor'/><line x1='${x + 4.2}' y1='${y}' x2='${x + 4.2}' y2='${y - stem}' stroke='currentColor' stroke-width='1.3'/>`;
const tabNum = (n, x, y) => `<text x='${x}' y='${y + 4}' text-anchor='middle' font-size='12' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>${n}</text>`;
const PICS = {
  fret: gemPic('5'), name: gemPic('D'), off: gemPic(''),
  lowTop: stringsPic(true), lowBottom: stringsPic(false),
  notationStaff: SVG(staff(8, 6) + head(26, 26, 18) + head(46, 17, 16)),
  // tab: four lines, broken where its fret numbers sit
  notationTab: SVG([9, 17, 25, 33].map(y => y === 25 ? `<line x1='4' y1='${y}' x2='20' y2='${y}' stroke='currentColor' stroke-opacity='.6'/><line x1='32' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`
    : y === 17 ? `<line x1='4' y1='${y}' x2='42' y2='${y}' stroke='currentColor' stroke-opacity='.6'/><line x1='54' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`
    : `<line x1='4' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.6'/>`).join('') + tabNum(5, 26, 25) + tabNum(7, 48, 17)),
  staffNames: SVG(staff(4, 4.5) + head(36, 15.25, 13) + `<text x='36' y='37' text-anchor='middle' font-size='11' font-weight='700' fill='currentColor' font-family='Saira, system-ui, sans-serif'>D</text>`),
  // the view: the highway (a lane running away, notes coming down it to the strings)...
  highway: SVG(`<polygon points='6,26 66,26 42,3 30,3' fill='currentColor' fill-opacity='.1'/>${
    [[6, 30], [26, 34], [46, 38], [66, 42]].map(([b, t]) => `<line x1='${b}' y1='26' x2='${t}' y2='3' stroke='currentColor' stroke-opacity='.3'/>`).join('')
  }${[0, 1, 2, 3].map(st => `<line x1='2' y1='${28 + st * 3}' x2='70' y2='${28 + st * 3}' stroke='${SC[st]}' stroke-width='2'/>`).join('')
  }${[[38, 4, 5, 3, 0], [28, 9, 8, 5, 2], [41, 16, 13, 7, 1]].map(([x, y, w, h, st]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${h / 3}' fill='${SC[st]}' fill-opacity='.45' stroke='${SC[st]}' stroke-width='1.4'/>`).join('')}`),
  // ...or tab in its place: two lines of it, chips in the strings' colours, the playhead on the top line
  tab: SVG(`${[5, 9, 13, 17, 23, 27, 31, 35].map(y => `<line x1='4' y1='${y}' x2='68' y2='${y}' stroke='currentColor' stroke-opacity='.5'/>`).join('')
  }${[[12, 13, 1], [24, 17, 0], [44, 9, 2], [56, 13, 1], [12, 31, 1], [24, 35, 0], [38, 27, 2], [52, 23, 3]].map(([x, y, st]) => `<rect x='${x - 3.5}' y='${y - 2.5}' width='7' height='5' rx='1.5' fill='${SC[st]}'/>`).join('')
  }<line x1='34' y1='2' x2='34' y2='20' stroke='currentColor' stroke-width='1.6'/>`),
};
const picBtn = (attrs, label, pic) => `<button class='pic' ${attrs} title='${label}' aria-label='${label}'>${pic}</button>`;

export function settingsHTML() {
  const pick = (set, opts, cur, tip = '') => `<div class='gk-row'${tip ? ` title='${tip}'` : ''}>${opts.map(([v, l, pic]) => pic
    ? picBtn(`data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'`, l, pic)
    : `<button data-set='${set}' data-v='${v}' aria-pressed='${String(cur) === String(v)}'>${l}</button>`).join('')}</div>`;
  const row = (label, body) => `<span class='set-label'>${label}</span><div class='set-cell'>${body}</div>`;
  // The libraries: PumaBass's own folders, and a Rocksmith folder of your choice (optional).
  const have = WEB ? 'The web demo: the demo song only' : ownSongs().length ? libraryLabel() : 'No songs yet';
  const folder = !info.libraryDir ? 'Rocksmith folder: none chosen'
    : `Rocksmith folder: <code>${esc(info.libraryDir)}</code>${info.libraryFound ? '' : ' · that folder is missing'}`;
  // Two columns, so it all fits on the TV without scrolling (style.css: .set-cols): what
  // PumaBass is set up with, and how you like to play. Forget everything on its own at the foot.
  return `<div class='set-cols'><section class='set-col'><h3>App</h3><div class='set-grid'>
${row('Songs', `<p class='set-val'>${have}, from the music, cdlc and bundles folders${info.libraryDir ? ' and your Rocksmith folder' : ''}</p><p class='set-val'>${folder}</p><div class='gk-row' title='Song files (.psarc) you make go in the music folder beside PumaBass, downloads in cdlc. Rocksmith 2014 songs work too: in bundles, or a Rocksmith folder of your own on its own tab. Rescan after adding songs.'><button data-set='make'>Make your own</button><button data-set='rescan'>Rescan</button><button data-set='library'>${info.libraryDir ? 'Change Rocksmith folder' : 'Choose Rocksmith folder'}</button>${info.libraryDir ? "<button data-set='unlibrary'>Remove it</button>" : ''}</div>`)}
${row('Input', `<p class='set-val'>${inputStatus()}</p><div class='gk-row'><button data-set='input'>Choose input</button></div>`)}
${row('Tuner', `<div class='gk-row'><button data-set='tuner' title='Tune to the song with the Real Tone Cable; it opens by itself when a song needs another tuning'>Open tuner</button></div>`)}
${row('Sync', `<div class='gk-row'><button data-set='sync' title='Line up the sound and the picture, and the cable'>Run sync</button><span class='set-val inline'>${
  prefs.avOffset || prefs.inputOffset ? `notes ${fmtMs(prefs.avOffset)}${prefs.inputOffset ? ` \u00b7 cable ${fmtMs(prefs.inputOffset)}` : ''}` : 'not run yet'}</span></div>`)}
${row('Screen', pick('screen', [['couch', 'TV'], ['desk', 'Computer']], prefs.screen, 'TV draws everything larger, to read from across the room'))}
</div></section><section class='set-col'><h3>Playing</h3><div class='set-grid'>
${row('View', pick('view', [['highway', 'Highway', PICS.highway], ['tab', 'Tab', PICS.tab]], prefs.view, 'Play from the note highway, or from tab in its place (V while you play)'))}
${row('Lyrics', pick('lyrics', [['true', 'On'], ['false', 'Off']], prefs.lyrics, 'The words at the top, a line at a time, for songs that have them (Y while you play)'))}
${row('Look ahead', pick('lookahead', [[2, '2s'], [3, '3s'], [4, '4s'], [5, '5s']], prefs.lookahead, 'How far ahead the highway shows the notes'))}
${row('Strings', pick('invert', [['true', 'Low string on top', PICS.lowTop], ['false', 'Low string at the bottom', PICS.lowBottom]], prefs.invert))}
${row('Notes', pick('labels', [['off', 'Plain notes', PICS.off], ['fret', 'Fret numbers', PICS.fret], ['name', 'Note names', PICS.name]], prefs.noteLabels))}
${row('Hand', pick('lefty', [['false', 'Right'], ['true', 'Left']], prefs.lefty, 'Left mirrors the highway, the nut on the right; tab and notation read the same either way'))}
${row('Notation', `<div class='gk-row' title='Over the highway (N while you play)'><span class='join'>${picBtn(`data-set='notationStaff' aria-pressed='${prefs.notation && prefs.notationStaff}'`, 'Standard notation', PICS.notationStaff)}${
  picBtn(`data-set='staffNames' aria-pressed='${prefs.staffNames}'${prefs.notation && prefs.notationStaff ? '' : ' disabled'}`, 'Names under the notes', PICS.staffNames)}</span>${
  picBtn(`data-set='notationTab' aria-pressed='${prefs.notation && prefs.notationTab}'`, 'Tab', PICS.notationTab)}</div>`)}
${row('Start speed', pick('speed', [[50, '50%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']], prefs.startSpeed, 'Every song starts at this speed; Up and Down change it while you play'))}
</div></section></div>
<div class='set-foot'><button data-set='forget' class='quiet' title='Clears your favorites, play counts, audio offsets, recent songs, where you left off and these settings. Your songs, recordings and decoded audio are not touched.'>Forget everything</button></div>`;
}

export async function settingsClick(b, sheet) {
  const v = b.dataset.v;
  if (WEB && ['rescan', 'library', 'unlibrary'].includes(b.dataset.set)) {
    sheet.close();
    notInDemo(b.dataset.set === 'rescan' ? 'Rescan' : 'Choosing a Rocksmith folder');
    return;
  }
  switch (b.dataset.set) {
    case 'lookahead': prefs.lookahead = Number(v); highway.lookahead = prefs.lookahead; break;
    case 'invert': prefs.invert = v === 'true'; highway.invert = prefs.invert; break;
    case 'lefty': prefs.lefty = v === 'true'; highway.lefty = prefs.lefty; break;
    case 'labels': prefs.noteLabels = v; highway.labels = prefs.noteLabels; break;
    case 'view': prefs.view = v; break;
    case 'lyrics': prefs.lyrics = v === 'true'; break;
    case 'staffNames': prefs.staffNames = !prefs.staffNames; break;
    case 'notationStaff': case 'notationTab': {
      // One toggle each; the band shows while either is on (N may have turned the band off with both set).
      const k = b.dataset.set;
      if (!prefs.notation) { prefs.notationStaff = prefs.notationTab = false; prefs[k] = true; }
      else prefs[k] = !prefs[k];
      prefs.notation = prefs.notationStaff || prefs.notationTab;
      break;
    }
    case 'speed': prefs.startSpeed = Number(v); break;
    case 'screen': prefs.screen = v; applyScreen(); break;
    case 'rescan':
      b.textContent = 'Scanning';
      try { await api('/api/rescan', { method: 'POST' }); await loadLibrary(); }
      catch (e) { sheet.close(); await alertSheet(e.message, "Can't rescan"); return; }
      break;
    case 'library':
      sheet.close();
      pickLibrary();
      return;
    case 'unlibrary':
      // Stop listing your own Rocksmith folder; its files are not touched.
      b.textContent = 'Removing';
      try {
        await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: null }) });
        await loadLibrary();
      } catch (e) { sheet.close(); await alertSheet(e.message, "Can't remove the Rocksmith folder"); return; }
      break;
    case 'make':
      sheet.close();
      openHelp(MAKE);
      return;
    case 'input':
      sheet.close();
      // With an input chosen, the next thing is to tune to it.
      chooseInput().then(async ok => { refreshScoreMeta(); if (ok && await confirmSheet('Your input is set. Tune up now?', 'Open the tuner', 'Instrument input')) showTuner(); });
      return;
    case 'tuner':
      sheet.close();
      showTuner();
      return;
    case 'sync':
      sheet.close();
      runCalibration();
      return;
    case 'forget':
      if (await sheet.confirm('Forget everything PumaBass has saved in this browser: your favorites and play counts, every audio offset, your recent songs and where you left off, and your settings? This cannot be undone.', 'Forget everything')) forgetEverything();
      return;
    default: return;
  }
  savePrefs();
  syncPlayerPrefs();
  // The title's own sheet redraws without keeping the focus: put it back on the button pressed.
  const f = document.activeElement && document.activeElement.dataset, at = f && JSON.stringify({ ...f });
  sheet.refresh();
  if (at && document.activeElement === document.body) {
    const same = [...document.querySelectorAll('.gk-sheet button')].find(b => JSON.stringify({ ...b.dataset }) === at);
    if (same) same.focus({ preventScroll: true });
  }
}


/* Keys inside any sheet: Page Up/Down (and Space when no button has it) scroll its body.
 * (The arrows move the focus and scroll, in app.js.) true when the key was one of these. */
export function sheetKeys(e, el) {
  const t = e.target, body = el.querySelector('.gk-body');
  if (e.defaultPrevented || (t.closest && t.closest('input, select, textarea'))) return false;
  if (!body) return false;
  const step = { PageDown: body.clientHeight * 0.85, PageUp: -body.clientHeight * 0.85 }[e.key]
    ?? (e.key === ' ' && !(t.closest && t.closest('button')) ? body.clientHeight * 0.85 : null);
  if (step === null) return false;
  e.preventDefault();
  body.scrollBy({ top: step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
}

/* A sheet of the title's style over the song list or the player: Help and
 * Settings away from the title. Tab stays inside it; Esc, × or a click
 * outside closes it, and focus goes back where it was. */
function openSheet(name, draw, onClick) {
  if (document.querySelector('.gk-sheet')) return null;
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'gk-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', name);
  const paint = () => { el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>${esc(name)}</h2><button data-x aria-label="Close">&times;</button></div>${draw()}</div>`; };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.remove();
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };
  const onKey = e => {
    if ([...document.querySelectorAll('.gk-sheet')].pop() !== el) return; // a question asked over it has the keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (sheetKeys(e, el)) { e.stopPropagation(); return; }
    if (e.key === 'Tab') {
      const bs = [...el.querySelectorAll('button, input, select')], i = bs.indexOf(document.activeElement);
      e.preventDefault();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    }
    e.stopPropagation();
  };
  const sheet = { el, close, refresh: () => { const f = document.activeElement && document.activeElement.dataset; const at = f && JSON.stringify({ ...f }); paint(); const same = at && [...el.querySelectorAll('button')].find(b => JSON.stringify({ ...b.dataset }) === at); (same || el.querySelector('[data-x]')).focus({ preventScroll: true }); },
    confirm: (q, yes) => confirmSheet(q, yes) };
  el.addEventListener('click', e => {
    if (e.target === el) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) return close();
    onClick(b, sheet);
  });
  paint();
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(el);
  return sheet;
}

/* Help from the song list or the player. */
export function openHelp(start) {
  let tab = Math.max(0, HELP.findIndex(([t]) => t === start));
  const sheet = openSheet('Help', () => `<div class="gk-tabs" role="tablist">${HELP.map(([t], i) => `<button role="tab" data-tab="${i}" aria-selected="${i === tab}" aria-pressed="${i === tab}">${esc(t)}</button>`).join('')}</div>
      <div class="gk-body">${HELP[tab][1]}</div>`, (b, sh) => {
    if (b.dataset.tab !== undefined) { tab = Number(b.dataset.tab); sh.refresh(); sh.el.querySelector(`[data-tab="${tab}"]`).focus(); }
  });
  if (sheet) sheet.el.querySelector('[aria-selected="true"]').focus();
}

/* Settings from the song list or the player: the title's own, in a sheet of their own. */
export function openSettings() {
  const sheet = openSheet('Settings', () => `<div class="gk-body">${settingsHTML()}</div>`, settingsClick);
  if (sheet) (sheet.el.querySelector('.gk-body button') || sheet.el.querySelector('[data-x]')).focus();
}
