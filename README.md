# PumaBass

A note highway for the Rocksmith 2014 songs you already own. It ships with no songs: point it at a
folder of your own song files (`.psarc`) and it plays them, no Steam or Rocksmith needed. Bass
first; lead and rhythm guitar charts load too. Runs on Linux and Windows. Part of the
greykit.games portfolio, in its Tactical tribe.

## Set up

You need [Node.js](https://nodejs.org) 18 or newer, and vgmstream, which decodes the songs' audio.

**Linux** (e.g. a set-top PC):

```bash
./tools/get-vgmstream.sh
./start.sh
```

**Windows**: run `tools/get-vgmstream.sh` once from Git Bash (or unzip `vgmstream-win64.zip` from
[vgmstream's releases](https://github.com/vgmstream/vgmstream/releases) into `tools/vgmstream/`),
then double-click **start.bat**.

Either way the app opens in your browser at http://localhost:8014/ (without a desktop, open that
address yourself). On first run, **Learn a song** asks for your songs folder.

## Your songs

PumaBass reads Rocksmith 2014 song files (`.psarc`) from one folder, and the folders inside it:
a whole Rocksmith install, a copied `dlc` folder, a USB stick, or a mix. Choose or change it in
**Settings → Song library**, and press **Rescan** after adding songs.

- PC (`_p.psarc`) and Mac (`_m.psarc`) files both work; when both are there, the PC one is used.
- The songs on the Rocksmith disc keep their charts in `songs.psarc` and their audio in
  `audio.psarc`. Copy both, anywhere in the folder.
- Nothing is copied or changed in your songs folder. Decoded audio is cached in `cache/audio`
  (kept under ~3 GB).

## Playing

| Key | Action |
| --- | --- |
| Space | Play / pause (play after a pause starts 6 s back and counts you in) |
| Left / Right | Back / forward 5 seconds |
| Up / Down | Faster / slower (pitch stays the same) |
| L | Loop the current section (again to stop) |
| [ / ] | Set loop start / end at the current spot |
| Shift + click progress bar | Move the nearest loop edge there |
| Home | Back to loop start (or song start) |
| , | This song's settings: audio offset, highway, volume |
| M | Sound on / off, anywhere |
| Mouse wheel (paused) | Scrub |
| Esc | Back to the song list, then the menu |

In the song list: `/` searches, Up / Down move, Enter plays.

- **Difficulty**: 100% is the full chart; lower values use Rocksmith's simpler levels.
- **Settings** (title menu): how far ahead notes appear, string order, whether charts without audio
  are listed, sound, the speed songs start at, and Forget everything.

## Songs without audio

Some charts (e.g. the Rocksmith 1 import pack) ship without their audio. To play one, drop your
own recording into the `music` folder named like `Artist - Title.mp3` (or just `Title.mp3`), then
press **Rescan**. mp3, ogg, flac, m4a and wav work. Settings → Song list → **Show them** lists the
charts still waiting for a recording. Your recording probably won't line up exactly, so use the
song's audio offset (`,`), which goes up to ±15 s for these. It is remembered per song.

## Settings file and options

The songs folder you choose is saved in `config.json` beside the app. You can also edit it by hand:

```json
{ "libraryDir": "/media/me/songs", "port": 8014, "host": "127.0.0.1", "musicDir": "/home/me/bass-recordings" }
```

| Key | What | Default |
| --- | --- | --- |
| `libraryDir` | your songs folder | none: chosen in Settings |
| `port` | the address's port | 8014 |
| `host` | who may connect: `127.0.0.1` is this computer only; `0.0.0.0` lets other devices on your network in (they can then see your folder names in the picker) | `127.0.0.1` |
| `musicDir` | recordings for charts without audio | `music/` |
| `cacheDir` | decoded audio and the song index | `cache/` |
| `openBrowser` | open a browser on start | `true` |

For one run: `./start.sh --port 8015 --library /path/to/songs --no-open` (start.bat takes the same).

### Starting with the computer (Linux)

`tools/pumabass.service` runs PumaBass as a systemd user service; the steps are in the file. Point
a full-screen browser at it, e.g. `chromium --kiosk http://localhost:8014/`.

### Notes

- vgmstream is found in `tools/vgmstream/`, or on your `PATH`. The release is pinned in
  `tools/get-vgmstream.sh`; its Linux build is for x86-64 (on ARM, build it from source).
- The server only hands the browser `index.html`, its icons and manifest, and `web/`, and only
  answers to `localhost` unless `host` says otherwise.

## The greykit.games standard

PumaBass follows games-meta's `STANDARD.md` for Tactical games:

- §1 the credit, on the title and in About;
- §2 Settings → This browser → Forget everything, which removes only `pumabass*` keys;
- §3 the boot and title screen: `web/js/title.js` carries `canon/gk-title.js` byte for byte;
- §4 the palette: `web/style.css` opens with `canon/gk-tokens.css` byte for byte;
- §5 storage keys `pumabass_<feature>_v<n>` (prefs, offsets, recent, resume, muted);
- §6 the title menu, §7 Settings in order, §8 sound (`M`, `pumabass_muted_v1`, a header switch named Sound);
- §9 page metadata and icons, §10 `tools/check-assets.js` byte for byte, run by CI's validate stage;
- §11 no native dialogs.

The one deliberate gap: CI has no deploy stage, because PumaBass runs on your own computer.
Don't edit the canon copies here; change them in games-meta and copy them back.

### Icon and share card

`icon.svg` is drawn by hand. Everything else in the `<head>` is rendered from it:

```bash
bash tools/render-icons.sh
```

That writes the favicons here and runs greykit-meta's `make-assets.sh` for `og.png` and
`apple-touch-icon.png`. It needs headless Chrome or Edge and Python with Pillow.

## Layout

- `index.html`: the page (head tags generated by greykit-meta's `head-tags.sh`)
- `web/js/app.js`: screens, song list, player, settings, storage
- `web/js/highway.js`: the 3D note highway, and the camera path planned for each song
  (`node tools/check-camera.mjs` measures it across your library after any tuning)
- `web/js/chart.js`: difficulty levels, tuning names
- `web/js/title.js`: the canon boot and title screen; `scene.js` is its stage backdrop; `help.js` holds Help and About
- `server/psarc.js`, `server/sng.js`: read Rocksmith `.psarc` archives and `.sng` charts
- `server/library.js`: finds songs in any folder (PC or Mac), song index, chart conversion, audio lookup and decoding
- `server/server.js`: the local web server, settings, the folder picker
- `start.sh`, `start.bat`; `tools/get-vgmstream.sh`; `tools/pumabass.service`
- [`ROADMAP.md`](ROADMAP.md): what's next
