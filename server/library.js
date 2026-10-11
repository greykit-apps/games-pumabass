// Scans a folder of Rocksmith 2014 song files (.psarc, PC or Mac, in any
// layout: a Rocksmith install, a copied dlc folder, a mix), builds an index of
// every playable arrangement, and loads charts / audio for a chosen one.
'use strict';
const fs = require('fs');
const path = require('path');
const { Psarc } = require('./psarc');
const { parseSng } = require('./sng');

const INDEX_VERSION = 8;
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wav', '.webm']);
// Where each platform keeps charts and audio inside an archive.
const LAYOUT = {
  pc: { sng: 'songs/bin/generic', audio: 'audio/windows' },
  mac: { sng: 'songs/bin/macos', audio: 'audio/mac' },
};
const WEM_RE = /^audio\/(?:windows|mac)\/(\d+)\.wem$/;

/* The libraries, each a folder of song files and a tab on the song list. A song
 * in more than one (a copy, while songs are being moved) is listed once, from
 * the first of these that has it. */
const SOURCES = ['bundles', 'cdlc', 'music', 'folder'];

class Library {
  constructor({ libraryDir, cacheDir, musicDir, cdlcDir, bundlesDir }) {
    this.root = libraryDir || null; // the 'folder' library: any Rocksmith folder the player points at
    this.bundlesDir = bundlesDir || null; // Rocksmith's own song sets
    this.cdlcDir = cdlcDir || null; // downloaded custom songs
    this.musicDir = musicDir; // songs you made, and recordings for charts without audio
    this.sourceOf = new Map(); // song file -> its library's key (archiveFiles)
    this.cacheDir = cacheDir;
    this.indexFile = path.join(cacheDir, 'library.json');
    this.archives = new Map(); // path -> Psarc (opened lazily, kept open)
    this.songs = [];
    this.byId = new Map();
    this.archiveCount = 0;
  }

  setRoot(dir) {
    for (const p of this.archives.values()) p.close();
    this.archives.clear();
    this._shared = null;
    this.root = dir;
  }

  open(file) {
    let p = this.archives.get(file);
    if (!p) { p = new Psarc(file); this.archives.set(file, p); }
    return p;
  }

  /** Each library's folder, by key, in SOURCES order; null when not set. */
  dirs() {
    return { bundles: this.bundlesDir, cdlc: this.cdlcDir, music: this.musicDir, folder: this.root };
  }

