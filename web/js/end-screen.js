// The end screen, when a song is over.

import { tuningName, formatTime, arrangementLabel, sectionName } from './chart.js';
import { $, highway, input, esc } from './core.js';
import { showSongInList } from './library-screen.js';
import { showTitle } from './menu.js';
import { chart, song, session, openSong, leaveSong, scorer, practiseSection } from './player.js';
import { KEY_STATS, load, save, prefs, statsOf } from './store.js';
import { saveTake } from './takes.js';
import { shortLabel } from './instrument.js';
import { sceneSVG } from './scene.js';

/* ---- the end screen: what this play was, in words, and its score ---- */
export let endScreen = null;

export function showEndScreen() {
  if (endScreen || !song || !chart) return;
  const st = statsOf(song.id);
  const notes = highway.notes.reduce((n, e) => n + (e.notes ? e.notes.length : 1), 0);
  const played = session ? session.heard : 0;
  const finished = !!(session && session.finished);
  const tn = tuningName(chart.tuning, chart.strings);
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
  const times = n => `${n} ${n === 1 ? 'time' : 'times'}`;
  // What happened, in a sentence: played through and counted, or how far it got.
  // (A finish is counted before the end screen opens, so st.finished includes this one.)
  const verdict = finished
    ? (st.finished === 1 ? 'Played to the end, for the first time.' : `Played to the end: that's ${st.finished} finishes from ${st.plays} plays.`)
    : `You played ${formatTime(played)} of ${formatTime(chart.songLength)}. Play at least half of it and it counts as a finish${st.finished ? ` (you've finished it ${times(st.finished)})` : ''}.`;
  const facts = [prefs.difficulty < 100 ? `${notes} notes (${prefs.difficulty}% of the chart)` : `${notes} notes`, `${$('speed').value}% speed`, !sc && best !== null ? `your best ${best}%` : ''].filter(Boolean).join(' &middot; ');
  // Each section's accuracy, as a strip along the song.
  const len = chart.songLength;
  const strip = sc ? `<div class="end-strip" aria-label="Accuracy by section">${chart.sections.map((x, i) => {
    const r = sc.sections.get(i);
    const a = r && r.judged ? r.hits / r.judged : null;
    const color = a === null ? 'var(--line)' : `hsl(${Math.round(a * a * 120)}, 70%, 48%)`;
    return `<i style="width:${((x.end - x.t) / len) * 100}%;background:${color}" title="${esc(sectionName(x.name))}${a === null ? '' : ` \u00b7 ${Math.round(a * 100)}%`}"></i>`;
  }).join('')}</div><p class="end-strip-note">by section: red is where to practise</p>` : '';
  // The section to practise next: the one with the most misses for its size, if any fell short.
  let weak = null;
  if (sc) chart.sections.forEach((x, i) => {
    const r = sc.sections.get(i);
    if (!r || r.judged < 4 || /^noguitar/i.test(x.name)) return;
    const a = r.hits / r.judged;
    if (a < 0.85 && (!weak || a < weak.a)) weak = { a, sec: x };
  });
  const timingSay = timing ? (Math.abs(timing.ms) < 10 ? 'on the beat' : `${Math.round(Math.abs(timing.ms))} ms ${timing.ms > 0 ? 'late' : 'early'}, give or take ${Math.round(timing.spread)}`) : '';
  // The score only takes the stage when there is one; otherwise, under the verdict, a line on how to get one.
  const score = sc ? `<div class="end-score">
      <span class="end-score-value">${pct}%</span>
      <span class="end-score-note">${sc.hits} of ${sc.judged} notes hit${newBest ? ' &middot; <b>a new best</b>' : ''}</span>
      ${strip}
      <p class="end-more">Best streak ${sc.best}${timingSay ? ` &middot; ${timingSay}` : ''}${best !== null ? ` &middot; best ${best}% on full plays` : ''}</p>
    </div>`
    : `<p class="end-invite">${!prefs.scoring ? 'Scoring is off. Turn it on in the Mix (<kbd>,</kbd>) to have your playing scored.'
      : !input.open && prefs.input ? `Not scored: ${esc(shortLabel(prefs.input.label))} wasn't connected. Plug it in and press <kbd>T</kbd> for the tuner, which opens it.`
        : !input.open ? 'Not scored: no instrument input. Plug in the Real Tone Cable and choose it in Settings, under Instrument input.'
          : 'No notes were scored this time.'}</p>`;
  const kicker = finished ? 'Song complete' : 'End of the song';
  const el = document.createElement('div');
  el.className = `gk-sheet end-sheet${finished ? ' cheer' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', kicker);
  // The stage comes back for the end: its lights up when the song was played through.
  el.innerHTML = `<div class="scene end-scene" aria-hidden="true">${sceneSVG('pb-beam-end')}</div>
  <div class="gk-box end">
    <div class="end-head">
      <h2 class="end-title">${esc(song.title)}</h2>
      <p class="end-sub">${esc(song.artist)} &middot; ${esc(arrangementLabel(song))} &middot; ${esc(tn)}</p>
    </div>
    ${sc ? score : ''}
    <p class="end-verdict">${verdict}</p>
    <p class="end-facts">${facts}</p>
    ${sc ? '' : score}
    <div class="gk-row end-acts">
      <button class="primary" data-end="again"><kbd>Space</kbd>Play again</button>
      ${weak ? `<button data-end="practise" title="The song again from this section, looped, with the riff repeater: slower, then up to speed"><kbd>P</kbd>Practise the ${esc(sectionName(weak.sec.name).toLowerCase())} at ${formatTime(weak.sec.t)}</button>` : ''}
      <button data-end="list"><kbd>Esc</kbd>Song list</button>
      <button data-end="menu"><kbd>M</kbd>Main menu</button>
      ${input.tape && input.tape.samples ? '<button data-end="take" title="Saves what the cable heard, with how each note was judged, in the PumaBass folder (takes), for tuning the scoring">Save take</button>' : ''}
    </div>
  </div>`;
  const act = what => {
    const s = song;
    if (what === 'menu') { leaveSong(); showTitle().reveal(); }
    else if (what === 'list') { leaveSong(); showSongInList(s.id); }
    else if (what === 'again') { leaveSong(); openSong(s); }
    else if (what === 'practise' && weak) { leaveSong(); practiseSection(s, weak.sec); }
    else if (what === 'take') {
      const b = el.querySelector('[data-end="take"]');
      if (b && !b.disabled) { b.disabled = true; saveTake().then(ok => { if (ok) b.textContent = 'Take saved'; else b.disabled = false; }); }
    }
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-end]'); if (b) act(b.dataset.end); });
  el.onKey = e => {
    e.stopPropagation(); // nothing reaches the player behind
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if ((k === ' ' || k === 'Enter') && e.target.closest('button')) return; // the focused button takes it
    if (k === ' ' || k === 'Enter') { e.preventDefault(); act('again'); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); act('again'); }
    else if ((k === 'p' || k === 'P') && weak) { e.preventDefault(); act('practise'); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); act('menu'); }
    else if (k === 'Escape') { e.preventDefault(); act('list'); }
  };
  document.addEventListener('keydown', el.onKey, true);
  $('player').appendChild(el);
  endScreen = el;
  el.querySelector('[data-end="again"]').focus({ preventScroll: true });
}

export function closeEndScreen() {
  if (!endScreen) return;
  document.removeEventListener('keydown', endScreen.onKey, true);
  endScreen.remove();
  endScreen = null;
}
