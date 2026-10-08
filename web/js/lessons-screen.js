// The Lessons screen.

import { formatTime } from './chart.js';
import { api } from './api.js';
import { $, esc, info, setScreen } from './core.js';
import { showTuner } from './instrument.js';
import { showTitle, openHelp } from './menu.js';
import { openSong } from './player.js';
import { KEY_LESSONS, load, save } from './store.js';

/* ---- lessons: Rocksmith's bass course (server/lessons.js) ----
 * The list, then one lesson: the instructor's words (from the videos, which
 * can't be played here) and the parts to play, each a stretch of the
 * lesson's chart, looped. Most lessons end with an etude, a short piece. */
export let lessonList = null; // { found, words, lessons } from the server
export let lesson = null;     // the lesson open, in full

/** Read afresh next time (the library changed). */
export function resetLessons() { lessonList = null; lesson = null; }

/** Note a part of a lesson as played through. True the first time. */
export function markLesson(key, part) {
  const all = load(KEY_LESSONS, {});
  const p = all[key] || (all[key] = {});
  if (p[part]) return false;
  p[part] = true;
  save(KEY_LESSONS, all);
  return true;
}
/** What there is to play in a lesson, and how much of it is played. */
export function lessonProgress(l) {
  const p = load(KEY_LESSONS, {})[l.key] || {};
  const total = l.practice + (l.etude ? 1 : 0);
  const done = Object.keys(p).filter(k => k !== 'read').length;
  return { total, done: Math.min(done, total), read: !!p.read || (total > 0 && done >= total) };
}
export const lessonName = l => (/^special topics$/i.test(l.name) ? l.topic : l.name);
export const lessonSub = l => (/^special topics$/i.test(l.name) ? '' : l.topic);

export async function showLessons(key = null, part = null) {
  setScreen('lessons');
  $('library').classList.add('hidden');
  $('player').classList.add('hidden');
  $('lessons').classList.remove('hidden');
  const body = $('lesson-body');
  if (!lessonList) {
    body.innerHTML = '<div class="empty">Reading the lessons&hellip;</div>';
    try { lessonList = await api('/api/lessons'); }
    catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  }
  if (key && lessonList.found) {
    if (!lesson || lesson.key !== key) await openLesson(key); else renderLesson();
    const go = part && body.querySelector(part === 'etude' ? '[data-etude]' : `[data-go="${CSS.escape(part)}"]`);
    if (go) { go.focus({ preventScroll: true }); go.scrollIntoView({ block: 'center' }); }
  } else renderLessonList(key);
}

export function renderLessonList(focusKey = null) {
  lesson = null;
  $('lsn-title').textContent = 'Lessons';
  $('lsn-back').textContent = 'Menu';
  const body = $('lesson-body');
  if (!lessonList.found) {
    $('lsn-count').textContent = '';
    body.innerHTML = `<div class="empty"><p>The lessons come from Rocksmith 2014's <code>etudes.psarc</code>, with their words from <code>static.psarc</code>. Neither is in your songs folder${info.libraryDir ? ` (<code>${esc(info.libraryDir)}</code>)` : ''}.</p><p>Copy both from the Rocksmith 2014 folder into it, then Rescan in Settings.</p></div>`;
    return;
  }
  const groups = [['Getting started', l => l.order < 1030], ['The course', l => l.order >= 1030 && l.order < 1310], ['Special topics', l => l.order >= 1310]];
  let html = '', played = 0;
  for (const [name, test] of groups) {
    const list = lessonList.lessons.filter(test);
    if (!list.length) continue;
    html += `<div class="lsn-group">${name}</div>`;
    for (const l of list) {
      const pr = lessonProgress(l);
      if (pr.read) played++;
      const what = l.kind === 'VideoOnly' ? 'Reading' : [l.practice ? `${l.practice} to play` : '', l.etude ? 'etude' : ''].filter(Boolean).join(' \u00b7 ');
      html += `<div class="lesson" tabindex="0" role="listitem" data-key="${esc(l.key)}">
        <span class="chk${pr.read ? ' done' : ''}">${pr.read ? '&#10003;' : ''}</span>
        <div style="min-width:0"><div class="t">${esc(lessonName(l))}</div><div class="a">${esc(lessonSub(l))}</div></div>
        <span class="what">${esc(what)}</span>
        <span class="prog">${pr.total ? `${pr.done} of ${pr.total}` : pr.read ? 'read' : ''}</span>
      </div>`;
    }
  }
  body.innerHTML = `<div role="list">${html}</div>`;
  $('lsn-count').textContent = `${lessonList.lessons.length} bass lessons \u00b7 ${played} done`;
  const row = (focusKey && body.querySelector(`.lesson[data-key="${CSS.escape(focusKey)}"]`)) || body.querySelector('.lesson');
  if (row) { row.focus({ preventScroll: true }); if (focusKey) row.scrollIntoView({ block: 'center' }); }
}

export async function openLesson(key) {
  const body = $('lesson-body');
  body.innerHTML = '<div class="empty">Opening the lesson&hellip;</div>';
  try { lesson = await api(`/api/lessons/${encodeURIComponent(key)}`); }
  catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!lesson.practice && !lesson.etudeSong) markLesson(key, 'read'); // words only: reading it is doing it
  renderLesson();
  const first = body.querySelector('button');
  $('lessons').scrollTop = 0;
  if (first) first.focus({ preventScroll: true });
}

