#!/usr/bin/env node
/*
 * A page listing every song file in a library folder (cdlc/ by default), with
 * each song's parts, bass difficulty, tuning and length, linking to the file
 * beside it. Written into that folder as index.html; open it straight from disk.
 *
 *   node tools/cdlc-index.mjs [folder]
 *
 * Run it again after adding songs. When the folder holds pick-history.json (the
 * pull lists the songs came from), each song also links to its CustomsForge page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tuningName, difficultyLevel } from '../web/js/chart.js';

const require = createRequire(import.meta.url);
const { Library } = require('../server/library');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(process.argv[2] || path.join(root, 'cdlc'));
if (!fs.existsSync(dir)) { console.error(`No folder ${dir}`); process.exit(1); }

// Only this folder: a library of one, with a throwaway index.
const lib = new Library({ libraryDir: null, musicDir: null, cdlcDir: dir, cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pb-index-')) });
const parts = lib.load();

// Where songs came from, when the pull lists left a record: the CustomsForge id by file.
const fromList = new Map();
try {
  for (const e of JSON.parse(fs.readFileSync(path.join(dir, 'pick-history.json'), 'utf8')).entries) {
    if (e.file && e.cdlcId) fromList.set(e.file, { cf: e.cdlcId });
  }
} catch {}

// One row per song in each file (a file nearly always holds one song).
const rows = new Map();
for (const p of parts) {
  const rel = path.relative(dir, p.file).split(path.sep).join('/');
  const key = `${rel}|${p.songKey}`;
  const r = rows.get(key) || { file: rel, title: p.title, artist: p.artist, album: p.album || '', year: p.year || null, length: Math.round(p.length || 0),
    size: fs.statSync(p.file).size, parts: [], audio: true, ...(fromList.get(path.basename(p.file)) || {}) };
  r.parts.push({ type: p.type, name: p.arrangement, level: difficultyLevel(p.difficulty), tuning: tuningName(p.tuning, p.type === 'bass' ? 4 : 6), cents: Math.round(p.centOffset || 0) });
  if (!p.wem) r.audio = false;
  rows.set(key, r);
}
const songs = [...rows.values()].map(r => {
  const bass = r.parts.filter(x => x.type === 'bass');
  const main = bass[0] || r.parts[0];
  const kinds = ['bass', 'lead', 'rhythm'].filter(t => r.parts.some(x => x.type === t));
  return { ...r, kinds, bass: bass.length > 0, level: main.level, tuning: main.tuning, cents: main.cents, parts: undefined };
}).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

const page = fs.readFileSync(path.join(root, 'tools', 'cdlc-index.html'), 'utf8')
  .replace('/*__SONGS__*/[]', () => JSON.stringify(songs).replace(/</g, '\\u003c')) // a function: no $ patterns in titles
  .replaceAll('__FOLDER__', path.basename(dir))
  .replaceAll('__WHEN__',new Date().toISOString().slice(0, 10));
fs.writeFileSync(path.join(dir, 'index.html'), page);
console.log(`${songs.length} songs from ${new Set(songs.map(s => s.file)).size} files -> ${path.join(dir, 'index.html')}`);
