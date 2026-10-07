// PumaBass local server: serves the web player plus song charts/audio read
// straight out of the Rocksmith 2014 install.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Library } = require('./library');

const APP_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const config = Object.assign({
  rocksmithDir: 'D:/SteamLibrary/steamapps/common/Rocksmith2014',
  port: 8014,
  openBrowser: true,
}, fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {});
const portArg = process.argv.indexOf('--port');
if (portArg > 0) config.port = Number(process.argv[portArg + 1]);

const VGMSTREAM = path.join(APP_DIR, 'tools', 'vgmstream', 'vgmstream-cli.exe');
// What the browser may fetch: the page, its icons and manifest, and web/.
// Never the server code, the cache, your music folder or tools/.
const PUBLIC_FILES = new Set(['index.html', 'manifest.webmanifest', 'icon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'og.png']);
const PUBLIC_DIRS = ['web'];
const lib = new Library({ rocksmithDir: config.rocksmithDir, cacheDir: path.join(APP_DIR, 'cache'), musicDir: config.musicDir || path.join(APP_DIR, 'music') });
fs.mkdirSync(lib.musicDir, { recursive: true });

console.log(`Reading songs from ${config.rocksmithDir} ...`);
lib.load();
console.log(`Found ${lib.songs.length} arrangements (${lib.songs.filter(s => !s.wem && s.userAudio).length} using your own recordings, ${lib.songs.filter(s => !s.wem && !s.userAudio).length} without audio).`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const AUDIO_MIME = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm' };

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/songs') {
      return sendJson(res, lib.songs.map(({ file, sng, wem, userAudio, ...s }) => ({ ...s, audio: wem ? 'game' : userAudio ? 'user' : false })));
    }
    if (p === '/api/info') {
      return sendJson(res, { rocksmithDir: config.rocksmithDir, musicDir: lib.musicDir });
    }
    if (p === '/api/rescan') {
      lib.load();
      return sendJson(res, { count: lib.songs.length });
    }
    let m;
    if ((m = /^\/api\/chart\/(.+)$/.exec(p))) {
      const chart = lib.chart(m[1]);
      return chart ? sendJson(res, chart) : sendJson(res, { error: 'not found' }, 404);
    }
    if ((m = /^\/api\/audio\/(.+)$/.exec(p))) {
      const wav = await lib.audioFile(m[1], VGMSTREAM);
      if (!wav) return sendJson(res, { error: 'not found' }, 404);
      return sendFileRange(req, res, wav, AUDIO_MIME[path.extname(wav).toLowerCase()] || 'application/octet-stream');
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

server.listen(config.port, '127.0.0.1', () => {
  const addr = `http://localhost:${config.port}/`;
  console.log(`PumaBass is running at ${addr}  (close this window to quit)`);
  if (config.openBrowser && !process.argv.includes('--no-open')) execFile('cmd', ['/c', 'start', '', addr], { windowsHide: true });
});
