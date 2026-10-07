// Scans the Rocksmith install, builds an index of every playable arrangement,
// and loads charts / audio for a chosen arrangement.
'use strict';
const fs = require('fs');
const path = require('path');
const { Psarc } = require('./psarc');
const { parseSng } = require('./sng');

const INDEX_VERSION = 4;
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.wav', '.webm']);

class Library {
  constructor({ rocksmithDir, cacheDir, musicDir }) {
    this.root = rocksmithDir;
    this.musicDir = musicDir;
    this.cacheDir = cacheDir;
    this.indexFile = path.join(cacheDir, 'library.json');
    this.archives = new Map(); // path -> Psarc (opened lazily, kept open)
    this.songs = [];
  }

  open(file) {
    let p = this.archives.get(file);
    if (!p) { p = new Psarc(file); this.archives.set(file, p); }
    return p;
  }

  archiveFiles() {
    const files = [];
    const base = path.join(this.root, 'songs.psarc');
    if (fs.existsSync(base)) files.push(base);
    const dlc = path.join(this.root, 'dlc');
    if (fs.existsSync(dlc)) {
      const walk = dir => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          // PC archives end in _p.psarc; Mac duplicates (_m) are skipped.
          else if (/_p\.psarc$/i.test(e.name)) files.push(full);
        }
      };
      walk(dlc);
    }
    return files;
  }

  // Map of every numbered .wem in the shared archives, used for on-disc songs.
  sharedWems() {
    if (this._sharedWems) return this._sharedWems;
    const map = new Map();
    for (const name of ['audio.psarc', 'songs.psarc']) {
      const file = path.join(this.root, name);
      if (!fs.existsSync(file)) continue;
      const p = this.open(file);
      for (const n of p.list()) {
        const m = /^audio\/windows\/(\d+)\.wem$/.exec(n);
        if (m) map.set(Number(m[1]), { file, name: n, size: p.size(n) });
      }
    }
    return (this._sharedWems = map);
  }

  // Find the wem referenced by a sound bank: scan the bank for any known wem id.
  findWem(archive, bankName) {
    const local = new Map();
    for (const n of archive.list()) {
      const m = /^audio\/windows\/(\d+)\.wem$/.exec(n);
      if (m) local.set(Number(m[1]), { file: archive.path, name: n, size: archive.size(n) });
    }
    const bankPath = `audio/windows/${bankName}`;
    if (!archive.has(bankPath)) return null;
    const bank = archive.extract(bankPath);
    const shared = this.sharedWems();
    let best = null;
    for (let o = 0; o + 4 <= bank.length; o++) {
      const id = bank.readUInt32LE(o);
      const hit = local.get(id) || shared.get(id);
      if (hit && (!best || hit.size > best.size)) best = hit;
    }
    return best;
  }

  scanArchive(file) {
    const p = this.open(file);
    const out = [];
    for (const name of p.list()) {
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
      const sng = `songs/bin/generic/${sngBase}.sng`;
      if (!p.has(sng)) continue;
      // wem is null when the audio isn't installed (e.g. RS1 DLC charts); the user can supply a recording.
      const wem = this.findWem(p, attrs.SongBank);
      const tuning = attrs.Tuning || {};
      out.push({
        id: `${path.basename(file, '.psarc')}:${sngBase}`,
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
        file,
        sng,
        wem,
      });
    }
    return out;
  }

  load({ onProgress } = {}) {
    let cached = null;
    try { cached = JSON.parse(fs.readFileSync(this.indexFile, 'utf8')); } catch {}
    if (cached && cached.version !== INDEX_VERSION) cached = null;
    const files = this.archiveFiles();
    const result = {};
    let i = 0;
    for (const file of files) {
      const st = fs.statSync(file);
      const stamp = `${st.size}:${st.mtimeMs}`;
      const prev = cached && cached.archives[file];
      if (prev && prev.stamp === stamp) {
        result[file] = prev;
      } else {
        try { result[file] = { stamp, songs: this.scanArchive(file) }; }
        catch (e) { console.warn(`Skipping ${file}: ${e.message}`); result[file] = { stamp, songs: [] }; }
      }
      if (onProgress) onProgress(++i, files.length);
    }
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(this.indexFile, JSON.stringify({ version: INDEX_VERSION, archives: result }));
    this.songs = Object.values(result).flatMap(a => a.songs);
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
    const sng = parseSng(this.open(entry.file).extract(entry.sng));
    return buildChart(entry, sng);
  }

  // Writes the decoded audio to the cache (if needed) and returns the WAV path.
  async audioFile(id, vgmstreamExe) {
    const entry = this.get(id);
    if (!entry) return null;
    if (!entry.wem) return entry.userAudio;
    const wavDir = path.join(this.cacheDir, 'audio');
    fs.mkdirSync(wavDir, { recursive: true });
    const key = `${path.basename(entry.wem.file, '.psarc')}_${path.basename(entry.wem.name, '.wem')}`;
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
  IGNORE: 0x40000, SLIDEUNPITCHEDTO: 0x400000, ACCENT: 0x4000000, ARPEGGIO: 0x20000000,
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

// Converts a parsed SNG into the compact form the web player uses.
// Notes are kept per difficulty level so the player can pick a level per phrase.
function buildChart(entry, sng) {
  const strings = entry.type === 'bass' ? 4 : 6;
  const r3 = x => Math.round(x * 1000) / 1000;
  const levels = sng.levels.map(level => ({
    difficulty: level.difficulty,
    anchors: level.anchors.map(a => ({ t: r3(a.startTime), end: r3(a.endTime), fret: a.fret, width: a.width, pi: a.phraseIteration })),
    handShapes: level.handShapes.map(h => ({ t: r3(h.startTime), end: r3(h.endTime), chord: h.chordId })),
    notes: level.notes.map(n => {
      const out = { t: r3(n.time), pi: n.phraseIteration };
      if (n.chordId >= 0) {
        // Chord: expand into per-string notes using the chord template.
        const tpl = sng.chordTemplates[n.chordId];
        const cn = n.chordNotesId >= 0 ? sng.chordNotes[n.chordNotesId] : null;
        out.chord = n.chordId;
        out.notes = [];
        tpl.frets.forEach((fret, s) => {
          if (fret < 0) return;
          const m = cn ? cn.noteMask[s] : 0;
          const cnote = { s, f: fret, tech: techniques(m | n.mask) };
          if (cn && cn.slideTo[s] >= 0) cnote.slideTo = cn.slideTo[s];
          if (cn && cn.slideUnpitchTo[s] >= 0) cnote.slideTo = cn.slideUnpitchTo[s];
          out.notes.push(cnote);
        });
        if (n.sustain > 0) out.sus = r3(n.sustain);
        return out;
      }
      out.s = n.string;
      out.f = n.fret;
      if (n.sustain > 0) out.sus = r3(n.sustain);
      if (n.slideTo !== 255) out.slideTo = n.slideTo;
      if (n.slideUnpitchTo !== 255) out.slideTo = n.slideUnpitchTo;
      if (n.maxBend > 0) out.bend = n.maxBend;
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
