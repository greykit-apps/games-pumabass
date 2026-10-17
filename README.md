# PumaBass

**A note highway for bass.** A highway-style live-notation engine for upright and electric bass (and to a lesser extent, guitar), with a tab view, standard notation, a tuner and a basic mixer. It reads `.psarc` song files (audio and notation together), including Rocksmith CDLC from CustomsForge. Songs can be made with Editor on Fire, or with an AI.

**Play:** [greykit.com/games/pumabass](https://greykit.com/games/pumabass/), the browser version, with the demo song and nothing to install.

![The note highway: the camera sits close over frets 1 to 4 for the verse riff, then pulls back and pans up the neck as the chorus moves to frets 7 to 12](screenshots/highway.webp)

## Set up

The full version runs locally with [Node.js](https://nodejs.org) 18 or newer, on Linux, macOS or Windows, and needs vgmstream to decode the songs' audio:

```bash
./tools/get-vgmstream.sh
./start.sh
```

On Windows, `tools/get-vgmstream.sh` runs from Git Bash, and **start.bat** starts it. PumaBass opens at http://localhost:8014/; `Esc` twice on the menu quits.

## Songs

Song files (`.psarc`) go in three folders beside PumaBass, each a tab on the song list; **Rescan** picks up new ones.

- `music/`: songs made for it ([MAKING-SONGS.md](MAKING-SONGS.md), or **Help → Make your own**).
- `cdlc/`: downloaded songs, such as from CustomsForge.
- `bundles/`: Rocksmith 2014's own song sets. Disc songs need both `songs.psarc` (charts) and `audio.psarc` (audio).

**Settings → Songs** can also point at an existing Rocksmith folder; nothing in it is changed. Until there are songs, the **Demo** tab has *Gods of the Copybook Headings* to play.

## How it plays

**Learn a song** plays along. **Score a song** is the same, marked: each note is judged through the Real Tone Cable (or any audio input), a hit lights up, a miss is crossed out, and the end screen gives the score, best streak, and where to practise. **Sync**, on the menu, lines up the picture, the sound and the cable. `T` opens the tuner, `M` the mix. Inputs only work at `http://localhost:…`, since browsers refuse microphones to plain-http addresses elsewhere.

`N` scrolls standard notation and tab along the top of the highway; `V` swaps the highway for a page of tab. Notation is written from the chart, so now and then a rhythm comes out differently from how it would be written by hand.

## Keys

| Key | Action |
| --- | --- |
| Space | Play / pause (after a pause, counts in from 6 s back) |
| Left / Right | Back / forward 5 seconds |
| Up / Down | Faster / slower (pitch stays the same) |
| L, R | Loop the section; riff repeater, faster each time round |
| T, M, B | Tuner; the mix; recorded bass full, reduced, cut |
| V, N | Highway or tab; notation |
| S / ? | Settings / Help |
| Esc | Pause; again, the song list |

Help lists the rest.

## Settings

Settings are in the game, and in `config.json` beside PumaBass. On a big screen everything draws larger, to read from a couch. Favorites, plays and finished songs are kept in the browser.

## Credits

Rocksmith is Ubisoft's. PumaBass is not affiliated with Ubisoft and contains no Rocksmith files or code.

Notation drawn by [VexFlow](https://www.vexflow.com/) (MIT), bundled so it works offline. Audio decoded by [vgmstream](https://github.com/vgmstream/vgmstream).

Working on it, the settings file, TV use and how scoring works: [DEVELOPING.md](DEVELOPING.md).

By Matthew "Shan" Romanek, with Claude. Built by [greykit.com](https://greykit.com/).

Made for my own play. Nothing here is offered: no support, no updates, no licence.
