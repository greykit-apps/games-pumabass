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

// Each file can parse and the page still not start: a name imported from a
// module that doesn't export it stops every module. So check the links too.
const exportsOf = new Map();
const js = fs.readdirSync(path.join(root, 'web/js')).filter(f => f.endsWith('.js'));
for (const f of js) {
  const src = fs.readFileSync(path.join(root, 'web/js', f), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  exportsOf.set(f, names);
}
for (const f of js) {
  const src = fs.readFileSync(path.join(root, 'web/js', f), 'utf8');
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)'/gm)) {
    const from = m[2], have = exportsOf.get(from);
    if (!have) { bad++; console.log(`FAIL web/js/${f} imports from ./${from}, which isn't there`); continue; }
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0];
      if (n && !have.has(n)) { bad++; console.log(`FAIL web/js/${f} imports ${n} from ./${from}, which doesn't export it`); }
    }
  }
}

if (!checked) { console.log('check-syntax: nothing checked'); process.exit(1); }
if (bad) { console.log(`check-syntax: ${bad} of ${checked} files FAILED`); process.exit(1); }
console.log(`check-syntax: all ${checked} files parse, and every import between the page's modules is there`);
