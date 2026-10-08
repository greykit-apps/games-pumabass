# PumaBass roadmap

Issues and features to pick up. Add to the list as they come up; tick them off as they land.

## Highway (the play space)

- [x] **Wordmark.** Put the PumaBass wordmark in the upper left of the highway screen.
- [x] **Smooth long jumps.** Fretboard movement on long hand-position jumps is too jerky. For a long jump,
      zoom out until both ends of the jump are in view, then ease back in to where the hand needs to be.
      Keep the number of camera moves down: staying zoomed out (or partly zoomed out) is better than
      several moves back to back.
- [x] **Run-up on resume.** Resuming a song, from a save or just from pause, rewinds 6 seconds and shows a big
      on-screen countdown to when you are "live", so you can get back into the groove.
- [x] **Fret numbers on gems.** The numbers inside the notes overlap the gem borders in an unattractive way.
- [x] **Start paused.** A song opens paused, with a big PAUSED and "Press Space to play" over the highway.
      Later reversed at the user's request: songs start playing at once (every song has ~10 s
      before its first note); PAUSED shows only after pausing.

## Song library

- [x] **Play counter.** Count how many times each song is played.
- [x] **Favorites.** A favorite button on each song, and a filter that shows only favorites, as a personal library.
- [x] **Riff repeater.** `R` loops the section and speeds it up each time round, to full speed; with scoring on,
      only after a time round with 70% hit.
- [x] **Times finished.** A "times played" count that only counts plays where the song was *finished*.

## Settings and setup

- [x] **Calibrate the offset.** Settings gets a global audio/video offset with a calibration test: the player taps,
      clicks or strums along with what they see as "in time", and the measured difference sets the offset.
- [x] **Sync** (main menu, under Tuner). A tick and a bar swinging left and right: the player moves the bar (starting from the
      offset in use) until it lands on the tick. Then, with the cable, quarter notes on the open E string with the tick,
      plucked along for half a minute, which sets scoring's allowance for the cable's delay.
- [x] **Tuner.** A tuner that appears automatically on the first song of the day and when the next song needs a
      different tuning, and can be opened by hand. Best paired with the Real Tone Cable input.
      Done with the Real Tone Cable input; still to try with a real cable.

## Platform: the Linux set-top PC

PumaBass's eventual home is a Linux set-top PC with no Steam or Rocksmith on it; the song files will be
copied over by hand.

- [x] **Ship without songs.** The app carries no song files. It is pointed at a library folder holding the
      user's own songs, chosen in Settings rather than hard-coded.
- [x] **Any folder of songs.** Scan the chosen folder (and its subfolders) for `.psarc` files, rather than
      expecting a Rocksmith install's layout. Note: the on-disc songs need `songs.psarc` *and* `audio.psarc`
      copied together, since their audio lives in the second one.
- [x] **Runs on Linux.** A `start.sh` beside `start.bat`, the Linux build of vgmstream, and no Windows-only
      paths or commands. Tested in WSL Ubuntu 24.04; still to try on the set-top PC itself.

## Later (from earlier conversations)

- [x] **Real Tone Cable input.** The cable (or any audio input) is found and read, with "Hear your bass" to
      play it through PumaBass.
- [x] **End screen.** At the end of a song: what was played, the song's totals, and a Score panel waiting for
      scoring. Space goes to the main menu with no game to resume; R plays again; Esc, the song list.
- [x] **Scoring.** Notes marked hit or missed from the input (on a Scoring switch); accuracy, best streak, timing and
      a per-section strip on the end screen; best accuracy per song. Still to try with a real cable.
- [x] **Low notes in scoring.** The pluck detector took a low string's once-a-period spike for new plucks, so low
      notes went missed; it now compares against more than a period. Takes (`Save take`) and
      `tools/replay-take.mjs` show why any miss was a miss, to tune against a real cable.
- [x] **Balance.** A mix with your bass boosted (up to +30 dB) against the song, meters on both, and a limiter.
- [x] **Recorded bass: Reduced / Cut.** The low end of the mix's centre, cut (about 20 to 25 dB on the bass range).
- [ ] **Recorded bass: removed.** Truly taking the bass out needs stem separation (an AI model such as Demucs),
      run once per song on the PC and cached: a large install, and slow without a graphics card.
- [ ] **Guitar parts.** Lead and rhythm already load and render on six strings; polish them as first-class parts.

## Far future

- [ ] **Chords in scoring.** Chords count on the pluck alone; telling which notes are ringing would catch wrong shapes.
