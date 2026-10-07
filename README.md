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
| T | The tuner |
| B | Recorded bass: full, reduced, cut |
| F | Make the song a favorite |
| M | Sound on / off, anywhere |
| Mouse wheel (paused) | Scrub |
| Esc | Back to the song list, then the menu |

At the end of a song an end screen shows what you played (notes, difficulty, speed, how much you
played, whether it counted as finished, and the song's totals), with the score panel reserved for
scoring. `Space` goes to the main menu with nothing left to resume, `R` plays it again, `Esc` goes
to the song list.

In the song list: `/` searches, Up / Down move, Enter plays, `F` stars a favorite.

**Your library.** Star songs (the ☆ on each row, `F`, or in the player) and **★ Favorites** shows only
those. **Plays** counts each time a song is started (pause-and-continue, or Resume game, is the same
play); **Finished** counts the times it was played through to its last note, with at least half of
what was ahead actually played. Sort by **Most played**. These are kept in the browser, like the rest
of your settings (and cleared by Forget everything).

- **Difficulty**: 100% is the full chart; lower values use Rocksmith's simpler levels.
- **Settings** (title menu): how far ahead notes appear, string order, whether charts without audio
  are listed, sound, the speed songs start at, and Forget everything.

## Songs without audio

Some charts (e.g. the Rocksmith 1 import pack) ship without their audio. To play one, drop your
own recording into the `music` folder named like `Artist - Title.mp3` (or just `Title.mp3`), then
press **Rescan**. mp3, ogg, flac, m4a and wav work. Settings → Song list → **Show them** lists the
charts still waiting for a recording. Your recording probably won't line up exactly, so use the
song's audio offset (`,`), which goes up to ±15 s for these. It is remembered per song.

## Timing

**Settings → Timing → Sync test** lines up the notes, the sound and the cable, in half a minute on
the highway itself. It plays like a short song in two passes:

- **Watch:** no sound; notes at the 12th fret on the D and G strings (where a pluck is clearest).
  Play each one as it lands.
- **Listen:** no notes; clicks. Close your eyes and play along.

Each pass measures how late your playing is. Your own feel and the cable's delay are in both; the
picture's delay only in Watch, the sound's only in Listen. So Listen minus Watch is how much later the
sound reaches you than the picture: the offset for every song's notes (nudge it by 10 ms in Settings;
a song's own offset, `,`, adds to it). And with the Real Tone Cable open, Watch is how late your plucks
reach PumaBass against the notes you see: the allowance scoring makes for the cable. Plucks are found
the way scoring finds them, through the same clock, so what the test measures is what scoring sees.
Without the cable, tap any key or click; that sets the notes' offset only. Run it again when you change
speakers, headphones or screen: Bluetooth and TVs add delay.

## Real Tone Cable and the tuner

Plug your bass into the Rocksmith Real Tone Cable and press **T** (or **Tuner** on the menu or in the
player). The first time, the browser asks to let PumaBass use audio inputs; allow it. The cable is
found by name; any other audio input (an audio interface, a microphone) can be chosen in
**Settings → Instrument input**.

- The tuner aims for the song's tuning, including the few cents some Rocksmith songs sit off A440
  (Dream On, for one, is +17). It ticks each string off once it holds within 3 cents.
- It opens by itself on the first song of the day and when a song needs a different tuning from the
  last; **Settings → Tune before playing** turns that off. It only does so once an input has been
  chosen and is plugged in.
- **Hear your bass** plays the input through PumaBass, for a bass plugged into the cable instead of
  an amp. There's a short delay on the way (the browser's audio path); a splitter to an amp has none.
- **The mix** (`,` in the player): **Your bass** boosts the cable's quiet signal by up to +30 dB
  (default +12), **Song** sets the record's level, and a meter on each helps set them about level.
  A limiter on the two together keeps a big boost from distorting.
- **Recorded bass** (`B`): Full, Reduced or Cut. A finished record has no separate bass track, so
  this cuts the low end of the centre of the stereo mix, where the bass sits, and leaves the sides
  (guitars panned left and right) alone. Measured on Sweet Emotion: Cut takes the bass range down
  about 20 to 25 dB (30 to 150 Hz), 14 dB at 150 to 250 Hz, and leaves everything above 500 Hz as it
  was. The bass's upper overtones remain, and the kick drum loses some thump; Full is untouched.
