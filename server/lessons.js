// Rocksmith 2014's lessons ("guided experience"), from etudes.psarc, with the
// words from the game's string table (static.psarc: localization/maingame.csv).
//
// A lesson is a run of sections, each a run of items:
//   OverviewVideo / InDepthVideo / RiffVideo  a video of the instructor. The
//     videos are Bink 2, which browsers can't play, but each one's narration
//     is listed (video/lessonNN/<video>.xml) as string-table ids with times,
//     so the teaching comes through as text.
//   Note ("Try it") / Riff                    something to play: a stretch of
//     the lesson's chart, marked in its events (start_x ... freeze_x / end_x;
//     a riff has an example first: start_riffN_example, start_riffN_riff).
// The videos, in order, belong to the video items in order; the stretches of
// the chart, in order, to the Note and Riff items.
// Most lessons also have an etude: a short piece with a band, using the
// technique, played like any song.
'use strict';
const path = require('path');
const { parseSng } = require('./sng');

const LESSONS = 'manifests/lessons/lessons.hsan';
const STRINGS = 'localization/maingame.csv';
const VIDEO_KINDS = new Set(['OverviewVideo', 'InDepthVideo', 'RiffVideo']);

class Lessons {
  constructor(lib) {
    this.lib = lib;
    this.reset();
  }

  reset() {
    this.archive = undefined; // the archive with the lessons, once looked for
    this.strings = undefined;
    this.list = null;
    this.details = new Map();
  }

  /** The archive holding the lessons (etudes.psarc), or null. */
  lessonArchive() {
    if (this.archive !== undefined) return this.archive;
    this.archive = null;
    for (const file of this.lib.archiveFiles()) {
      if (!/etudes/i.test(path.basename(file))) continue;
      try { const p = this.lib.open(file); if (p.has(LESSONS)) { this.archive = p; break; } } catch {}
    }
    return this.archive;
  }

  /** The game's English strings by id (an empty map without static.psarc). */
  stringTable() {
    if (this.strings) return this.strings;
    this.strings = new Map();
    for (const file of this.lib.archiveFiles()) {
      if (!/static/i.test(path.basename(file))) continue;
      let p;
      try { p = this.lib.open(file); } catch { continue; }
      if (!p.has(STRINGS)) continue;
      for (const line of p.extract(STRINGS).toString('utf8').split(/\r?\n/)) {
        const m = /^(\d+),([^,]*)/.exec(line);
        if (m) this.strings.set(m[1], m[2]);
      }
      break;
    }
    return this.strings;
  }

  /** "$[33383]Bass Hopos 1": the table's words for 33383, else what follows the reference. */
  text(ref) {
    const m = /^\$\[(\d+)\](.*)$/s.exec(String(ref || ''));
    const raw = m ? (this.stringTable().get(m[1]) ?? m[2]) : String(ref || '');
    return clean(raw);
  }

  /** The library entry for a chart asset (urn:...:ge_bhopo1_lsn58), or null. */
  entryFor(urn) {
    if (!urn) return null;
    const base = String(urn).split(':').pop();
    return this.lib.songs.find(s => s.lesson && s.sng.endsWith(`/${base}.sng`)) || null;
  }

  /** The bass lessons, in the game's order: what the list shows. */
  all() {
    if (this.list) return this.list;
    const p = this.lessonArchive();
    if (!p) return (this.list = []);
    const hsan = JSON.parse(p.extract(LESSONS).toString('utf8'));
    const out = [];
    for (const { Attributes: a } of Object.values(hsan.Entries)) {
      if (a.Instrument !== 'Bass') continue;
      const manifest = this.manifest(a);
      const lesson = this.entryFor(manifest && manifest.LessonArrAsset);
      const etude = this.entryFor(manifest && manifest.EtudeArrAsset);
      const videos = (manifest && manifest.LessonVideo) || [];
      if (!lesson && !etude && !videos.length) continue; // nothing to show
      out.push({
        key: a.LessonKey,
        order: a.LessonOrder,
        name: this.text(a.LessonName),
        topic: cleanTopic(this.text(a.LessonSubHeader), this.text(a.LessonName)),
        description: manifest ? this.text(manifest.LessonDescription) : '',
        kind: a.Type, // VideoOnly (words only), LessonOnly, EtudeOnly, Both
        lesson: lesson ? lesson.id : null,
        etude: etude ? etude.id : null,
        hasText: videos.length > 0,
      });
    }
    out.sort((x, y) => x.order - y.order);
    this.list = out;
    // How many parts each has to play, for the list's progress.
    for (const l of out) {
      const d = this.detail(l.key);
      l.practice = d.practice = d.sections.reduce((n, sec) => n + sec.steps.filter(st => st.type !== 'read').length, 0);
    }
    return out;
  }

  manifest(a) {
    const p = this.lessonArchive();
    // The per-lesson manifests are named after the lesson key (ge_lsn_<name>_lsnNN.json).
    const want = `manifests/lessons/ge_lsn_${String(a.LessonKey || '').replace(/^GE_/i, '').toLowerCase()}.json`;
    if (!p.has(want)) return null;
    try { return Object.values(JSON.parse(p.extract(want).toString('utf8')).Entries)[0].Attributes; } catch { return null; }
  }

