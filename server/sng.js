// Decrypts and parses Rocksmith 2014 SNG (binary arrangement) files, PC or Mac.
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');

const SNG_KEYS = {
  pc: Buffer.from('CB648DF3D12A16BF71701414E69619EC171CCA5D2A142E3E59DE7ADDA18A3A30', 'hex'),
  mac: Buffer.from('9821330E34B91F70D0A48CBD625993126970CEA09192C0E6CDA676CC9838289D', 'hex'),
};

function decryptSng(buf, platform = 'pc') {
  if (buf.readUInt32LE(0) !== 0x4a) throw new Error('Bad SNG magic');
  const flags = buf.readUInt32LE(4);
  const iv = buf.subarray(8, 24);
  // The last 56 bytes are usually a signature, but early DLC Builder releases leave it off,
  // and cutting them then cuts into the chart. Decrypt everything after the header (AES-CTR,
  // so the chart decrypts the same either way) and let the zlib stream end where it ends.
  const d = crypto.createDecipheriv('aes-256-ctr', SNG_KEYS[platform], iv);
  const plain = Buffer.concat([d.update(buf.subarray(24)), d.final()]);
  if (flags & 1) {
    // Compressed: uint32 uncompressed length, then zlib stream (a signature may follow it).
    return zlib.inflateSync(plain.subarray(4), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  }
  return plain;
}

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { return this.b.readUInt8(this.o++); }
  i8() { return this.b.readInt8(this.o++); }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
  bytes(n) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  str(n) { const raw = this.bytes(n); const z = raw.indexOf(0); return raw.toString('utf8', 0, z < 0 ? n : z); }
  skip(n) { this.o += n; }
  /* A counted run of elements, each at least `min` bytes. The count is checked against
   * what's left of the file first: a corrupt one (up to 2^31) would otherwise make an
   * array of that size before the first read could fail, and take the memory with it. */
  arr(fn, min = 1) {
    const n = this.i32();
    if (n < 0 || n * min > this.b.length - this.o) throw new Error(`Bad SNG: ${n} elements of ${min} bytes at ${this.o - 4}, only ${this.b.length - this.o} bytes left`);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = fn();
    return out;
  }
}

function readBend(r) {
  return { time: r.f32(), step: r.f32(), _u1: r.i16(), _u2: r.u8(), _u3: r.u8() };
}

