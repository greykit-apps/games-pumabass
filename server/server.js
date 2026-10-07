// PumaBass local server: serves the web player, and song charts and audio
// read straight out of a folder of your own Rocksmith 2014 song files.
//
//   node server/server.js [--port 8014] [--host 127.0.0.1] [--library /path/to/songs] [--no-open]
//
// Settings live in config.json beside the app (see README.md). The song
// library folder is chosen in the app's Settings and saved there too.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { Library } = require('./library');

const APP_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(patch) {
  const next = Object.assign(readConfig(), patch);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n');
}

const fileConfig = readConfig();
const config = Object.assign({ port: 8014, host: '127.0.0.1', openBrowser: true }, fileConfig);
// rocksmithDir is the name the library folder had before it could be any folder.
config.libraryDir = fileConfig.libraryDir || fileConfig.rocksmithDir || null;
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
if (arg('--port')) config.port = Number(arg('--port'));
if (arg('--host')) config.host = arg('--host');
if (arg('--library')) config.libraryDir = path.resolve(arg('--library'));
if (process.argv.includes('--no-open')) config.openBrowser = false;

// What the browser may fetch: the page, its icons and manifest, and web/.
// Never the server code, the cache, your music folder or tools/.
const PUBLIC_FILES = new Set(['index.html', 'manifest.webmanifest', 'icon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'og.png']);
const PUBLIC_DIRS = ['web'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const AUDIO_MIME = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm' };

/* vgmstream decodes the game's audio. tools/get-vgmstream.sh puts the build
 * for this platform in tools/vgmstream/; one on the PATH works too. Looked for
 * again while it is missing, so installing it needs no restart. */
let vgmstream = null;
function findVgmstream() {
  if (vgmstream && fs.existsSync(vgmstream)) return vgmstream;
  const exe = process.platform === 'win32' ? 'vgmstream-cli.exe' : 'vgmstream-cli';
  const dirs = [path.join(APP_DIR, 'tools', 'vgmstream'), ...(process.env.PATH || '').split(path.delimiter)];
  vgmstream = dirs.map(d => path.join(d, exe)).find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
  return vgmstream;
}

const lib = new Library({
  libraryDir: config.libraryDir,
  cacheDir: config.cacheDir || path.join(APP_DIR, 'cache'),
  musicDir: config.musicDir || path.join(APP_DIR, 'music'),
});
fs.mkdirSync(lib.musicDir, { recursive: true });

function loadLibrary() {
  if (!lib.root) { console.log('No song library chosen yet: open PumaBass and pick your songs folder in Settings.'); return; }
  if (!fs.existsSync(lib.root)) { console.log(`The song library folder is missing: ${lib.root}`); }
  console.log(`Reading songs from ${lib.root} ...`);
  lib.load();
  const mine = lib.songs.filter(s => !s.wem && s.userAudio).length, none = lib.songs.filter(s => !s.wem && !s.userAudio).length;
  console.log(`Found ${lib.songs.length} arrangements in ${lib.archiveCount} song files (${mine} using your own recordings, ${none} without audio).`);
}
loadLibrary();
if (!findVgmstream()) console.log('vgmstream is missing, so song audio cannot play. Run tools/get-vgmstream.sh (see README.md).');

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function sendFileRange(req, res, file, type) {
  const size = fs.statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* Places to start looking for a songs folder: home, removable drives and
 * mounts on Linux, drive letters on Windows. */
function folderRoots() {
  const roots = [os.homedir()];
  if (process.platform === 'win32') {
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (fs.existsSync(`${l}:\\`)) roots.push(`${l}:\\`);
  } else {
    const user = os.userInfo().username;
    for (const d of [`/media/${user}`, `/run/media/${user}`, '/media', '/mnt', '/']) if (fs.existsSync(d)) roots.push(d);
  }
  return [...new Set(roots)];
}

/* One folder's subfolders, and how many song files sit right in it, for the
 * folder picker. Folder names only: no file is read. */
function listFolder(dir) {
  dir = path.resolve(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dirs = [];
  let psarc = 0;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) { try { isDir = fs.statSync(path.join(dir, e.name)).isDirectory(); } catch { isDir = false; } }
    if (isDir) dirs.push(e.name);
    else if (/\.psarc$/i.test(e.name)) psarc++;
  }
  dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, dirs, psarc, sep: path.sep };
}

// Only answer to this machine's own names: a web page elsewhere cannot use a
// look-alike hostname to read the folder list.
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
function hostAllowed(req) {
  if (!LOOPBACK.has(config.host)) return true;
  const host = (req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return LOOPBACK.has(host);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (!hostAllowed(req)) { res.writeHead(403); return res.end('Forbidden'); }
    if (p === '/api/songs') {
      return sendJson(res, lib.songs.map(({ file, sng, wem, userAudio, ...s }) => ({ ...s, audio: wem ? 'game' : userAudio ? 'user' : false })));
    }
    if (p === '/api/info') {
      return sendJson(res, {
        libraryDir: lib.root, libraryFound: !!(lib.root && fs.existsSync(lib.root)), archives: lib.archiveCount,
        musicDir: lib.musicDir, platform: process.platform, vgmstream: !!findVgmstream(),
      });
    }
    if (p === '/api/rescan') {
      loadLibrary();
      return sendJson(res, { songs: lib.songs.length, archives: lib.archiveCount });
    }
    if (p === '/api/folders') {
      const want = url.searchParams.get('path');
      if (!want) return sendJson(res, { roots: folderRoots(), start: lib.root && fs.existsSync(lib.root) ? lib.root : os.homedir() });
      try { return sendJson(res, listFolder(want)); } catch (e) { return sendJson(res, { error: `Can't open that folder (${e.code || e.message}).` }, 400); }
    }
    if (p === '/api/library' && req.method === 'POST') {
      // JSON only: a cross-site form post cannot send it without asking first.
      if (!/^application\/json/.test(req.headers['content-type'] || '')) return sendJson(res, { error: 'JSON only' }, 415);
      const { dir } = await readBody(req);
      const full = dir && path.resolve(String(dir));
      if (!full || !fs.existsSync(full) || !fs.statSync(full).isDirectory()) return sendJson(res, { error: 'That folder does not exist.' }, 400);
      saveConfig({ libraryDir: full });
      lib.setRoot(full);
      loadLibrary();
      return sendJson(res, { libraryDir: full, songs: lib.songs.length, archives: lib.archiveCount });
    }
    let m;
    if ((m = /^\/api\/chart\/(.+)$/.exec(p))) {
      const chart = lib.chart(m[1]);
      return chart ? sendJson(res, chart) : sendJson(res, { error: 'not found' }, 404);
    }
    if ((m = /^\/api\/audio\/(.+)$/.exec(p))) {
      const entry = lib.get(m[1]);
      if (entry && entry.wem && !findVgmstream()) return sendJson(res, { error: 'vgmstream' }, 503);
      const file = await lib.audioFile(m[1], vgmstream);
      if (!file) return sendJson(res, { error: 'not found' }, 404);
      return sendFileRange(req, res, file, AUDIO_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    }
    // Static files.
    const rel = path.normalize(p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
    const allowed = PUBLIC_FILES.has(rel) || PUBLIC_DIRS.some(d => rel.startsWith(d + path.sep));
    const file = path.join(APP_DIR, rel);
    if (!allowed || !file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    sendJson(res, { error: e.message }, 500);
  }
});

function openBrowser(addr) {
  if (!config.openBrowser) return;
  const quiet = { windowsHide: true, stdio: 'ignore' };
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', addr], quiet, () => {});
  else if (process.platform === 'darwin') execFile('open', [addr], quiet, () => {});
  else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) execFile('xdg-open', [addr], quiet, () => {}); // no desktop, no browser to open
}

const shownHost = LOOPBACK.has(config.host) || config.host === '0.0.0.0' ? 'localhost' : config.host;
const addr = `http://${shownHost}:${config.port}/`;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  // Most likely PumaBass is already running: show that one instead.
  console.log(`Port ${config.port} is in use, probably by PumaBass already running. Opening ${addr}`);
  openBrowser(addr);
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
  console.log(`PumaBass is running at ${addr}  (stop it with Ctrl+C, or close this window)`);
  openBrowser(addr);
});
