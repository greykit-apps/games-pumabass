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
- The Rocksmith 1 DLC import pack (`rs1compatibilitydlc_p.psarc`) keeps its audio in `songs.psarc`:
  copy that too, or its songs have no audio.
- Nothing is copied or changed in your songs folder. Decoded audio is cached in `cache/audio`
  (kept under ~3 GB).

## Playing

**Learn a song** on the menu plays along: nothing is marked, and the Real Tone Cable, if it's plugged in, opens
with the song and you hear yourself with it. **Score a song** (`C`, in beta) is the same song list, scored with
the cable (see Scoring).

| Key | Action |
| --- | --- |
| Space | Play / pause (play after a pause starts 6 s back and counts you in) |
| Left / Right | Back / forward 5 seconds |
| Up / Down | Faster / slower (pitch stays the same) |
| L | Loop the current section (again to stop) |
| R | Riff repeater: the loop, a little faster each time round |
| [ / ] | Set loop start / end at the current spot |
| Shift + click progress bar | Move the nearest loop edge there |
| Home | Back to loop start (or song start) |
| , | This song's settings: audio offset, highway, volume |
| T | The tuner |
| V | The view: the highway, or tab in its place |
| N | The notation over the highway: standard notation, tab, both, off |
| B | Recorded bass: full, reduced, cut |
| F | Make the song a favorite |
| Mouse wheel (paused) | Scrub |
| Esc | Back to the song list, then the menu |

At the end of a song the end screen says, in a sentence, how far you got and whether it counted as
finished, with the notes, difficulty and speed under it, and the score when scoring. Played
through, the stage comes back behind it with its lights up. `Space` goes to the main menu with nothing
left to resume, `R` plays it again, `Esc` goes to the song list.

In the song list: `/` searches, Up / Down move, Enter plays, `F` hearts a favorite.

**Difficulty** is Rocksmith's own rating for each part (0 to 1, for the full chart), shown as a bar of
1 to 5 steps: under 0.2 is one, then a step for each 0.1, five from 0.5 up. Sort by **Difficulty** for the
easiest first.

**Your library.** Heart songs (the ♡ on each row, `F`, or in the player) and **♥ Favorites** shows only
those. **Plays** counts each time a song is started (pause-and-continue, or Resume game, is the same
play); **Finished** counts the times it was played through to its last note, with at least half of
what was ahead actually played. Sort by **Most played**. These are kept in the browser, like the rest
of your settings (and cleared by Forget everything).

- **Difficulty**: 100% is the full chart; lower values use Rocksmith's simpler levels.
- **Settings** (title menu) is for setting up: the songs folder, the instrument input, the screen (TV
  or computer), how far ahead notes appear, which way up the strings go (low string on top, as in
  Rocksmith, unless you turn it over), left-handed (the highway mirrored, the nut on the right; tab and
  notation read the same either way), whether notes carry their fret numbers, the speed songs start at,
  and Forget everything. What changes from song to song (the mix, recorded bass) is in the
  player's Mix panel (`,`). Charts without audio are hidden from the song list; the button at its
  foot shows them. There is no mute: PumaBass is nothing without its sound.

**Riff repeater** (`R`, or the button by Loop): loops the section and speeds it up each time round,
from 60% to full speed in 5% steps. When scoring, a time round only speeds it
up when 70% of its notes were hit.

## Reading music

Over the top of the highway, the part scrolls by in **standard notation over tab**, as a printed bass
chart has it, so you can learn to read while you play. `N` steps through standard notation, tab, both, and off
(Settings → Notation has the same, and the names).
A blue playhead sits a little in from the left: notes cross it as you play them, and the rest of the band
is what's coming. The standard notation, the tab and the note names under the notes each turn on and off in Settings →
Notation; with both staff and tab up, the gap between them is set for each song from its lowest and
highest notes, so nothing runs into the tab. Settings → Highway can also put note names on the highway's
notes instead of frets.