function parseSng(raw, platform = 'pc') {
  const r = new Reader(decryptSng(raw, platform));

  const beats = r.arr(() => ({ time: r.f32(), measure: r.i16(), beat: r.i16(), phraseIteration: r.i32(), mask: r.i32() }), 16);
  const phrases = r.arr(() => ({ solo: r.u8(), disparity: r.u8(), ignore: r.u8(), _pad: r.u8(), maxDifficulty: r.i32(), links: r.i32(), name: r.str(32) }), 44);
  const chordTemplates = r.arr(() => {
    const mask = r.u32();
    const frets = [...r.bytes(6)].map(f => (f === 255 ? -1 : f));
    const fingers = [...r.bytes(6)].map(f => (f === 255 ? -1 : f));
    for (let i = 0; i < 6; i++) r.i32(); // midi notes
    return { mask, frets, fingers, name: r.str(32) };
  }, 72);
  const chordNotes = r.arr(() => {
    const noteMask = []; for (let i = 0; i < 6; i++) noteMask.push(r.u32());
    const bends = []; // per string: its bend points (32 slots, the count after them)
    for (let i = 0; i < 6; i++) { const all = []; for (let j = 0; j < 32; j++) all.push(readBend(r)); bends.push(all.slice(0, Math.max(0, r.i32()))); }
    const slideTo = [...r.bytes(6)].map(f => (f === 255 ? -1 : f));
    const slideUnpitchTo = [...r.bytes(6)].map(f => (f === 255 ? -1 : f));
    const vibrato = []; for (let i = 0; i < 6; i++) vibrato.push(r.i16());
    return { noteMask, bends, slideTo, slideUnpitchTo, vibrato };
  }, 2376);
  const vocals = r.arr(() => ({ time: r.f32(), note: r.i32(), length: r.f32(), lyric: r.str(48) }), 60);
  if (vocals.length > 0) {
    // Symbol header / texture / definition tables only exist in vocal arrangements.
    r.arr(() => r.skip(32), 32);
    r.arr(() => r.skip(128 + 4 + 4 + 4 + 4), 144);
    r.arr(() => r.skip(12 + 16 + 16), 44);
  }
  const phraseIterations = r.arr(() => {
    const it = { phraseId: r.i32(), startTime: r.f32(), nextPhraseTime: r.f32() };
    it.difficulty = [r.i32(), r.i32(), r.i32()];
    return it;
  }, 24);
  r.arr(() => r.skip(16), 16); // phrase extra info
  r.arr(() => { r.i32(); const n = r.i32(); r.skip(n * 4); }, 8); // linked difficulties
  r.arr(() => r.skip(260), 260); // actions
  const events = r.arr(() => ({ time: r.f32(), name: r.str(256) }), 260);
  const tones = r.arr(() => ({ time: r.f32(), id: r.i32() }), 8);
  r.arr(() => r.skip(8), 8); // DNA
  const sections = r.arr(() => {
    const s = { name: r.str(32), number: r.i32(), startTime: r.f32(), endTime: r.f32(), startPhraseIteration: r.i32(), endPhraseIteration: r.i32() };
    r.skip(36);
    return s;
  }, 88);
  const levels = r.arr(() => {
    const difficulty = r.i32();
    const anchors = r.arr(() => {
      const a = { startTime: r.f32(), endTime: r.f32(), _firstNote: r.f32(), _lastNote: r.f32(), fret: r.u8() };
      r.skip(3);
      a.width = r.i32();
      a.phraseIteration = r.i32();
      return a;
    }, 28);
    r.arr(() => r.skip(12), 12); // anchor extensions
    const handShapes = r.arr(() => ({ chordId: r.i32(), startTime: r.f32(), endTime: r.f32(), _u3: r.f32(), _u4: r.f32() }), 20);
    const arpeggios = r.arr(() => ({ chordId: r.i32(), startTime: r.f32(), endTime: r.f32(), _u3: r.f32(), _u4: r.f32() }), 20);
    const notes = r.arr(() => {
      const n = {
        mask: r.u32(), flags: r.u32(), hash: r.u32(), time: r.f32(),
        string: r.u8(), fret: r.u8(), anchorFret: r.u8(), anchorWidth: r.u8(),
        chordId: r.i32(), chordNotesId: r.i32(), phraseId: r.i32(), phraseIteration: r.i32(),
      };
      r.skip(4 + 6); // fingerprint ids, next/prev/parent note links
      n.slideTo = r.u8(); n.slideUnpitchTo = r.u8(); n.leftHand = r.u8(); n.tap = r.u8();
      n.pickDirection = r.u8(); n.slap = r.u8(); n.pluck = r.u8();
      n.vibrato = r.i16(); n.sustain = r.f32(); n.maxBend = r.f32();
      n.bends = r.arr(() => readBend(r), 12);
      return n;
    }, 67);
    const nPhrases = r.i32(); r.skip(nPhrases * 4);
    const n1 = r.i32(); r.skip(n1 * 4);
    const n2 = r.i32(); r.skip(n2 * 4);
    return { difficulty, anchors, handShapes, arpeggios, notes };
  }, 36);
  const meta = {
    maxScore: r.f64(), maxNotesAndChords: r.f64(), maxNotesAndChordsReal: r.f64(), pointsPerNote: r.f64(),
    firstBeatLength: r.f32(), startTime: r.f32(), capo: r.u8(), lastConversion: r.str(32), part: r.i16(),
    songLength: r.f32(),
  };
  const stringCount = r.i32();
  meta.tuning = []; for (let i = 0; i < stringCount; i++) meta.tuning.push(r.i16());
  meta.firstNoteTime = r.f32(); r.f32(); meta.maxDifficulty = r.i32();
  meta.trailingBytes = r.b.length - r.o;

  // A vocals arrangement's words, a syllable each (Japanese ones start with a byte-order mark).
  const lyrics = vocals.map(v => ({ time: v.time, length: v.length, lyric: v.lyric.replace(/^\uFEFF/, '') }));
  return { beats, phrases, chordTemplates, chordNotes, vocals: lyrics, phraseIterations, events, tones, sections, levels, meta };
}

module.exports = { parseSng, decryptSng };
