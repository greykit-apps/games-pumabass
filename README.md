# PumaBass

A no-frills Rocksmith 2014 style note highway that plays the songs you already own,
reading them straight out of your Rocksmith install. Bass by default; lead and rhythm
guitar charts are listed too.

## Start

Double-click **start.bat**. It opens the app in your browser at http://localhost:8014/.
Close the black console window to quit.

## Playing

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Skip back / forward 5 seconds |
| ↑ / ↓ | Speed up / slow down (pitch stays the same) |
| L | Loop the current section (again to stop) |
| [ / ] | Set custom loop start / end at the current spot |
| Shift + click progress bar | Move the nearest loop edge there |
| Home | Back to loop start (or song start) |
| Mouse wheel (paused) | Scrub |
| Esc | Back to the song list |

- **Difficulty** slider: 100% is the full chart; lower values use Rocksmith's simpler levels.
- **⚙ Settings**: volume, how far ahead notes appear, inverted strings, and a per-song
  audio offset if the notes feel early or late.

## Songs without audio

Some charts (e.g. the Rocksmith 1 import pack) ship without their audio. To play one,
drop your own recording into the `music` folder named like `Artist - Title.mp3`
(or just `Title.mp3`), then click **Rescan**. mp3, ogg, flac, m4a and wav work.
Tick **Show songs without audio** to see which charts are waiting for a recording.
Your recording probably won't line up exactly, so use the per-song audio offset in ⚙ Settings
(−1s / +1s / ±100 / ±10 ms buttons) until the notes land on the beat. It is remembered per song.

## Setup notes

- The Rocksmith folder defaults to `D:/SteamLibrary/steamapps/common/Rocksmith2014`.
  To change it (or the port / music folder), create `config.json`:
  ```json
  { "rocksmithDir": "D:/SteamLibrary/steamapps/common/Rocksmith2014", "port": 8014, "musicDir": "C:/Music/Bass" }
  ```
- Song audio is decoded with [vgmstream](https://github.com/vgmstream/vgmstream)
  the first time you open a song and cached in `cache/audio` (kept under ~3 GB).
  It isn't stored in git: on a fresh copy, unzip `vgmstream-win64.zip` from its releases page
  into `tools/vgmstream/` so that `tools/vgmstream/vgmstream-cli.exe` exists.

## Layout

- `server/psarc.js` – reads Rocksmith `.psarc` archives
- `server/sng.js` – decrypts and parses `.sng` note charts
- `server/library.js` – song index, chart conversion, audio lookup/decoding
- `server/server.js` – local web server
- `web/` – the player (song list, 3D highway in `web/js/highway.js`)
