// Reader for Rocksmith 2014 PSARC archives (PC).
// Reads the encrypted table of contents, then extracts individual files on demand.
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const TOC_KEY = Buffer.from('C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C', 'hex');
const TOC_IV = Buffer.from('E915AA018FEF71FC508132E4BB4CEB42', 'hex');

function readUInt40BE(buf, off) {
  return buf[off] * 0x100000000 + buf.readUInt32BE(off + 1);
}

class Psarc {
  constructor(path) {
    this.path = path;
    this.fd = fs.openSync(path, 'r');
    // A file that isn't an archive after all mustn't keep its descriptor: a
    // folder of them (Rocksmith's Tmp) would otherwise use them all up.
    try { this._parse(); } catch (e) { this.close(); throw e; }
  }

  _parse() {
    const path = this.path;
    const header = this._read(0, 32);
    if (header.toString('ascii', 0, 4) !== 'PSAR') throw new Error(`Not a PSARC file: ${path}`);
    const tocLength = header.readUInt32BE(12);
    const tocEntrySize = header.readUInt32BE(16);
    const numFiles = header.readUInt32BE(20);
    this.blockSize = header.readUInt32BE(24);
    const flags = header.readUInt32BE(28);

    let toc = this._read(32, tocLength - 32);
    if (flags & 4) {
      // Encrypted TOC: AES-256-CFB128. Pad to block size so Node's decipher is happy.
      const padded = Buffer.alloc(Math.ceil(toc.length / 16) * 16);
      toc.copy(padded);
      const d = crypto.createDecipheriv('aes-256-cfb', TOC_KEY, TOC_IV);
      d.setAutoPadding(false);
      toc = Buffer.concat([d.update(padded), d.final()]).subarray(0, toc.length);
    }

    this.entries = [];
    for (let i = 0; i < numFiles; i++) {
      const o = i * tocEntrySize;
      this.entries.push({
        zIndex: toc.readUInt32BE(o + 16),
        length: readUInt40BE(toc, o + 20),
        offset: readUInt40BE(toc, o + 25),
      });
    }

    // Block-size table follows the entries; width depends on block size.
    let zBytes = 2;
    if (this.blockSize > 0x10000) zBytes = this.blockSize > 0x1000000 ? 4 : 3;
    const zStart = numFiles * tocEntrySize;
    const zCount = Math.floor((toc.length - zStart) / zBytes);
    this.zLengths = new Array(zCount);
    for (let i = 0; i < zCount; i++) {
      const o = zStart + i * zBytes;
      this.zLengths[i] = zBytes === 2 ? toc.readUInt16BE(o) : zBytes === 3 ? toc.readUIntBE(o, 3) : toc.readUInt32BE(o);
    }

    // Entry 0 is the manifest: newline-separated list of names for entries 1..n.
    const names = this._extractEntry(this.entries[0]).toString('utf8').split(/\r?\n/);
    this.files = new Map();
    for (let i = 1; i < this.entries.length; i++) {
      if (names[i - 1]) this.files.set(names[i - 1], this.entries[i]);
    }
  }

  _read(pos, len) {
    if (this.fd == null) throw new Error(`${this.path} was closed (ask the library to open it again)`);
    const buf = Buffer.alloc(len);
    let done = 0;
    while (done < len) {
      const n = fs.readSync(this.fd, buf, done, len - done, pos + done);
      if (n === 0) break;
      done += n;
    }
    return buf;
  }

  _extractEntry(entry) {
    const out = [];
    let remaining = entry.length;
    let pos = entry.offset;
    let z = entry.zIndex;
    while (remaining > 0) {
      const zLen = this.zLengths[z++];
      if (zLen === 0) {
        // Stored, full block.
        const chunk = this._read(pos, this.blockSize);
        pos += this.blockSize;
        const take = chunk.subarray(0, Math.min(remaining, chunk.length));
        out.push(take);
        remaining -= take.length;
        continue;
      }
      const chunk = this._read(pos, zLen);
      pos += zLen;
      let data = chunk;
      if (chunk[0] === 0x78 && (chunk[1] === 0xda || chunk[1] === 0x9c || chunk[1] === 0x01 || chunk[1] === 0x5e)) {
        try { data = zlib.inflateSync(chunk); } catch { data = chunk; }
      }
      const take = data.subarray(0, Math.min(remaining, data.length));
      out.push(take);
      remaining -= take.length;
    }
    return Buffer.concat(out);
  }

  list() { return [...this.files.keys()]; }
  has(name) { return this.files.has(name); }
  size(name) { const e = this.files.get(name); return e ? e.length : 0; }

  extract(name) {
    const entry = this.files.get(name);
    if (!entry) throw new Error(`${name} not found in ${this.path}`);
    return this._extractEntry(entry);
  }

  close() { if (this.fd != null) { fs.closeSync(this.fd); this.fd = null; } }
}

module.exports = { Psarc };
