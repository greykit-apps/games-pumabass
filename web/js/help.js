// Help (tabbed) and About, shown in the title's sheets and from the song list and player.

const keys = rows => `<table class="keys">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;

export const HELP = [
  ['Playing', `
<h3>Getting going</h3>
<p><b>Learn a song</b> opens your song list. Pick a song and press <kbd>Space</kbd>. The notes come towards you down
the highway and land on the strings at the bottom, on time with the record.</p>
<h3>Keys while a song is up</h3>
${keys([
    ['Space', 'play / pause'],
    ['Left / Right', 'back / forward 5 seconds'],
    ['Up / Down', 'faster / slower (the pitch stays put)'],
    ['L', 'loop the section you are in; again to stop'],
    ['[ and ]', 'set the loop start / end where you are'],
    ['Home', 'back to the loop start, or the top of the song'],
    [',', "this song's settings: audio offset, highway, volume"],
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
    ['Esc', 'back to the menu'],
  ])}`],
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
  ['Reading the highway', `
<p>Each string has its colour, as in Rocksmith: <b style="color:#e8413c">E</b> red, <b style="color:#f2c623">A</b> yellow,
<b style="color:#2e8ff0">D</b> blue, <b style="color:#f5892a">G</b> orange (guitar adds <b style="color:#3fc75e">B</b> green and
<b style="color:#b351e8">e</b> purple). The number on a note is the fret. A long bar across the lit lane is an open string.</p>
<p>The lit lane on the floor is where your hand should be; the fret numbers at the bottom light up to match.
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
<p>PumaBass reads the songs straight out of your Rocksmith 2014 install: the songs on the disc, your DLC and the
Rocksmith 1 import packs. Nothing is copied or changed there.</p>
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
<p>It reads your install through a small server on this computer, and nothing leaves it. Audio is decoded with
vgmstream. Not affiliated with Ubisoft; Rocksmith is theirs.</p>
<p>Developed entirely with Claude Code.</p>
<p class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></p>`;