export function renderLesson() {
  const d = lesson, done = load(KEY_LESSONS, {})[d.key] || {};
  $('lsn-title').textContent = lessonName(d);
  $('lsn-back').textContent = 'Lessons';
  $('lsn-count').textContent = lessonSub(d);
  const playable = s => s && s.audio !== false;
  const step = x => {
    if (x.type === 'read') return `<div class="lsn-read"><h3>${esc(x.title)}</h3>${x.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
    const len = Math.round(x.b - x.a);
    const ok = playable(d.lessonSong);
    const buttons = x.type === 'riff' && x.demo
      ? `<button class="primary" data-go="${esc(x.name)}" data-demo ${ok ? '' : 'disabled'}>Watch, then play</button><button data-go="${esc(x.name)}" ${ok ? '' : 'disabled'}>Play</button>`
      : `<button class="primary" data-go="${esc(x.name)}" ${ok ? '' : 'disabled'}>Play</button>`;
    return `<div class="lsn-step"><span class="chk${done[x.name] ? ' done' : ''}">${done[x.name] ? '&#10003;' : '&#9675;'}</span>
      <div class="what"><b>${esc(x.title)}</b><small>${x.type === 'riff' && x.demo ? 'An example first, then your turn. ' : ''}${len} seconds, round and round: <kbd>R</kbd> speeds it up each time</small></div>${buttons}</div>`;
  };
  let html = `<div class="lsn-detail">${d.description ? `<p class="lsn-desc">${esc(d.description)}</p>` : ''}`;
  if (!lessonList.words) html += '<p class="lsn-note">The instructor\'s words come from Rocksmith\'s <code>static.psarc</code>: copy it into your songs folder and Rescan to read them here.</p>';
  for (const sec of d.sections) html += `<h2 class="lsn-sec">${esc(sec.title)}</h2>${sec.steps.map(step).join('')}`;
  if (d.etudeSong) {
    html += `<h2 class="lsn-sec">Etude</h2><div class="lsn-step"><span class="chk${done.etude ? ' done' : ''}">${done.etude ? '&#10003;' : '&#9675;'}</span>
      <div class="what"><b>${esc(d.etudeSong.title)}</b><small>A short piece with a band, using what this lesson teaches &middot; ${formatTime(d.etudeSong.length)}</small></div>
      <button class="primary" data-etude ${playable(d.etudeSong) ? '' : 'disabled'}>Play</button></div>`;
  }
  if (!d.sections.length && !d.etudeSong) html += '<p class="lsn-note">Nothing to read or play in this one.</p>';
  if ((d.lessonSong && !playable(d.lessonSong)) || (d.etudeSong && !playable(d.etudeSong))) html += '<p class="lsn-note">Some of this lesson\'s audio is missing: it lives in <code>etudes.psarc</code>, and plays through vgmstream.</p>';
  $('lesson-body').innerHTML = html + '</div>';
}

/* Play one part of the lesson: its stretch of the chart, looped (a riff can
 * start with its example). Or the etude, as a song. */
export function playLessonPart(name, demo) {
  const d = lesson;
  const x = d.sections.flatMap(sec => sec.steps).find(st => st.name === name);
  if (!x) return;
  const s = { ...d.lessonSong, title: `${lessonName(d)}: ${x.title}`, lessonCtx: { key: d.key, part: name, a: x.a, b: x.b } };
  openSong(s, demo && x.demo ? x.demo.a : x.a);
}
export function playEtude() {
  const d = lesson;
  openSong({ ...d.etudeSong, lessonCtx: { key: d.key, part: 'etude' } }, 0);
}

$('lesson-body').addEventListener('click', e => {
  const row = e.target.closest('.lesson');
  if (row) { openLesson(row.dataset.key); return; }
  const go = e.target.closest('[data-go]');
  if (go) { playLessonPart(go.dataset.go, go.hasAttribute('data-demo')); return; }
  if (e.target.closest('[data-etude]')) playEtude();
});
$('lessons').querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'back') lessonsBack();
  else if (b.dataset.act === 'help') openHelp();
});
export function lessonsBack() {
  if (lesson) renderLessonList(lesson.key);
  else showTitle().reveal();
}
export function lessonsKey(e) {
  const k = e.key;
  const items = [...$('lesson-body').querySelectorAll('.lesson, button:not([disabled])')];
  const i = items.indexOf(document.activeElement);
  if (k === 'Escape') { e.preventDefault(); lessonsBack(); }
  else if (k === '?' || k === 'h') { e.preventDefault(); openHelp(); }
  else if (k === 't' || k === 'T') { e.preventDefault(); showTuner(); }
  else if (k === 'ArrowDown' && items.length) { e.preventDefault(); const n = items[Math.min(items.length - 1, i + 1)]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  else if (k === 'ArrowUp' && items.length) { e.preventDefault(); const n = items[Math.max(0, i - 1)]; n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  else if (k === 'Enter' && document.activeElement && document.activeElement.classList.contains('lesson')) { e.preventDefault(); openLesson(document.activeElement.dataset.key); }
}
