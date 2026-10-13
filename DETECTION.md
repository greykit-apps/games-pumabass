# How Rocksmith 2014 hears you, and what PumaBass took from it

Notes from a look through the Rocksmith 2014 install (2026-10-09), kept to come back to while tuning
PumaBass's note detection and scoring. Only numbers and approach are taken; no Rocksmith files or code are
in PumaBass.

## What could and couldn't be read

- **The detector itself can't be read.** Pitch and pluck detection are compiled into `Rocksmith2014.exe`,
  which is packed: almost no code strings are visible. What shows: it runs on the Wwise audio engine and
  feeds the cable in through Wwise's audio-input source, and it exposes Lua bindings named
  `DetectionBindings`, `GuitarBindings` and `RSAudioBindings`.
- **How the game *uses* the detector can be read**, from its settings files and Lua game scripts:
  - `static.psarc` → `manifests/*.json`: `games.transient.json` (timing windows), `difficulty.transient.json`
    and `ndd.database.json` (difficulty changes), `options_default.profile.json` (input defaults),
    `audio.transient.json`, `statsconfig.database.json`; `localization/maingame.csv` (on-screen text).
  - `cache.psarc` → `cache7.7z` → `behaviors/rs/games/esegrgameactioncontrol.lua` (tuner, calibration,
    detector calls).
  - `RocksmithConfiguration.pdf` in the install folder (audio setup and the `Rocksmith.ini` keys).
- To look again: PumaBass's `server/psarc.js` (`new Psarc(file).list()` / `.extract(name)`) opens the
  archives; `cache7.7z` needs 7-Zip. There is no `Rocksmith.ini` on this PC: the game writes one on first
  launch, and it has never been launched here.

## Input

| Setting | Value | Where |
|---|---|---|
| Sample rate | 48 kHz, 16-bit; the cable as 1 channel | configuration PDF |
| Exclusive mode | on (`ExclusiveMode=1`, `AudioExclusivity: true`) | PDF, default options |
| Buffers | `LatencyBuffer` 4 (fast PCs 2, fastest 1); buffer size usually 1024, 512 on fast PCs | PDF |
| Input gain | `InputVolumeCalibration` -6.0 | default options |
| Noise floor | `NoiseFloor` -65.0 dB | default options |
| Picture lag | `VisualLagCalibration` 50 | default options |

**Calibration** (the Lua script): the gain starts at -30 dB and is raised while you strum, until a level
meter tops out; that gain is kept. Then, strings muted, the noise floor is set to the level a second
earlier plus 2 dB. During play the game also adjusts the cable's gain on its own, warns about sudden
volume changes, and says that setting the gain by hand, or playing out of tune, hurts detection.

## Note detection, as the game uses it

- Pitch is a **fractional MIDI note number**, compared with the note the string, fret and tuning give.
- A reading only counts if it is within about **5 semitones below to 4 above** the expected note.
- **30 cents** is the tuner's "in tune", and the margin for the wrong-string check (the same fret on
  another string). How far off a note may be **during a song** is in the exe: not readable.
- The tuner uses a separate, more precise detector mode; gameplay uses a quick one. There are separate
  bass and guitar detection classes.
- The detector also reports whether the strings are muted, whether the input is clipping, and grades
  palm mutes and slap/pop.

## Scoring

- **Timing:** a note can be hit from **200 ms early to 300 ms late**, and is missed at **500 ms late**;
  chords the same (`NoteBackwardDelay -0.2`, `NoteForwardDelay 0.3`, `MissedLateDelay 0.5`).
- **Dynamic difficulty:** a phrase levels up at **100%** of its notes hit, down below **50%**, and at once
  below **25%**. Level-up needs 1 to 2 clean passes; level-down 2 failed passes at low levels, up to 6 at
  high ones.
- A song counts as mastered from about **70% accuracy**. A streak is only recorded after 25 notes.

## What PumaBass does with it

| | Rocksmith 2014 | PumaBass |
|---|---|---|
| Timing window | -200 / +300 ms | **-200 / +300 ms** (was -150 / +180), in real time |
| Calibration | strum loud, then mute | **Sync's soundcheck:** quiet through the count-in (noise + 2 dB), level from the play-along; advice if too loud, too quiet or noisy |
| Noise floor | gates detection | nothing within 10 dB of it is a note, and no pluck is near it (mains hum can't pass for a low B) |
| Gain | set by the game, on the cable | can't be set from a browser: the soundcheck says what to turn instead |
| Pitch check | "is the expected note there?" | the same: the expected period and its octave, not a blind pitch guess (`web/js/scoring.js`); after a pluck, with the strings ringing below the note filtered out |
| Pitch tolerance | 30 cents in the tuner; play unknown | 50 cents in play; the tuner 3 cents |

**Tried and dropped (2026-10-09):** a second pluck detector listening for the volume jumping, for soft
finger plucks with no click. A re-pluck of a note still ringing is only a ~3 dB jump, and every setting
tried either missed those or found plucks that weren't there; a false pluck is worse than a missed one, as
it lets skipped notes through. A real fix needs real takes from the cable, or a detector for the
waveform's phase breaking at the expected period.

**Re-plucks, from real takes (2026-10-11):** the second, for the same note again only (`rePluck` in
`web/js/scoring.js`). On two takes from the cable, a string left ringing carries on in step with itself
two periods back (rarely under 0.7, as nsdf); a re-pluck breaks that, mostly under 0.4, as much by its
jump in level as by starting out of step (bass re-plucks often restart nearly in step). An open string
re-plucked often keeps step with only a few dB more, so at least twice the energy (over whole periods)
counts too: a string left alone gained that 3 times in 200. It only counts with the note steady on both
sides (20 ms clear of the finger coming down) and the level not dropping.

**The benefit of the doubt (2026-10-11):** a fast run of one note (eighths 0.24 s apart) leaves no room
for that test, and on a real take half its re-plucks made no click. So a plucked note with no pluck heard
now counts when its pitch is there at the end of its window, re-plucked or left ringing: it would take a
cleverer detector to call it wrong, and that's close enough to right. Judged at the end of the window, not
anywhere in it, so a soft wrong note after the same one still ringing isn't credited off the old one.
In a fast run (eighths 0.23 s apart) the end of the window holds the next note's soft, unheard pluck,
which can come 0.1 s early: unless the end clearly says right or wrong, the latest look that's over
before then decides.

## Ideas not yet done

- A **level-up/down per phrase** (Dynamic Difficulty) using the thresholds above.
- A **wrong-string hint**: the same note on a neighbouring string, as Rocksmith checks.
- **Takes from the real cable** remain the way to tune any of this: `Record a take` in the Mix, then
  `node tools/replay-take.mjs`.

## Outside sources

- Ubisoft's Rocksmith+ dev diary (Feb 2022): the cable is a WASAPI device, ~25 ms round trip; chord
  detection weights the root and third.
- US 9,120,016 and 9,839,852 ("Interactive guitar game", Ubisoft): no detection algorithm. Example scoring
  only: 75 points a note, 125 a chord, streak multipliers at 10 and 20. The second was ruled invalid in 2020.
- Apple's US 8,309,834 / 8,592,670 ("Polyphonic note detection"): an FFT every 256 samples, a peak within
  ±2% of each expected harmonic, 2 to 3 harmonics to start a note, 1 to keep it. A useful model for chords.
