// The end screen, when a song is over.

import { tuningName, formatTime, arrangementLabel } from './chart.js';
import { $, highway, input, esc } from './core.js';
import { showLessons } from './lessons-screen.js';
import { showLibrary } from './library-screen.js';
import { showTitle } from './menu.js';
import { chart, song, session, openSong, leaveSong, scorer } from './player.js';
import { KEY_STATS, load, save, prefs, statsOf } from './store.js';
import { saveTake } from './takes.js';

/* ---- the end screen: what this play was, and (to come) its score ---- */
export let endScreen = null;

export function showEndScreen() {
  if (endScreen || !song || !chart) return;
  const st = statsOf(song.id);
  const notes = highway.notes.reduce((n, e) => n + (e.notes ? e.notes.length : 1), 0);
  const played = session ? session.heard : 0;
  const finished = !!(session && session.finished);
  const tn = tuningName(chart.tuning, chart.strings);
  const tile = (label, value, note = '') => `<div class="end-tile"><small>${label}</small><span>${value}</span>${note ? `<em>${note}</em>` : ''}</div>`;
  const sc = scorer && scorer.judged ? scorer : null;
  const pct = sc ? Math.round(sc.accuracy * 100) : null;
  // A best only counts for a full play: finished, with most of the notes judged.
  let best = st.best ?? null, newBest = false;
  if (sc && finished && sc.judged >= 0.8 * highway.notes.length && (best === null || pct > best)) {
    newBest = best !== null;
    best = pct;
    const all = load(KEY_STATS, {});
    all[song.id] = { ...(all[song.id] || {}), best: pct };
    save(KEY_STATS, all);
  }
  const timing = sc && sc.timing();
  const scoreNote = sc ? `${sc.hits} of ${sc.judged} notes hit${newBest ? ' \u00b7 a new best' : ''}`
    : !prefs.scoring ? 'Scoring is off. Turn it on in Settings, or the Mix panel (,).'
      : !input.open ? 'Plug in the Real Tone Cable (or choose an input in Settings) to have your playing scored.'
        : 'No notes were scored this time.';
  // Each section's accuracy, as a strip along the song.
  const len = chart.songLength;
  const strip = sc ? `<div class="end-strip" aria-label="Accuracy by section">${chart.sections.map((x, i) => {
    const r = sc.sections.get(i);
    const a = r && r.judged ? r.hits / r.judged : null;
    const color = a === null ? 'var(--line)' : `hsl(${Math.round(a * a * 120)}, 70%, 48%)`;
    return `<i style="width:${((x.end - x.t) / len) * 100}%;background:${color}" title="${esc(x.name)}${a === null ? '' : ` \u00b7 ${Math.round(a * 100)}%`}"></i>`;
  }).join('')}</div><p class="end-strip-note">by section: red is where to practise</p>` : '';
  const el = document.createElement('div');
  el.className = 'gk-sheet end-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Song complete');
  el.innerHTML = `<div class="gk-box end">
    <div class="end-head">
      <p class="end-kicker">Song complete</p>
      <h2 class="end-title">${esc(song.title)}</h2>
      <p class="end-sub">${esc(song.artist)} &middot; ${esc(arrangementLabel(song))} &middot; ${esc(tn)}</p>
    </div>
    <div class="end-score">
      <small>Score</small>
      <span class="end-score-value">${pct === null ? '&ndash;' : `${pct}%`}</span>
      <em>${scoreNote}</em>
      ${strip}
    </div>
    <div class="end-tiles">
      ${tile('Notes', notes, `at ${prefs.difficulty}% difficulty`)}
      ${tile('Speed', `${$('speed').value}%`)}
      ${tile('Played', formatTime(played), `of ${formatTime(session ? session.end - session.start : chart.songLength)}`)}
      ${tile('Finished', finished ? 'Counted &#10003;' : 'Not counted', finished ? '' : 'less than half was played')}
      ${tile('Plays', st.plays || 0, 'all time')}
      ${tile('Times finished', st.finished || 0, 'all time')}
      ${sc ? tile('Best streak', sc.best, `of ${sc.judged} notes`) : ''}
      ${sc ? tile('Timing', timing ? (Math.abs(timing.ms) < 10 ? 'On the beat' : `${Math.round(Math.abs(timing.ms))} ms ${timing.ms > 0 ? 'late' : 'early'}`) : '\u2013', timing ? `typical, give or take ${Math.round(timing.spread)} ms` : 'too few plucks to tell') : ''}
      ${sc || best !== null ? tile('Best', best === null ? '\u2013' : `${best}%`, 'full plays') : ''}
    </div>
    <div class="gk-row end-acts">
      <button class="primary" data-end="menu"><kbd>Space</kbd>Main menu</button>
      <button data-end="again"><kbd>R</kbd>Play again</button>
      <button data-end="list"><kbd>Esc</kbd>${song.lessonCtx ? 'The lesson' : 'Song list'}</button>
      ${input.tape && input.tape.samples ? '<button data-end="take" title="Saves what the cable heard, with how each note was judged, in the PumaBass folder (takes), for tuning the scoring"><kbd>S</kbd>Save take</button>' : ''}
    </div>
  </div>`;
  const act = what => {
    const s = song;
    if (what === 'menu') { leaveSong(); showTitle().reveal(); }
    else if (what === 'list' && s.lessonCtx) { leaveSong(); showLessons(s.lessonCtx.key, s.lessonCtx.part); }
    else if (what === 'list') { leaveSong(); showLibrary(); }
    else if (what === 'again') { leaveSong(); openSong(s); }
    else if (what === 'take') {
      const b = el.querySelector('[data-end="take"]');
      if (b && !b.disabled) { b.disabled = true; saveTake().then(ok => { if (ok) b.innerHTML = 'Take saved &#10003;'; else b.disabled = false; }); }
    }
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-end]'); if (b) act(b.dataset.end); });
  el.onKey = e => {
    e.stopPropagation(); // nothing reaches the player behind
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' || (k === 'Enter' && !e.target.closest('button'))) { e.preventDefault(); act('menu'); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); act('again'); }
    else if (k === 's' || k === 'S') { e.preventDefault(); act('take'); }
    else if (k === 'Escape') { e.preventDefault(); act('list'); }
  };
  document.addEventListener('keydown', el.onKey, true);
  $('player').appendChild(el);
  endScreen = el;
  el.querySelector('[data-end="menu"]').focus({ preventScroll: true });
}

export function closeEndScreen() {
  if (!endScreen) return;
  document.removeEventListener('keydown', endScreen.onKey, true);
  endScreen.remove();
  endScreen = null;
}
