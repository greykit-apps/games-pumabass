# Making your own songs

PumaBass is made for playing songs you chart yourself: any song you have a recording of, written down
the way you want to learn it. A song for PumaBass is one file, a `.psarc`, holding the chart and the
audio. Two free programs make one, the same two the custom-song community uses:

| Step | Program | Runs on | Does |
| --- | --- | --- | --- |
| 1 | [Editor on Fire](https://ignition4.customsforge.com/eof) (EOF) | Windows, Mac | charting: you place the notes against the recording |
| 2 | [DLC Builder](https://github.com/iminashi/Rocksmith2014.NET/releases) | Windows, Mac, Linux | packing: chart + audio + cover + names into a `.psarc` |
| – | [Wwise](https://www.audiokinetic.com/download/) (Audiokinetic) | Windows (Linux via Wine) | used by DLC Builder to convert the audio; free |

In the game, **Help → Make your own** has the short version of these steps, and **Make your own songs**
on the song list opens it.

## Before you start

- **A recording** of the song: wav, ogg or mp3.
- **The part**: by ear, or a tab to start from. EOF imports Guitar Pro files (`.gp3`–`.gp5`, `.gpx`).
- **A cover picture**, square, ideally 256×256 or larger: `cover.png`.
- **Wwise**, version 2019, 2021, 2022 or 2023. In the Audiokinetic Launcher, install only the
  **Authoring** package, then open Wwise once; DLC Builder's audio conversion may not work until you
  have. DLC Builder finds it on its own on Windows; on Linux it runs Wwise's console program under
  Wine (set its path in DLC Builder's configuration).

## 1. Chart it in Editor on Fire

1. Create a new project from your recording.
2. **Make a tempo map**: line EOF's beat markers up with the beats of the recording. This is what keeps
   the notes in time with the music, so take care over it; a song with a steady tempo needs only the
   first beat placed and the tempo set.
3. Choose the **PART REAL_BASS** track and place the notes: string and fret for each, with slides,
   bends, hammer-ons, mutes and the rest where you play them. Or import a Guitar Pro tab into that
   track and correct it.
4. Mark the **sections** (intro, verse, chorus, solo…). PumaBass's bar along the bottom, its loops and
   the riff repeater all work by section.
5. In EOF's Import/Export preferences, turn on **Save separate Rocksmith 2 files**. Saving the project
   now also writes the bass part as a Rocksmith 2014 arrangement, an `.xml` file in the project folder.

## 2. Pack it in DLC Builder

1. Start a new project. Fill in the title, artist, album and year: PumaBass's song list shows them.
2. **Add the arrangement**: the bass `.xml` from EOF's project folder. Check that it's a Bass
   arrangement, with the tuning you played in.
3. **Audio**: your recording. DLC Builder converts it with Wwise, and can make the short preview clip
   too.
4. **Cover**: `cover.png`.
5. The **tone** matters only to Rocksmith: PumaBass plays your bass as it comes from the cable, so
   whatever DLC Builder starts you with is fine.
6. **Build a release.** The packages land in the project folder, a PC one (`_p.psarc`) and a Mac one
   (`_m.psarc`); either plays. DLC Builder also writes the simpler difficulty levels if the chart has
   none, which PumaBass's **Notes** slider uses.

Save the DLC Builder project beside the EOF one: after fixing the chart, a rebuild is open, build.

## 3. Play it

Put the `.psarc` in PumaBass's `music/` folder and press **Rescan**. It's on the **Music** tab.

- Notes early or late all the way through: run **Sync** first, as that is your speakers and screen.
  Early or late for this song alone: fix the tempo map in EOF and build again, or nudge the song's
  audio offset in the Mix (`M`).
- Notes drift out of time partway: the tempo map is off there. Fix those beats in EOF.

## Or download songs

Short of time? [CustomsForge](https://customsforge.com/) has songs other people have charted. Put them
in `cdlc/`. PumaBass is also compatible with Rocksmith 2014's own song files: see
[Your songs](README.md#your-songs) in the README.
