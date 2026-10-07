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

## Song library

- [ ] **Play counter.** Count how many times each song is played.
- [ ] **Favorites.** A favorite button on each song, and a filter that shows only favorites, as a personal library.
- [ ] **Times finished.** A "times played" count that only counts plays where the song was *finished*.

## Settings and setup

- [ ] **Calibrate the offset.** Settings gets a global audio/video offset with a calibration test: the player taps,
      clicks or strums along with what they see as "in time", and the measured difference sets the offset.
- [ ] **Tuner.** A tuner that appears automatically on the first song of the day and when the next song needs a
      different tuning, and can be opened by hand. Best paired with the Real Tone Cable input.

## Platform: the Linux set-top PC

PumaBass's eventual home is a Linux set-top PC with no Steam or Rocksmith on it; the song files will be
copied over by hand.

- [ ] **Ship without songs.** The app carries no song files. It is pointed at a library folder holding the
      user's own songs, chosen in Settings rather than hard-coded.
- [ ] **Any folder of songs.** Scan the chosen folder (and its subfolders) for `.psarc` files, rather than
      expecting a Rocksmith install's layout. Note: the on-disc songs need `songs.psarc` *and* `audio.psarc`
      copied together, since their audio lives in the second one.
- [ ] **Runs on Linux.** A `start.sh` beside `start.bat`, the Linux build of vgmstream, and no Windows-only
      paths or commands (today the default Rocksmith path is `D:/…` and the browser is opened with `cmd`).

## Later (from earlier conversations)

- [ ] **Real Tone Cable.** Listen to the bass through the Real Tone Cable or an audio interface and mark notes as hit or missed.
- [ ] **Guitar parts.** Lead and rhythm already load and render on six strings; polish them as first-class parts.