  /** One lesson in full: its sections and their steps. */
  detail(key) {
    if (this.details.has(key)) return this.details.get(key);
    const head = this.all().find(l => l.key === key);
    if (!head) return null;
    const p = this.lessonArchive();
    const hsan = JSON.parse(p.extract(LESSONS).toString('utf8'));
    const a = Object.values(hsan.Entries).map(e => e.Attributes).find(x => x.LessonKey === key);
    const manifest = this.manifest(a) || {};
    const parts = head.lesson ? this.chartParts(head.lesson) : [];
    const videos = [...(manifest.LessonVideo || [])];
    const sections = [];
    let partAt = 0;
    const raw = manifest.Sections ? manifest.Sections.Entries : [];
    for (const sec of raw) {
      const steps = [];
      for (const it of sec.Entries || []) {
        if (VIDEO_KINDS.has(it.Icon)) {
          const lines = this.narration(videos.shift());
          if (lines.length) steps.push({ type: 'read', title: stepTitle(this.text(it.Name), it.Icon), lines });
        } else if (it.Icon === 'Note' || it.Icon === 'Riff') {
          const part = parts[partAt++];
          if (part) steps.push({ type: it.Icon === 'Riff' ? 'riff' : 'drill', title: stepTitle(this.text(it.Name), it.Icon), ...part });
        }
      }
      if (steps.length) sections.push({ title: this.text(sec.SectionName), steps });
    }
    // A lesson with videos but no sections (the words-only ones): one section of reading.
    if (!raw.length && videos.length) {
      const steps = videos.map(v => ({ type: 'read', title: 'Read', lines: this.narration(v) })).filter(s => s.lines.length);
      if (steps.length) sections.push({ title: head.name, steps });
    }
    const out = { ...head, sections };
    this.details.set(key, out);
    return out;
  }

  /** What the instructor says in a video, as lines of text. */
  narration(video) {
    if (!video) return [];
    const p = this.lessonArchive();
    const m = /_(\d+)([a-z]*)$/i.exec(video);
    const file = m && `video/lesson${m[1]}/${video}.xml`;
    if (!file || !p.has(file)) return [];
    const xml = p.extract(file).toString('utf8');
    const lines = [];
    for (const e of xml.matchAll(/code="[^"]*?_(\d+)"/g)) {
      const t = this.stringTable().get(e[1]);
      if (t) lines.push(clean(t));
    }
    return lines;
  }

  /**
   * The playable stretches of a lesson chart, in order, from its events:
   *   { a, b }          the stretch to play (and loop)
   *   { demo: {a, b} }  for a riff, the example before it
   */
  chartParts(id) {
    const entry = this.lib.get(id);
    if (!entry) return [];
    const sng = parseSng(this.lib.open(entry.file).extract(entry.sng), entry.platform);
    const groups = new Map();
    for (const e of sng.events) {
      const m = /^(start|freeze|rate|end)_(.+)$/.exec(e.name);
      if (!m) continue;
      const [, what, name] = m;
      // riffN_example and riffN_riff are one riff in two halves
      const r = /^(riff\d+)_(example|riff)$/.exec(name);
      const base = r ? r[1] : name;
      const g = groups.get(base) || { first: e.time, marks: {} };
      g.marks[r ? `${what}_${r[2]}` : what] = e.time;
      g.first = Math.min(g.first, e.time);
      groups.set(base, g);
    }
    const r3 = x => Math.round(x * 1000) / 1000;
    const out = [];
    for (const [name, g] of [...groups].sort((x, y) => x[1].first - y[1].first)) {
      const m = g.marks;
      if (m.start_riff !== undefined) {
        const b = m.rate_riff ?? m.end_riff ?? m.freeze_riff;
        if (b === undefined) continue;
        out.push({ name, a: r3(m.start_riff), b: r3(b), demo: m.start_example !== undefined ? { a: r3(m.start_example), b: r3(m.start_riff) } : null });
      } else if (m.start !== undefined) {
        const b = m.freeze ?? m.rate ?? m.end;
        if (b === undefined) continue;
        out.push({ name, a: r3(m.start), b: r3(b) });
      }
    }
    return out;
  }
}

/** The string table's escapes: {C} a comma, {B} a line break. */
const clean = t => t.replace(/\{C\}/g, ',').replace(/\{B\}/g, ' ').replace(/\{Q\}/g, '"').replace(/\s+/g, ' ').trim();

/** "Subheader for Hopos 1" is a placeholder: then the name is the topic. */
function cleanTopic(sub, name) {
  if (!sub || /^subheader for/i.test(sub)) return name.replace(/^Bass\s+/, '');
  return sub;
}

/** The manifest's item names are placeholders ("OverviewVideo") in places. */
function stepTitle(name, icon) {
  const fallback = { OverviewVideo: 'Overview', InDepthVideo: 'In depth', RiffVideo: 'The riff', Note: 'Try it', Riff: 'Play the riff' }[icon];
  if (!name || /^(OverviewVideo|InDepthVideo|RiffVideo|Note|Riff)$/i.test(name)) return fallback;
  return name.replace(/^T(?=[A-Z])/, ''); // "TPull-off to a regular note"
}

module.exports = { Lessons };