  // Every .psarc under every library's folder. A Mac copy (_m) is skipped when
  // the PC copy (_p) sits beside it; on its own it is read like any other.
  // Notes which library each file is in (the first, if folders overlap).
  archiveFiles() {
    const files = [];
    this.sourceOf = new Map();
    let source = null;
    const walk = dir => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; } // unreadable folder
      const names = new Set(entries.map(e => e.name.toLowerCase()));
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (!e.name.startsWith('.')) walk(full); continue; }
        if (!/\.psarc$/i.test(e.name)) continue;
        const m = /^(.*)_m\.psarc$/i.exec(e.name);
        if (m && names.has(`${m[1]}_p.psarc`.toLowerCase())) continue;
        if (this.sourceOf.has(full)) continue; // one folder inside another
        this.sourceOf.set(full, source);
        files.push(full);
      }
    };
    const dirs = this.dirs();
    for (const key of SOURCES) if (dirs[key] && fs.existsSync(dirs[key])) { source = key; walk(dirs[key]); }
    return files.sort();
  }

  // Every numbered .wem and every sound bank in every archive of the library.
  // The on-disc songs keep their audio in a different archive (audio.psarc) from
  // their charts (songs.psarc); the Rocksmith 1 DLC pack keeps both its banks and
  // its audio in songs.psarc.
  shared() {
    if (this._shared) return this._shared;
    const wems = new Map(), banks = new Map();
    for (const file of this.archiveFiles()) {
      let p;
      try { p = this.open(file); } catch { continue; }
      for (const n of p.list()) {
        const m = WEM_RE.exec(n);
        if (m && !wems.has(Number(m[1]))) wems.set(Number(m[1]), { file, name: n, size: p.size(n) });
        else if (n.endsWith('.bnk') && !banks.has(n)) banks.set(n, file);
      }
    }
    return (this._shared = { wems, banks });
  }

  // Find the wem referenced by a sound bank: the bank from the chart's own
  // archive, or failing that from anywhere in the library; then scan it for any
  // known wem id, first in the bank's own archive, then anywhere in the library.
  findWem(archive, layout, bankName) {
    const local = new Map();
    for (const n of archive.list()) {
      const m = WEM_RE.exec(n);
      if (m) local.set(Number(m[1]), { file: archive.path, name: n, size: archive.size(n) });
    }
    const bankPath = `${layout.audio}/${bankName}`;
    let bank;
    if (archive.has(bankPath)) bank = archive.extract(bankPath);
    else {
      const file = this.shared().banks.get(bankPath);
      if (!file) return null;
      bank = this.open(file).extract(bankPath);
    }
    const pick = map => {
      let best = null;
      for (let o = 0; o + 4 <= bank.length; o++) {
        const hit = map.get(bank.readUInt32LE(o));
        if (hit && (!best || hit.size > best.size)) best = hit;
      }
      return best;
    };
    return pick(local) || pick(this.shared().wems);
  }

  scanArchive(file) {
    const p = this.open(file);
    const out = [];
    const names = p.list();
    const isMac = names.some(n => n.startsWith(LAYOUT.mac.sng + '/')) && !names.some(n => n.startsWith(LAYOUT.pc.sng + '/'));
    const platform = isMac ? 'mac' : 'pc';
    const layout = LAYOUT[platform];
    for (const name of names) {
      if (!name.startsWith('manifests/') || !name.endsWith('.json')) continue;
      let attrs;
      try {
        const j = JSON.parse(p.extract(name).toString('utf8'));
        attrs = Object.values(j.Entries)[0].Attributes;
      } catch { continue; }
      if (!attrs || !attrs.SongAsset || !attrs.SongBank) continue;
      const props = attrs.ArrangementProperties || {};
      const type = props.pathBass ? 'bass' : props.pathLead ? 'lead' : props.pathRhythm ? 'rhythm' : null;
      if (!type) continue; // vocals, showlights, etc.
      if (/^RS2 Test/i.test(attrs.SongName || '')) continue; // internal test charts shipped with the game
      const sngBase = attrs.SongAsset.split(':').pop();
      // Rocksmith's own lesson charts (etudes.psarc): not songs.
      if (/^\$\[\d+\]/.test(attrs.SongName || '') || /^ge_/i.test(sngBase)) continue;
      const sng = `${layout.sng}/${sngBase}.sng`;
      if (!p.has(sng)) continue;
      // wem is null when the audio isn't there (e.g. RS1 DLC charts); the user can supply a recording.
      const wem = this.findWem(p, layout, attrs.SongBank);
      const tuning = attrs.Tuning || {};
      out.push({
        id: `${path.basename(file, path.extname(file))}:${sngBase}`,
        songKey: attrs.SongKey,
        title: attrs.SongName,
        artist: attrs.ArtistName,
        album: attrs.AlbumName,
        year: attrs.SongYear,
        length: attrs.SongLength,
        arrangement: attrs.ArrangementName,
        type,
        represent: props.represent !== 0,
        bonus: props.bonusArr === 1,
        tuning: [0, 1, 2, 3, 4, 5].map(i => tuning[`string${i}`] || 0),
        centOffset: attrs.CentOffset || 0,
        capo: attrs.CapoFret || 0,
        difficulty: attrs.SongDifficulty,
        platform,
        file,
        sng,
        wem,
      });
    }
    return out;
  }

  load({ onProgress } = {}) {
    this._shared = null; // archives may have come or gone since the last scan
    let cached = null;
    try { cached = JSON.parse(fs.readFileSync(this.indexFile, 'utf8')); } catch {}
    const dirsKey = JSON.stringify(this.dirs());
    if (cached && (cached.version !== INDEX_VERSION || cached.dirs !== dirsKey)) cached = null;
    const files = this.archiveFiles();
    // When archives come or go, charts that had no audio get another look:
    // their audio may have just arrived (audio.psarc copied after songs.psarc).
    const sameSet = cached && Object.keys(cached.archives).sort().join('\n') === files.join('\n');
    const result = {};
    const added = new Map(); // song file -> when it arrived in its folder
    let i = 0;
    for (const file of files) {
      const st = fs.statSync(file);
      // Created, here: a copy or a download is new when it lands, though it keeps its old modified time.
      added.set(file, Math.round(st.birthtimeMs || st.mtimeMs));
      const stamp = `${st.size}:${st.mtimeMs}`;
      const prev = cached && cached.archives[file];
      if (prev && prev.stamp === stamp && (sameSet || prev.songs.every(s => s.wem))) {
        result[file] = prev;
      } else {
        try { result[file] = { stamp, songs: this.scanArchive(file) }; }
        catch (e) {
          // Rocksmith's Tmp folder holds non-archives named .psarc: skip those quietly.
          if (!/^Not a PSARC/.test(e.message)) console.warn(`Skipping ${file}: ${e.message}`);
          result[file] = { stamp, songs: [] };
        }
      }
      if (onProgress) onProgress(++i, files.length);
    }
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(this.indexFile, JSON.stringify({ version: INDEX_VERSION, dirs: dirsKey, archives: result }));
    // The same arrangement twice: in a PC and a Mac archive, keep the PC one; in
    // two libraries (a copy), keep the first library's, listed under both.
    const seen = new Map(), rank = s => SOURCES.indexOf(s.source);
    for (const [file, a] of Object.entries(result)) {
      for (const song of a.songs) {
        const s = { ...song, source: this.sourceOf.get(file) || 'folder', added: added.get(file) };
        const key = s.id.replace(/_[pm]:/, ':');
        const prev = seen.get(key);
        const better = !prev || (prev.platform === 'mac' && s.platform === 'pc')
          || (prev.platform === s.platform && rank(s) < rank(prev));
        s.sources = [...new Set([...(prev ? prev.sources : []), s.source])].sort((x, y) => SOURCES.indexOf(x) - SOURCES.indexOf(y));
        if (better) seen.set(key, s); else prev.sources = s.sources;
      }
    }
    this.songs = [...seen.values()];
    this.archiveCount = files.length;
    this.matchUserAudio();
    this.byId = new Map(this.songs.map(s => [s.id, s]));
    return this.songs;
  }

  // Pair charts that have no game audio with recordings in the music folder.
  // Files are matched by name, e.g. "Rush - YYZ.mp3" or "YYZ.mp3".
  matchUserAudio() {
    const files = [];
    const walk = dir => {
      if (!this.musicDir || !fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) {
          const rel = path.relative(this.musicDir, full);
          files.push({ full, norm: norm(rel.slice(0, -path.extname(rel).length)), base: norm(path.basename(e.name, path.extname(e.name))) });
        }
      }
    };
    walk(this.musicDir);
    for (const s of this.songs) {
      s.userAudio = null;
      if (s.wem) continue;
      const title = norm(s.title), artist = norm(s.artist);
      const hit = files.find(f => f.norm.includes(title) && f.norm.includes(artist))
        || files.find(f => f.base === title || f.base === `${artist}${title}`);
      if (hit) s.userAudio = hit.full;
    }
  }

  get(id) { return this.byId.get(id); }

  chart(id) {
    const entry = this.get(id);
    if (!entry) return null;
    const sng = parseSng(this.open(entry.file).extract(entry.sng), entry.platform);
    return buildChart(entry, sng);
  }

  // Writes the decoded audio to the cache (if needed) and returns the WAV path.
  /* A song's audio as a file: its own recording, or its .wem decoded to a cached .wav.
   * The browser asks for a song more than once while it loads (and two players may
   * open the same song), so a decode already under way is shared, not started twice:
   * two decodes of one song would write the same .part file and trip over each other. */
  audioFile(id, vgmstreamExe) {
    this.decoding = this.decoding || new Map();
    if (this.decoding.has(id)) return this.decoding.get(id);
    const job = this.decodeAudio(id, vgmstreamExe).finally(() => this.decoding.delete(id));
    this.decoding.set(id, job);
    return job;
  }

  async decodeAudio(id, vgmstreamExe) {
    const entry = this.get(id);
    if (!entry) return null;
    if (!entry.wem) return entry.userAudio;
    const wavDir = path.join(this.cacheDir, 'audio');
    fs.mkdirSync(wavDir, { recursive: true });
    const key = `${path.basename(entry.wem.file, path.extname(entry.wem.file))}_${path.basename(entry.wem.name, '.wem')}`;
    const wav = path.join(wavDir, `${key}.wav`);
    if (fs.existsSync(wav)) return wav;
    const wemTmp = path.join(wavDir, `${key}.wem`);
    fs.writeFileSync(wemTmp, this.open(entry.wem.file).extract(entry.wem.name));
    await new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      execFile(vgmstreamExe, ['-o', `${wav}.part`, wemTmp], { windowsHide: true }, err => (err ? reject(err) : resolve()));
    });
    fs.renameSync(`${wav}.part`, wav);
    fs.unlinkSync(wemTmp);
    pruneCache(wavDir, 3 * 1024 ** 3);
    return wav;
  }
}

