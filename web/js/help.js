// Help (tabbed) and About, shown in the title's sheets and from the song list and player.

const keys = rows => `<table class="keys">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;

// Each tab fits the TV without scrolling: two columns in a wide box (style.css: .help-cols).
const cols = (left, right) => `<div class="help-cols"><div>${left}</div><div>${right}</div></div>`;

export const HELP = [
  ['Playing', cols(`
<h3>Getting going</h3>
<p><b>Learn a song</b> opens your song list; a song starts as it opens. Its notes come down the highway and land
on their strings in time with the record: play each one as it lands.</p>
<p>After a pause, play starts six seconds back and counts you in. <b>Resume game</b> picks up where you left
off. Done for the day? <kbd>Esc</kbd> twice on the menu quits: it closes PumaBass and stops its server.</p>
<p>The arrow keys move between the buttons on every screen. While a song is up they seek and change speed;
<kbd>Tab</kbd> gets you to the player's own controls, where the arrows move between them (on a slider,
Left and Right set it), and <kbd>Esc</kbd> lets go.</p>
<h3>The bar along the bottom</h3>
<p>The song's sections, coloured by kind. Click to jump; Shift+click moves the nearest loop edge; paused, the
mouse wheel scrubs.</p>
<h3>At the end</h3>
<p>How far you got, and your score when scoring (<b>Score a song</b>). <kbd>Space</kbd> plays it again, <kbd>Esc</kbd> goes to the
song list, <kbd>M</kbd> to the menu, and <kbd>P</kbd> practises the section that went worst.</p>`, `
<h3>Keys while a song is up</h3>
${keys([
    ['Space', 'play / pause'],
    ['Left / Right', 'back / forward 5 seconds'],
    ['Up / Down', 'faster / slower, same pitch'],
    ['L', 'loop this section; again to stop'],
    ['R', 'riff repeater'],
    ['[ and ]', 'loop start / end here'],
    ['Home', 'the loop start, or the top'],
    ['M', 'the mix'],
    ['B', 'recorded bass: full, reduced, cut'],
    ['F', 'favorite'],
    ['T', 'tuner'],
    ['V', 'view: highway or tab'],
    ['N', 'notation over the highway: standard, tab, both, off'],
    ['S', 'Settings'],
    ['?', 'this help'],
    ['Esc', 'pause; again, the song list'],
  ])}`)],
  ['Song list', cols(`
<h3>The list</h3>
<p>The songs you played last wait at the top, under <b>Recently played</b> (on a list too long to see at once). Below, every song, grouped by what
the list is sorted on. Click a column heading to sort by it; again to reverse. Beside the list, an index of
the groups: click one to jump there, or slide along it to skim.</p>
<p>The tabs over the list are your libraries (<b>Your songs</b>): <b>All</b>, then one for each folder with
songs in it, and <b>Demo</b>. Going down the list, the heading and the buttons slide away to show more; going up brings them
back.</p>
<h3>Favorites</h3>
<p>Heart a song (its heart, or <kbd>F</kbd> in the list or in the song). <b>Favorites</b> shows only those: your
own library.</p>
<h3>Plays and Finished</h3>
<p><b>Plays</b> counts each start; a pause or Resume game is the same play. <b>Finished</b> counts playing to the
last note, having played at least half of what was left: jumping to the end doesn't count.</p>`, `
<h3>Keys in the song list</h3>
${keys([
    ['/', 'search'],
    ['Up / Down', 'through the list'],
    ['Page Up / Down', 'a screenful at a time'],
    ['Left / Right', 'the previous / next group'],
    ['Up from the top', 'the search box; Right from its end, the buttons beside it'],
    ['Down at the bottom', 'the buttons under the list'],
    ['Home / End', 'top / bottom'],
    ['Enter', 'play the song'],
    ['F', 'heart it'],
    ['Shift+F', 'favorites only, or every song'],
    ['O', 'the next sort'],
    ['P', 'parts: bass, lead, rhythm, all'],
    ['L', 'the next library tab'],
    ['T', 'tuner'],
    ['S', 'Settings'],
    ['Esc', 'the menu'],
  ])}`)],
  ['Practice', cols(`
