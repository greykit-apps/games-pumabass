#!/usr/bin/env node
// check-syntax.mjs -- every JavaScript file PumaBass ships must parse. One
// broken file in web/js/ stops the whole page from starting, so this checks
// them all (as modules), and the server's (as CommonJS).
//   node tools/check-syntax.mjs
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pumabass-syntax-'));
const groups = [['web/js', '.mjs'], ['server', '.cjs']];
let bad = 0, checked = 0;
for (const [dir, ext] of groups) {
  for (const f of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).sort()) {
    // node --check decides module or script by extension, so check a copy named for it
    const copy = path.join(tmp, f.replace(/\.js$/, ext));
    fs.copyFileSync(path.join(root, dir, f), copy);
    checked++;
    try { execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }); }
    catch (e) { bad++; console.log(`FAIL ${dir}/${f}\n${String(e.stderr).split('\n').slice(0, 4).join('\n').replaceAll(copy, `${dir}/${f}`)}`); }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (!checked) { console.log('check-syntax: nothing checked'); process.exit(1); }
if (bad) { console.log(`check-syntax: ${bad} of ${checked} files FAILED`); process.exit(1); }
console.log(`check-syntax: all ${checked} files parse`);