// Loose name key for matching file names to songs: no accents, case, punctuation or leading "The".
function norm(str) {
  return String(str || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
}

// Keep the audio cache under a size limit by deleting the least recently used files.
function pruneCache(dir, maxBytes) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.wav')).map(f => {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    return { full, size: st.size, used: st.atimeMs };
  }).sort((a, b) => b.used - a.used);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (total > maxBytes) fs.unlinkSync(f.full);
  }
}

// Note technique bits (SNG note mask).
const MASK = {
  CHORD: 0x02, OPEN: 0x04, FRETHANDMUTE: 0x08, TREMOLO: 0x10, HARMONIC: 0x20, PALMMUTE: 0x40,
  SLAP: 0x80, POP: 0x100, HAMMERON: 0x200, PULLOFF: 0x400, SLIDE: 0x800, BEND: 0x1000,
  SUSTAIN: 0x2000, TAP: 0x4000, PINCHHARMONIC: 0x8000, VIBRATO: 0x10000, MUTE: 0x20000,
  IGNORE: 0x40000, HIGHDENSITY: 0x200000, SLIDEUNPITCHEDTO: 0x400000, ACCENT: 0x4000000, ARPEGGIO: 0x20000000,
};

function techniques(mask) {
  const t = [];
  if (mask & MASK.HAMMERON) t.push('hammer');
  if (mask & MASK.PULLOFF) t.push('pull');
  if (mask & (MASK.FRETHANDMUTE | MASK.MUTE)) t.push('mute');
  if (mask & MASK.PALMMUTE) t.push('palm');
  if (mask & MASK.HARMONIC) t.push('harmonic');
  if (mask & MASK.PINCHHARMONIC) t.push('pinch');
  if (mask & MASK.SLAP) t.push('slap');
  if (mask & MASK.POP) t.push('pop');
  if (mask & MASK.TAP) t.push('tap');
  if (mask & MASK.TREMOLO) t.push('tremolo');
  if (mask & MASK.VIBRATO) t.push('vibrato');
  if (mask & MASK.ACCENT) t.push('accent');
  return t;
}