<h3>Slow it down</h3>
<p><b>Speed</b> (<kbd>Up</kbd> / <kbd>Down</kbd>) goes from 25% to 120% without changing the pitch, holding at
100% a moment as you pass it. Settings sets the speed songs start at.</p>
<h3>Loop the hard part</h3>
<p><kbd>L</kbd> loops the section you're in, with a second's run-up. <kbd>[</kbd> and <kbd>]</kbd> set your own
start and end.</p>
<h3>Riff repeater</h3>
<p><kbd>R</kbd> loops the section from 60% speed, 5% faster each time round, up to full speed. When scoring, a
round only speeds it up when 70% of its notes were hit.</p>
<h3>Fewer notes</h3>
<p><b>Notes</b> plays Rocksmith's simpler versions of each phrase: 100% is the full chart, 80% keeps about three
notes in four, 20% the bare bones.</p>`, `
<h3>Notes early or late?</h3>
<p>Speakers, TVs and the cable each add a little delay. <b>Sync</b> (on the menu, or in Settings) lines them up:
move the swinging bar with <kbd>&larr;</kbd> and <kbd>&rarr;</kbd> (<kbd>Shift</kbd> for bigger steps) until it
reaches each side right on the tick, then press <kbd>Enter</kbd>.</p>
<p>With the cable open, you then hold the strings quiet through the count-in (PumaBass listens to the cable on
its own) and pluck the open E string along with the tick for half a minute: that sets scoring's timing and
checks your level. Run it again after changing speakers, headphones or screen.</p>
<p>For one song only (your own recording of it, say), nudge its <b>audio offset</b> in the Mix (<kbd>M</kbd>),
under <b>This song's timing</b>.</p>`)],
  ['Tuner and mix', cols(`
<h3>The tuner</h3>
<p>Plug your bass into the <b>Real Tone Cable</b> and press <kbd>T</kbd>. It knows the tuning the song wants, down
to the cents, and opens by itself when a song needs a different one. Play each open string: it's ticked once it
holds in tune.</p>
<h3>Hearing your bass</h3>
<p>Through the cable the bass makes no sound, so PumaBass plays it with the song, with a short delay: when you
open a song it opens the cable too, if it's plugged in. <b>Hear your bass</b> (in the tuner or the Mix) turns
that off, for a splitter to an amp, which has no delay.</p>
<h3>Another input</h3>
<p>Any audio input works, an audio interface or a microphone by an acoustic bass: choose it in Settings.</p>`, `
<h3>The mix (<kbd>M</kbd>)</h3>
<p><b>Your bass</b> boosts the cable's quiet signal (up to +30 dB) and <b>Song</b> sets the record: play along and
set the two meters about level. A limiter keeps them from distorting.</p>
<p><b>Recorded bass</b> (<kbd>B</kbd>): a record's own bass can't be lifted out, but <b>Reduced</b> and
<b>Cut</b> pull it well down by cutting the low middle of the mix. Its overtones stay, and the kick drum loses some
thump.</p>`)],
  ['Scoring', cols(`
<p>Scoring is in beta, and a mode of its own: choose <b>Score a song</b> (<kbd>C</kbd>) on the menu. With the
cable open, PumaBass listens to each note as it lands: a hit fills in bright; a miss is crossed out
and drops away. The top bar keeps your accuracy and streak, and the end screen gives your score, your best streak,
whether you play early or late, and where to practise.</p>
<h3>What counts</h3>
<p>The right note, within about a sixth of a second. It's forgiving of a muddy sound (the last note still
ringing, a string you didn't mute): a note only counts as wrong when it clearly was another one.
Hammer-ons and pull-offs need the new pitch, no pluck; muted notes and harmonics just the pluck; chords
count on the pluck alone, as one cable can't tell a chord's shape. Tune first: within half a semitone.</p>`, `
<h3>Unmarked, or many misses?</h3>
<p><b>Learn a song</b> plays along unmarked. Scoring never runs without an input, so playing through an amp is
never marked wrong.</p>
<p>Right notes marked missed? Run <b>Sync</b> with the cable open: scoring then allows for its delay. Still
wrong? Tick <b>Record a take</b> under <b>Takes</b> in the Mix and play; <b>Save take</b> keeps what the cable
heard, to find out why.</p>`)],
  ['The highway', cols(`
<p>Each string has its colour, as in Rocksmith: <b style="color:#e8413c">E</b> red, <b style="color:#f2c623">A</b>
yellow, <b style="color:#2e8ff0">D</b> blue, <b style="color:#f5892a">G</b> orange (guitar adds <b style="color:#3fc75e">B</b>
green, <b style="color:#b351e8">e</b> purple), the low string on top. A note shows its fret, its name or nothing
(Settings). A long bar across the lit lane is an open string.</p>
<p>When to play: a note comes in on end and lies flat just as it reaches its string, and a line drops from it to
its time on the floor, over the beat lines.</p>
<p>The lit lane is where your hand goes; the fret numbers under it light up to match. On a big jump the view pulls
back to show both ends. A tail means hold the note; a tail that bends is a slide.</p>
<p><kbd>N</kbd> puts standard notation, tab, or both over the top, scrolling by, each note crossing the blue
line as you play it (it starts off). The tab's notes are chips in their strings' colours: a hit lights up and stays lit, a miss fades.
Or play from the tab, large, in the highway's place (<kbd>V</kbd>), laid out like a page: the cyan line runs
along the bars as you play, then drops to the line below as the lines move up.</p>`, `
<h3>How a note is played</h3>
<p>As in Rocksmith, an icon on the note, and the same on the tab's chips:</p>
${keys([
    ['\u25bc / \u25b2', 'hammer-on / pull-off'],
    ['envelope', 'tap or slap (flap down), pop (flap up)'],
    ['\u2715', 'muted at the fret (dead note)'],
    ['bow tie', 'palm mute'],
    ['ring', 'harmonic; with spikes, pinch harmonic'],
    ['bright outline', 'accent'],
    ['chevrons on top', 'bend: one a half step, two a whole'],
  ])}
<p>And its tail: it curves to a slide's fret, lifts off the string where it bends, waves for vibrato and
zigzags for tremolo. A box round notes: play them together; an empty box, the same chord again (a bow tie or
cross in it: palm-muted or fret-hand-muted). A faint tunnel behind a chord: keep holding its shape; brackets on
the strings: an arpeggio, that shape picked a note at a time.</p>`)],
  ['Your songs', cols(`
<h3>Three folders, three libraries</h3>
<p>PumaBass plays Rocksmith 2014 song files (<code>.psarc</code>) from three folders beside it, each a tab on
the song list:</p>
${keys([
    ['bundles', 'Rocksmith\'s own song sets: the disc songs, the Rocksmith 1 packs'],
    ['cdlc', 'custom songs you download, from CustomsForge say'],
    ['music', 'songs you made, and recordings for charts with no audio'],
  ])}
<p>Folders inside them are read too. Press <b>Rescan</b> (under the song list, or in Settings) after adding
songs. A song in two places is listed once.</p>
<p>The disc songs need both <code>songs.psarc</code> (their charts) and <code>audio.psarc</code> (their
audio).</p>
<h3>The demo song</h3>
<p><b>Prowl</b>, on the <b>Demo</b> tab, comes with PumaBass: a riff written for it, to play before your own
songs are in. It starts low, moves up the neck for the chorus, and climbs to the 12th fret in the solo, with a
slide, bends and a harmonic. Below 50% <b>Notes</b> it's quarter notes.</p>`, `
<h3>A Rocksmith folder of your own</h3>
<p>Songs can stay where they are, too: <b>Settings &rarr; Songs &rarr; Choose Rocksmith folder</b> reads a whole
Rocksmith install, a copied <code>dlc</code> folder or a USB stick, and gives it a <b>Rocksmith folder</b> tab.
Nothing in it is copied or changed; <b>Remove it</b> stops reading it.</p>
<h3>Charts without audio</h3>
<p>Some charts arrive without audio. Put your own recording in the <code>music</code> folder, named like
<code>Rush - YYZ.mp3</code> or just <code>YYZ.mp3</code>, and press <b>Rescan</b>. Line it up with the song's
audio offset in the Mix (<kbd>M</kbd>), up to 15 seconds either way. The song list hides these charts until
then; the button at its foot shows them.</p>`)],
];

export const ABOUT = `
<p><b>PumaBass</b> is a RockSmith-style tabulature player. At its core, it takes tab notation, turns it sideways,
and synchronizes it to the music. You can use CustomsForge PSARC files or make your own using a simple synchronizer.
It can also "score" your playing, if you really like being judged by a machine.</p>
<p class="gk-credit">Developed entirely with Claude Code. Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></p>`;