The tab's notes are chips in their strings' colours, as on the highway, each with its fret on it, and the strings
are named at the left (a guitar's top string as a small e). A chord's name sits over the tab where the chord
changes. With a capo, the tab counts frets from the capo, as tab with a capo is written, and says so at the
left; the highway shows the capo on the board, with its real fret numbers. When scoring, a note you hit lights up and stays lit as it scrolls away; a miss fades
back (playing along, every note fades as it goes by).

Or play from the tab: **tab view** (`V`, or Settings → View) puts the tab, large, in the highway's place, laid
out like a page. The bars stand still, in lines across the screen, the current line on top and the next below it.
The cyan line runs along the current line as you play; at its end it drops to the next line, and the lines glide
up to bring in the one after. The notation (`N`) is the highway view's.

- It's written from the chart: each note is fitted to the chart's own beats (16ths, or triplets where they
  fit a beat better), its pitch is worked out from the string, fret and tuning, and the key signature is
  the one that leaves the fewest accidentals. Bass is written an octave above where it sounds, in bass
  clef, as bass parts are; guitar likewise in treble clef.
- Rocksmith's timings aren't perfectly on the grid, so now and then a rhythm is written a little
  differently from how you'd write it by hand. Techniques are shown as Rocksmith shows them, an icon
  on the note (▼ hammer-on, ▲ pull-off, ✕ fret-hand mute, a ring for a harmonic...) and a tail that curves for a
  slide, lifts for a bend, waves for vibrato; the tab's chips carry the same icons and marks. They're not yet
  marked in the standard notation. Chords are Rocksmith's too: a chord played again straight after is its
  frame alone (with a palm-muted or fret-hand-muted strum's icon in it), a held hand shape is a faint tunnel
  back from its frame, and an arpeggio's frame brackets the frets of the shape.
- Drawn by [VexFlow](https://www.vexflow.com/) 5.0.0 (MIT), kept in `web/vendor/vexflow/` so it works
  without the internet.

## Songs without audio

Some charts ship without their audio (e.g. the Rocksmith 1 DLC import pack without `songs.psarc`). To play one, drop your
own recording into the `music` folder named like `Artist - Title.mp3` (or just `Title.mp3`), then
press **Rescan**. mp3, ogg, flac, m4a and wav work. Settings → Song list → **Show them** lists the
charts still waiting for a recording. Your recording probably won't line up exactly, so use the
song's audio offset (`,`), which goes up to ±15 s for these. It is remembered per song.

## Timing

**Sync** (on the menu, `Y`) lines up the picture, the sound and the cable. It runs in the
player like a short song, in two steps:

- **Line up.** A tick sounds on every beat while a bar swings left and right, reaching a side on every
  beat. Move the bar (`←` / `→`, 5 ms a press, `Shift` for 20; or the buttons) until it lands right on
  the tick, then `Enter`. That is the offset for every song's notes, changed live as you go and starting
  from the one in use, so a small correction is a few presses. The tick plays through the same media
  path as a song, and the bar runs on the highway's clock, so what lines up here lines up in a song.
- **Play along** (with the Real Tone Cable open). Quarter notes on the open E string come down the
  highway with the tick: after a count-in, 32 of them, the first four a warm-up. With picture and sound
  lined up, how late your plucks reach PumaBass against the notes is the allowance scoring makes for the
  cable (measured from the allowance in use). Plucks are found the way scoring finds them, through the
  same clock, so what is measured is what scoring sees.
- **Soundcheck**, inside the play-along, as Rocksmith's calibration has one. Through the count-in you
  hold the strings quiet, and the cable's own noise is measured (its typical level, plus 2 dB, as
  Rocksmith does); the notes after it give your playing level. The result says whether your level is
  good, too loud (clipping), or quiet next to the cable's hum and hiss, and what to turn. Kept with
  **Use these**, for that input: scoring then takes nothing within 10 dB of the noise for a note, so
  mains hum can't pass for a low B, and no pluck for anything near it.

`Esc` at any point leaves with the offsets as they were. A song's own offset (`,`) adds to the one set
here. Run it again when you change speakers, headphones or screen: Bluetooth and TVs add delay.

## Real Tone Cable and the tuner

Plug your bass into the Rocksmith Real Tone Cable and press **T** (or **Tuner** on the menu or in the
player). The first time, the browser asks to let PumaBass use audio inputs; allow it. The cable is
found by name; any other audio input (an audio interface, a microphone) can be chosen in
**Settings → Instrument input**.

- The tuner aims for the song's tuning, including the few cents some Rocksmith songs sit off A440
  (Dream On, for one, is +17). It ticks each string off once it holds within 3 cents.
- It opens by itself on the first song of the day and when a song needs a different tuning from the
  last (close it to skip). It only does so once an input has been chosen and is plugged in.
- **Hear your bass** plays the input through PumaBass, for a bass plugged into the cable instead of
  an amp. It's on to start with: opening a song opens the cable too, if it's plugged in. There's a short
  delay on the way (the browser's audio path); a splitter to an amp has none, so turn it off for one.
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

Scoring is in beta, and a mode of its own: **Score a song** on the menu (`C`). With the Real Tone Cable (or any
input) open, each note is judged as it lands: a ring in the string's colour for a hit, a red cross for a miss, and
accuracy and streak in the top bar. The end screen gives the score, best streak, typical timing (early
or late), a strip of the song coloured by section, and your best accuracy over full plays.

- A note counts when it's plucked within 200 ms early to 300 ms late (Rocksmith 2014's own windows), in real time (so slowed-down
  practice is judged the same), and its pitch is right. Scoring is forgiving about a muddy signal (the
  last note still ringing, an open string nobody muted, a weak fundamental): the pitch counts when it's
  there at all (within half a semitone), and is wrong only on clear evidence of another note, a fret or
  more away or the octave above. Plucked on time with the pitch merely unclear, a note gets the benefit
  of the doubt; a soft pluck with no click counts when its pitch starts right then. Each pluck goes to
  its nearest note, so a fast run can't lend one note's pluck to another, and a note still ringing from
  before never counts again. `node tools/check-scoring.mjs --sloppy` plays like a learner through a real
  cable (dragging, notes left ringing, soft plucks, an open string ringing) to keep it forgiving.
- Hammer-ons and pull-offs need the new pitch (and not to have been ringing already); muted notes and
  harmonics, the pluck; chords, the pluck alone (a wrong chord shape isn't caught).
- The input is recorded continuously on the audio thread (`web/js/capture-worklet.js`), stamped with
  the audio clock, so judging doesn't depend on the screen's frame rate.
- A pluck is a jump in the input's high end against the stretch just before it, averaged over more than
  a period of the lowest string: a low note's waveform spikes once a period, and those spikes must not
  count as plucks (`node tools/check-plucks.mjs` checks this, from a 5-string's low B to the 12th fret).
- Run **Sync** (on the menu) with the cable first: it sets how late your plucks reach PumaBass, and its
  soundcheck sets the cable's noise floor. A pluck that lands just before a note's window is a miss
  ("too early"), not a soft pluck on time.

**Takes, for tuning.** If notes you played are marked missed, tick **Record a take** in the Mix panel
and play; **Save take** (there, or `S` on the end screen) then writes what the cable heard, with the
song's notes and each verdict, to `takes/` in the PumaBass folder (your playing stays on your computer;
git ignores it). Nothing is recorded unless you tick it: a song's worth of input is ~100 MB of memory. Then
`node tools/replay-take.mjs "takes/<name>.json" --notes` replays it through scoring exactly as it ran and
shows, note by note and by string and fret, why each miss was a miss.

`node tools/check-scoring.mjs` plays synthesized performances of six songs from your library (human
timing, stiff strings, weak fundamentals, plus skipped notes, wrong frets, the octave above, and badly
timed plucks), a timing sweep at full and 70% speed, and rests over mains hum. On 2,079 notes: 98.8% of
right notes score as hits (hammer-ons and pull-offs 93%, chords 100%); wrong frets get through 0% of the
time, skipped notes 1%, the octave above 6%, hum under a rest (with a soundcheck) 0%; the timing windows
are exact. It needs the songs, so it runs locally. How Rocksmith 2014 does all this, as far as its own
files tell, is in [DETECTION.md](DETECTION.md).

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
| `cdlcDir` | custom songs you download (.psarc), read alongside your songs folder | `cdlc/` |
| `musicDir` | recordings for charts without audio | `music/` |
| `cacheDir` | decoded audio and the song index | `cache/` |
| `openBrowser` | open a browser on start | `true` |

For one run: `./start.sh --port 8015 --library /path/to/songs --no-open` (start.bat takes the same).

### Starting with the computer (Linux)

`tools/pumabass.service` runs PumaBass as a systemd user service; the steps are in the file. Point
a full-screen browser at it, e.g. `chromium --kiosk http://localhost:8014/`.

On a big screen PumaBass draws every screen larger, laid out as a 1280 × 720 window would be (1.5×
on a 1080p TV), so it reads from the couch. At a desk, **Settings → Screen → Computer, up close**
turns that off.

While PumaBass is open it keeps the screen from sleeping (the browser's Screen Wake Lock), so the TV
doesn't dim mid-song. The browser passes the
request on to the system, and how well that holds depends on the desktop: if the screen still blanks on
the set-top PC, switch its screensaver or display power saving off (e.g. `xset s off -dpms`).

### Notes

- vgmstream is found in `tools/vgmstream/`, or on your `PATH`. The release is pinned in
  `tools/get-vgmstream.sh`; its Linux build is for x86-64 (on ARM, build it from source).
- The server only hands the browser `index.html`, its icons and manifest, and `web/`, and only
  answers to `localhost` unless `host` says otherwise.

## The greykit.games standard

PumaBass follows games-meta's `STANDARD.md` for Tactical games:

- §1 the credit, on the title and in About;
- §2 Settings → This browser → Forget everything, which removes only `pumabass*` keys;
- §3 the boot and title screen: `web/js/title.js` carries `canon/gk-title.js` byte for byte. The boot
  is the studio ident, exactly as in every Tactical game; the title keeps the canon's markup, menu and
  keys, but **wears PumaBass's own look** (below), as do the canon's sheets;
- §4 the palette: `web/style.css` opens with `canon/gk-tokens.css` byte for byte, and PumaBass's look
  is built on those colours;
- §5 storage keys `pumabass_<feature>_v<n>` (prefs, offsets, recent, resume, muted, tuner, favorites, stats);
- §6 the title menu, §7 Settings in order; not §8: there is no mute (no `M`, no header switch), by choice,
  since the game is nothing without its sound;
- §9 page metadata and icons, §10 `tools/check-assets.js` byte for byte, run by CI's validate stage;
- §11 no native dialogs.

The deliberate gaps: CI has no deploy stage, because PumaBass runs on your own computer; and from the
title on, PumaBass has its own look rather than the Tactical one: heavy condensed caps (Saira Condensed,
leaning), glossy navy tiles, and a cyan selection bar for whatever you're on, in the greykit palette.
It restyles the canon title and sheets from `web/style.css` (selectors start with `html` to win over the
canon's injected CSS) without touching their copies. `PRODUCT.md` and `DESIGN.md` describe the product
and the look.
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
- `web/js/app.js`: starts the page and routes the keys; the page's parts are its own modules:
  - `core.js`: what every part shares (elements, the song's audio and mixer, the highway, the
    instrument input, which screen is up, the song library);
  - `store.js`: what is kept in the browser; `api.js`: the server;
  - `menu.js`: the title, Settings and Help; `library-screen.js`: the song list and songs folder;
  - `player.js`: the player and its frame loop, with `repeater.js` (the riff repeater),
    `end-screen.js`, `takes.js` and `sync-test.js` (the sync test's flow);
  - `instrument.js`: choosing the input, hearing it, the mix and the tuner
- `web/js/calibrate.js`: the sync test itself (`node tools/check-sync.mjs` tests it)
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
- `server/server.js`: the local web server, settings, the folder picker, takes
- `start.sh`, `start.bat`; `tools/get-vgmstream.sh`; `tools/pumabass.service`
- [`ROADMAP.md`](ROADMAP.md): what's next