// A bend's shape: [seconds after the note, half steps bent] at each point, or null for
// none. A pre-bend has a point at (or before) the note's start.
function bendCurve(points, t0) {
  const out = (points || []).filter(b => b.time > 0 || b.step > 0).map(b => [Math.max(0, Math.round((b.time - t0) * 1000) / 1000), Math.round(b.step * 100) / 100]);
  return out.some(b => b[1] > 0) ? out.sort((a, b) => a[0] - b[0]) : null;
}

// Converts a parsed SNG into the compact form the web player uses.
// Notes are kept per difficulty level so the player can pick a level per phrase.
function buildChart(entry, sng) {
  const strings = entry.type === 'bass' ? 4 : 6;
  const r3 = x => Math.round(x * 1000) / 1000;
  const levels = sng.levels.map(level => ({
    difficulty: level.difficulty,
    anchors: level.anchors.map(a => ({ t: r3(a.startTime), end: r3(a.endTime), fret: a.fret, width: a.width, pi: a.phraseIteration })),
    // The hand shapes held over stretches of notes; arpeggios are hand shapes picked a note at a time.
    handShapes: [...level.handShapes.map(h => ({ t: r3(h.startTime), end: r3(h.endTime), chord: h.chordId })),
      ...level.arpeggios.map(h => ({ t: r3(h.startTime), end: r3(h.endTime), chord: h.chordId, arp: true }))].sort((a, b) => a.t - b.t),
    notes: level.notes.map(n => {
      const out = { t: r3(n.time), pi: n.phraseIteration };
      if (n.chordId >= 0) {
        // Chord: expand into per-string notes using the chord template.
        const tpl = sng.chordTemplates[n.chordId];
        const cn = n.chordNotesId >= 0 ? sng.chordNotes[n.chordNotesId] : null;
        out.chord = n.chordId;
        if (n.mask & MASK.HIGHDENSITY) out.repeat = true; // the chord again, straight after: Rocksmith draws its frame alone
        out.notes = [];
        tpl.frets.forEach((fret, s) => {
          if (fret < 0) return;
          const m = cn ? cn.noteMask[s] : 0;
          const cnote = { s, f: fret, tech: techniques(m | n.mask) };
          if (cn && cn.slideTo[s] >= 0) cnote.slideTo = cn.slideTo[s];
          if (cn && cn.slideUnpitchTo[s] >= 0) { cnote.slideTo = cn.slideUnpitchTo[s]; cnote.unpitched = true; }
          const bends = cn ? bendCurve(cn.bends[s], n.time) : null;
          if (bends) { cnote.bends = bends; cnote.bend = Math.max(...bends.map(b => b[1])); }
          out.notes.push(cnote);
        });
        if (n.sustain > 0) out.sus = r3(n.sustain);
        return out;
      }
      out.s = n.string;
      out.f = n.fret;
      if (n.sustain > 0) out.sus = r3(n.sustain);
      if (n.slideTo !== 255) out.slideTo = n.slideTo;
      if (n.slideUnpitchTo !== 255) { out.slideTo = n.slideUnpitchTo; out.unpitched = true; }
      if (n.maxBend > 0) out.bend = n.maxBend;
      const bends = bendCurve(n.bends, n.time);
      if (bends) out.bends = bends;
      const tech = techniques(n.mask);
      if (tech.length) out.tech = tech;
      return out;
    }),
  }));

  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    year: entry.year,
    arrangement: entry.arrangement,
    type: entry.type,
    strings,
    tuning: entry.tuning.slice(0, strings),
    centOffset: entry.centOffset,
    capo: sng.meta.capo === 255 ? 0 : sng.meta.capo,
    songLength: sng.meta.songLength,
    beats: sng.beats.map(b => ({ t: r3(b.time), m: b.measure >= 0 ? b.measure : null })),
    sections: sng.sections.map(s => ({ name: s.name, t: r3(s.startTime), end: r3(s.endTime) })),
    phrases: sng.phrases.map(p => ({ name: p.name, maxDifficulty: p.maxDifficulty })),
    phraseIterations: sng.phraseIterations.map(it => ({ phrase: it.phraseId, t: r3(it.startTime), end: r3(it.nextPhraseTime) })),
    chordTemplates: sng.chordTemplates.map(c => ({ name: c.name, frets: c.frets.slice(0, strings) })),
    maxDifficulty: sng.meta.maxDifficulty,
    levels,
  };
}

module.exports = { Library };