- Inputs only work when the page is opened as `http://localhost:…` on the computer PumaBass runs
  on: browsers refuse microphones to plain-http addresses elsewhere.
- **Kiosk browsers** (e.g. `chromium --kiosk` on a set-top PC) may have nowhere to show the
  permission question. Either allow it once in a normal window first (Chromium remembers it), or
  allow it by policy: put `{ "AudioCaptureAllowedUrls": ["http://localhost:8014"] }` in
  `/etc/chromium/policies/managed/pumabass.json`.

`node tools/check-pitch.mjs` tests the pitch detector on 2,597 synthesized bass and guitar notes
(stiff strings, weak fundamentals, noise, fading plucks): every reading the tuner shows is within
2 cents, nearly all within 1. CI runs it.

## Scoring

With the Real Tone Cable (or any input) open and **Scoring** on (Settings, or the Mix panel `,`),
each note is judged as it lands: a ring in the string's colour for a hit, a red cross for a miss, and
accuracy and streak in the top bar. The end screen gives the score, best streak, typical timing (early
or late), a strip of the song coloured by section, and your best accuracy over full plays.

- A note counts when the right pitch (within half a semitone, octave checked) is plucked within
  130 ms early to 150 ms late, in real time, so slowed-down practice is judged the same. Each pluck
  goes to its nearest note, so a fast run can't lend one note's pluck to another, and a note still
  ringing from before never counts again.
- Hammer-ons and pull-offs need the new pitch (and not to have been ringing already); muted notes and
  harmonics, the pluck; chords, the pluck alone (a wrong chord shape isn't caught).
- The input is recorded continuously on the audio thread (`web/js/capture-worklet.js`), stamped with
  the audio clock, so judging doesn't depend on the screen's frame rate.
- A pluck is a jump in the input's high end against the stretch just before it, averaged over more than
  a period of the lowest string: a low note's waveform spikes once a period, and those spikes must not
  count as plucks (`node tools/check-plucks.mjs` checks this, from a 5-string's low B to the 12th fret).
- Run the **Sync test** with the cable first: it sets how late your plucks reach PumaBass.

**Takes, for tuning.** If notes you played are marked missed, **Save take** (on the end screen with `S`,
or in the Mix panel) writes what the cable heard, with the song's notes and each verdict, to `takes/` in
the PumaBass folder (your playing stays on your computer; git ignores it). Then
`node tools/replay-take.mjs "takes/<name>.json" --notes` replays it through scoring exactly as it ran and
shows, note by note and by string and fret, why each miss was a miss.

`node tools/check-scoring.mjs` plays synthesized performances of six songs from your library (human
timing, stiff strings, weak fundamentals, plus skipped notes, wrong frets, the octave above, and badly
timed plucks) and a timing sweep at full and 70% speed. On 2,104 notes: 99.1% of right notes score as
hits (hammer-ons and pull-offs 94 to 98%, chords 100%); wrong frets and skipped notes get through 0% of
the time, the octave above 2%; the timing windows are exact. It needs the songs, so it runs locally.

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
- `web/js/input.js`, `web/js/tuner.js`, `web/js/pitch.js`: the instrument input, the tuner, and its
  pitch detection (`node tools/check-pitch.mjs` tests it)
- `web/js/scoring.js`, `web/js/capture-worklet.js`: scoring, and the input recorded for it
  (`node tools/check-scoring.mjs` tests it)
- `web/js/title.js`: the canon boot and title screen; `scene.js` is its stage backdrop; `help.js` holds Help and About
- `server/psarc.js`, `server/sng.js`: read Rocksmith `.psarc` archives and `.sng` charts
- `server/library.js`: finds songs in any folder (PC or Mac), song index, chart conversion, audio lookup and decoding
- `server/server.js`: the local web server, settings, the folder picker
- `start.sh`, `start.bat`; `tools/get-vgmstream.sh`; `tools/pumabass.service`
- [`ROADMAP.md`](ROADMAP.md): what's next
