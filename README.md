# PumaBass

A highway-style live-notation engine for upright and electric bass (and to a lesser extent, guitar),
with a tab view, standard notation, a tuner and a basic mixer. It reads `.psarc` song files (audio and
notation together), including Rocksmith CDLC from CustomsForge. Make your own with Editor on Fire, or
ask an AI to.

It runs on your own computer (Linux, macOS or Windows), with a demo song to start on. **Try it in your
browser** at [greykit.com/games/pumabass](https://greykit.com/games/pumabass/), with nothing to install.
Built by [greykit.com](https://greykit.com).

![The note highway: the camera sits close over frets 1 to 4 for the verse riff and its slide, then pulls back and pans up the neck as the chorus moves to frets 7 to 12, where a bent 9 comes down](screenshots/highway.webp)

## Set up

You need [Node.js](https://nodejs.org) 18 or newer, and vgmstream, which decodes the songs' audio.

**Linux or macOS:**

```bash
./tools/get-vgmstream.sh
./start.sh
```

**Windows**: run `tools/get-vgmstream.sh` once from Git Bash (or unzip `vgmstream-win64.zip` from
[vgmstream's releases](https://github.com/vgmstream/vgmstream/releases) into `tools/vgmstream/`),
then double-click **start.bat**.

vgmstream can also be on your `PATH`. Its Linux build is for x86-64; on ARM, build it from source.

PumaBass opens at http://localhost:8014/. Press `Esc` twice on the menu to quit.

## Your songs

Song files (`.psarc`) go in three folders beside PumaBass, each a tab on the song list. Press **Rescan**
after adding songs.

- `music/`: songs you made ([Making your own songs](MAKING-SONGS.md), or **Help → Make your own**).
- `cdlc/`: songs you download, such as from CustomsForge.
- `bundles/`: Rocksmith 2014's own song sets. Disc songs need both `songs.psarc` (charts) and
  `audio.psarc` (audio).

Or point **Settings → Songs** at a Rocksmith folder you already have; nothing in it is changed. Until
you add songs, the **Demo** tab has *Gods of the Copybook Headings* to play.

## Playing

**Learn a song** plays along. **Score a song** is the same, marked.

| Key | Action |
| --- | --- |
| Space | Play / pause (after a pause, counts you in from 6 s back) |
| Left / Right | Back / forward 5 seconds |
| Up / Down | Faster / slower (pitch stays the same) |
| L | Loop the current section (again to stop) |
| R | Riff repeater: the loop, 5% faster each time round, from 60% to full speed |
| [ / ] | Set loop start / end |
| M | The mix, and this song's audio offset |
| B | Recorded bass: full, reduced, cut |
| T | Tuner |
| V | Highway or tab |
| N | Notation: standard, tab, both, off |
| Y | Lyrics |
| F | Favorite |
| S / ? | Settings / Help |
| Esc | Pause; again, the song list |

Click the progress bar to jump (Shift+click moves the nearest loop edge). In the song list: `/`
searches, Up / Down move, Enter plays, `F` favorites.

- **Notes** (beside Speed) thins the chart using Rocksmith's own simpler levels; 100% is the full chart.
- **Favorites, Plays and Finished** are kept in the browser. A song counts as finished when it's played
  to its last note with at least half of it actually played.

## Reading music

`N` scrolls standard notation and tab along the top of the highway; play each note as it crosses the
blue line. `V` swaps the highway for a page of tab. Settings → Notation turns note names on and off.

Notation is written from the chart, so now and then a rhythm comes out differently from how you'd write
it by hand. Drawn by [VexFlow](https://www.vexflow.com/) (MIT), bundled so it works offline.

## Timing

**Sync** (on the menu) lines up the picture, the sound and the cable:

- **Line up.** A tick sounds while a bar swings side to side. Move the bar (`←` / `→`, `Shift` for
  bigger steps) until it lands on the tick, then `Enter`.
- **Play along** (with the Real Tone Cable). Keep the strings quiet through the count-in, then pluck the
  open E with the notes. This sets scoring's allowance for the cable and checks your level.

`Esc` leaves with nothing changed. Run it again after changing speakers, headphones or screen.

## The cable, the tuner and the mix

Plug into the Real Tone Cable and press **T**. The first time, the browser asks to use audio inputs.
Any other input (an audio interface, a microphone) can be chosen in **Settings → Instrument input**.

- The tuner aims for the song's tuning, ticks a string once it holds within 3 cents, and opens by itself
  when the tuning changes.
- Your bass plays through PumaBass with a short delay. With a splitter to an amp, turn off **Hear your
  bass**.
- **The mix** (`M`): set **Your bass** and **Song** about level. **Recorded bass** (`B`) turns the
  record's own bass down or cuts it.
- Inputs only work at `http://localhost:…`: browsers refuse microphones to plain-http addresses elsewhere.

## Scoring

**Score a song** judges each note through the cable: a hit lights up, a miss is crossed out. The end
screen gives your score, best streak, and where to practise.

- A note counts when the right note is plucked 200 ms early to 300 ms late (Rocksmith 2014's own
  windows), in real time, so slowed practice is judged the same.
- Chords count on the pluck alone (a wrong shape isn't caught).
- Right notes marked missed? Tune, then run **Sync** with the cable open.

## Settings file and options

Settings live in `config.json` beside PumaBass. You can edit it by hand:

```json
{ "libraryDir": "/media/me/songs", "port": 8014, "host": "127.0.0.1" }
```

| Key | What | Default |
| --- | --- | --- |
| `libraryDir` | a Rocksmith folder of your own, on its own tab | none: chosen in Settings |
| `port` | the address's port | 8014 |
| `host` | who may connect: `127.0.0.1` is this computer only; `0.0.0.0` lets other devices on your network in (they can then see your folder names in the picker) | `127.0.0.1` |
| `bundlesDir` | the Bundles folder | `bundles/` |
| `cdlcDir` | the CDLC folder | `cdlc/` |
| `musicDir` | the Music folder | `music/` |
| `cacheDir` | decoded audio and the song index | `cache/` |
| `openBrowser` | open a browser on start | `true` |

For one run: `./start.sh --port 8015 --library /path/to/songs --no-open` (start.bat takes the same).

## Playing on a TV

On a big screen PumaBass draws everything larger so it reads from the couch; **Settings → Screen →
Computer, up close** turns that off. It keeps the screen awake while open; if a set-top PC still blanks,
switch its screensaver off (e.g. `xset s off -dpms`).

To start with a Linux computer, `tools/pumabass.service` runs PumaBass as a systemd user service (the
steps are in the file); point a full-screen browser at it, e.g. `chromium --kiosk http://localhost:8014/`.
A kiosk browser may have nowhere to ask for the cable: allow it once in a normal window first, or by
policy, with `{ "AudioCaptureAllowedUrls": ["http://localhost:8014"] }` in
`/etc/chromium/policies/managed/pumabass.json`.
