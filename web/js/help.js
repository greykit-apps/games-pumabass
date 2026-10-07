// Help (tabbed) and About, shown in the title's sheets and from the song list and player.

const keys = rows => `<table class="keys">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;

export const HELP = [
  ['Playing', `
<h3>Getting going</h3>
<p><b>Learn a song</b> opens your song list. A song opens paused: press <kbd>Space</kbd> to play. The notes come
towards you down the highway and land on the strings at the bottom, on time with the record.</p>
<p>Play after a pause starts six seconds back and counts you in, so you can find the groove again before you
reach the spot you stopped at. <b>Resume game</b> does the same. Jump somewhere yourself (click the bar, the arrow
keys) and it plays from right there.</p>
<h3>Keys while a song is up</h3>
${keys([
    ['Space', 'play / pause'],
    ['Left / Right', 'back / forward 5 seconds'],
    ['Up / Down', 'faster / slower (the pitch stays put)'],
    ['L', 'loop the section you are in; again to stop'],
    ['[ and ]', 'set the loop start / end where you are'],
    ['Home', 'back to the loop start, or the top of the song'],
    [',', "the mix (song, recorded bass, your bass) and this song's settings"],
    ['B', 'recorded bass: full, reduced, cut'],
    ['F', 'make the song a favorite (again to undo)'],
    ['T', 'the tuner'],
    ['M', 'sound on / off, anywhere'],
    ['Esc', 'back to the song list'],
  ])}
<p>Click the bar along the bottom to jump; it is split into the song's sections. Shift+click moves the nearest
loop edge. With the song paused, the mouse wheel scrubs.</p>
<h3>Keys in the song list</h3>
${keys([
    ['/', 'search'],
    ['Up / Down', 'move through the list'],
    ['Enter', 'play the song'],
    ['F', 'star the song: a favorite'],
    ['Esc', 'back to the menu'],
  ])}`],
  ['Your library', `
<h3>Favorites</h3>
<p>Star a song with the <b>&#9734;</b> at the start of its row (or <kbd>F</kbd>), or in the player. <b>&#9733; Favorites</b>
above the list shows only your favorites: your own library.</p>
<h3>Plays and Finished</h3>
<p><b>Plays</b> counts each time you start a song. Pausing and carrying on is the same play, and so is picking it up
again with Resume game. <b>Finished</b> counts the times you played it through to its last note, having played at
least half of what was left when you began: jumping to the end doesn't count. Sort by <b>Most played</b> to see your
regulars first.</p>`],
  ['Practice', `
<h3>Slow it down</h3>
<p><b>Speed</b> plays the song from 25% to 120% without changing its pitch. Settings can start every song at a
slower speed.</p>
<h3>Loop the hard part</h3>
<p><kbd>L</kbd> loops the section you are in, with a second's run-up each time round. For a tighter loop, set
your own start and end with <kbd>[</kbd> and <kbd>]</kbd>.</p>
<h3>Fewer notes</h3>
<p><b>Difficulty</b> uses Rocksmith's own simpler versions of each phrase. 100% is the full chart; lower values
thin it out phrase by phrase, the way Rocksmith's dynamic difficulty does.</p>
<h3>Notes early or late?</h3>
<p>Open the song's settings with <kbd>,</kbd> and nudge the <b>audio offset</b>. It is remembered for that song.</p>`],
  ['Tuner', `
<p>Plug your bass into the <b>Real Tone Cable</b> and press <kbd>T</kbd> (or <b>Tuner</b> on the menu or in the
player). The tuner knows the tuning the song wants, including the few cents some Rocksmith songs are off A440
because their recording was. Play each open string: the needle shows how far off it is, and a string is ticked
once it holds in tune.</p>
<p>It opens by itself on your first song of the day, and when the next song needs a different tuning. Settings can
turn that off.</p>
<h3>Hearing your bass</h3>
<p>Plugged into the cable, the bass makes no sound of its own. <b>Hear your bass</b> (in the tuner, the Mix, or
Settings) plays it through PumaBass. There is a short delay on the way; if you have an amp, a splitter to the amp
has none.</p>
<h3>The mix</h3>
<p>Open it with <kbd>,</kbd> while a song is up. <b>Your bass</b> boosts the cable's quiet signal (up to +30 dB) and
<b>Song</b> sets the record; play along and set the two meters about level. A limiter keeps the two together from
ever distorting.</p>
<p><b>Recorded bass</b> (<kbd>B</kbd>): the song's own bass can't be lifted out of a finished record, but
<b>Reduced</b> and <b>Cut</b> pull it well down, by cutting the low end of the middle of the stereo mix, where a
bass always sits. Its upper overtones stay, and the kick drum loses some thump; guitars and vocals are left alone.</p>
<h3>Another input</h3>
<p>Any audio input works, e.g. an audio interface or a microphone near an acoustic bass: choose it in Settings.
The first time, the browser asks to let PumaBass use it.</p>`],
  ['Reading the highway', `
<p>Each string has its colour, as in Rocksmith: <b style="color:#e8413c">E</b> red, <b style="color:#f2c623">A</b> yellow,
<b style="color:#2e8ff0">D</b> blue, <b style="color:#f5892a">G</b> orange (guitar adds <b style="color:#3fc75e">B</b> green and
<b style="color:#b351e8">e</b> purple). The number on a note is the fret. A long bar across the lit lane is an open string.</p>
<p>The lit lane on the floor is where your hand should be; the fret numbers at the bottom light up to match.
On a big jump the view pulls back until you can see both ends, then settles on the new spot.
A tail behind a note means hold it; a tail that bends sideways is a slide to the fret shown.</p>
${keys([
    ['H / P', 'hammer-on / pull-off'],
    ['SLAP / POP', 'slap with the thumb / pop with a finger'],
    ['grey with an X', 'muted (dead) note'],
    ['diamond', 'harmonic'],
    ['PM', 'palm mute'],
    ['~', 'vibrato'],
    ['a box round notes', 'play them together (a chord or double stop)'],
  ])}`],
  ['Your songs', `
<p>PumaBass plays your own Rocksmith 2014 song files (<code>.psarc</code>). Choose the folder that holds them in
<b>Settings → Song library</b>; the folders inside it are searched too, so a whole Rocksmith folder, a copied
<code>dlc</code> folder or a USB stick all work. Nothing in it is copied or changed. Press <b>Rescan</b> after
adding songs.</p>
<p>The songs from the Rocksmith disc need both <code>songs.psarc</code> and <code>audio.psarc</code>: the first has
their charts, the second their audio.</p>
<h3>Charts without audio</h3>
<p>Some charts arrive without their audio (the Rocksmith 1 DLC pack, for one). Drop your own recording into the
PumaBass <code>music</code> folder, named like <code>Rush - YYZ.mp3</code> or just <code>YYZ.mp3</code>, and press
<b>Rescan</b>. Settings can show the charts that are still waiting for one.</p>
<p>A recording of your own rarely lines up with the chart exactly: use the song's audio offset (<kbd>,</kbd>), which
goes up to 15 seconds either way for these.</p>`],
];

export const ABOUT = `
<p><b>PumaBass</b> is a note highway for the Rocksmith 2014 songs you already own, for when the game itself will
not behave. Bass first; lead and rhythm guitar charts load too.</p>
<p>It reads your song files through a small server on this computer, and nothing leaves it. It ships with no
songs. Audio is decoded with vgmstream. Not affiliated with Ubisoft; Rocksmith is theirs.</p>
<p>Developed entirely with Claude Code.</p>
<p class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></p>`;
