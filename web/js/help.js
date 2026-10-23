// Help (tabbed) and About, shown in the title's sheets and from the song list and player.

const keys = rows => `<table class="keys">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;

// Each tab fits the TV without scrolling: two columns in a wide box (style.css: .help-cols).
const cols = (left, right) => `<div class="help-cols"><div>${left}</div><div>${right}</div></div>`;

// Making your own songs is what PumaBass is for; downloads come next, Rocksmith's own songs last.
// The song list and Settings open Help at this tab (openHelp(MAKE)).
export const MAKE = 'Make your own';
const LINKS = {
  eof: 'https://ignition4.customsforge.com/eof',
  dlcBuilder: 'https://github.com/iminashi/Rocksmith2014.NET/releases',
  wwise: 'https://www.audiokinetic.com/download/',
  customsforge: 'https://customsforge.com/',
};

export const HELP = [
  ['Playing', cols(`
<p><b>Learn a song</b> lets you play along without any feedback to distract you. No judgement or mocking your
clumsy finger work. Requires no input.</p>
<p><b>Score a song</b> listens to you play and gives you feedback. This is a web game, so the scoring is set very
permissive. Even so, it might make bad calls, so just, like, be chill about it.</p>
<p>Hit the notes in time and make beautiful music. Adjust speed and complexity to help, or use practice modes to
really nail it.</p>`, `
${keys([
    ['Space', 'play / pause'],
    ['Left / Right', 'back / forward 5 seconds'],
    ['Up / Down', 'faster / slower'],
    ['L', 'loop this section'],
    ['R', 'riff repeater'],
    ['M', 'the mix'],
    ['T', 'tuner'],
    ['V', 'highway or tab'],
    ['N', 'notation: standard, tab, both, off'],
    ['Y', 'lyrics'],
    ['Esc', 'pause; again, the song list'],
  ])}`)],
  ['Practice', `
<h3>Slow it down</h3>
<p><b>Speed</b> runs from 25% to 120% without changing the pitch.</p>
<h3>Loop the hard part</h3>
<p><kbd>L</kbd> loops the section you are in; <kbd>[</kbd> and <kbd>]</kbd> set your own start and end.
<kbd>R</kbd> loops it a little faster each time round, from 60% up to full speed.</p>
<h3>Fewer notes</h3>
<p><b>Notes</b> plays Rocksmith's simpler versions of each phrase; 100% is the full chart.</p>
<h3>Notes early or late?</h3>
<p>Run <b>Sync</b> from the menu, and again after changing speakers, headphones or screen. For one song, nudge
its audio offset in the Mix (<kbd>M</kbd>).</p>`],
  ['Tuner and mix', `
<p>Plug into the <b>Real Tone Cable</b>, press <kbd>T</kbd>, and play each open string until it's ticked. The
tuner knows the song's tuning and opens by itself when it changes.</p>
<p>Your bass plays through PumaBass with the song, with a short delay. Playing through an amp with a splitter?
Turn off <b>Hear your bass</b>.</p>
<p>In the Mix (<kbd>M</kbd>), set <b>Your bass</b> and <b>Song</b> about level. <b>Recorded bass</b>
(<kbd>B</kbd>) turns the record's own bass down or cuts it.</p>
<p>An audio interface or a microphone works too: choose it in Settings.</p>`],
  ['Scoring', `
<p><b>Score a song</b> (<kbd>C</kbd> on the menu) listens through the cable: a hit lights up, a miss is crossed
out. The right note within about a sixth of a second counts; chords count on the pluck alone.</p>
<p>Right notes marked missed? Tune, then run <b>Sync</b> with the cable open.</p>`],
  ['Highway', cols(`
<p>Strings are coloured as in Rocksmith: <b style="color:#e8413c">E</b> red, <b style="color:#f2c623">A</b> yellow,
<b style="color:#2e8ff0">D</b> blue, <b style="color:#f5892a">G</b> orange (guitar adds <b style="color:#3fc75e">B</b> green and
<b style="color:#b351e8">e</b> purple). The number is the fret; a long bar is an open string. A note lies flat on
its string just as it's time to play it.</p>
<p>The lit lane is where your hand goes. A tail means hold; a tail that bends is a slide.</p>
<p><kbd>N</kbd> scrolls notation and tab along the top: play each note as it crosses the blue line.
<kbd>V</kbd> swaps the highway for a page of tab.</p>`, `
${keys([
    ['\u25bc / \u25b2', 'hammer-on / pull-off'],
    ['envelope', 'slap (flap down) / pop (flap up)'],
    ['\u2715', 'muted note'],
    ['bow tie', 'palm mute'],
    ['ring', 'harmonic'],
    ['chevrons', 'bend: one a half step, two a whole'],
    ['a box round notes', 'play them together'],
  ])}`)],
  [MAKE, `
<p>Chart any song you have a recording of, with two free programs.</p>
<p><b>1.</b> In <a href="${LINKS.eof}" target="_blank" rel="noopener">Editor on Fire</a>, load the recording,
line the beat up with it, and put the notes on <b>PART REAL_BASS</b>. Turn on <b>Save separate Rocksmith 2
files</b> in its preferences.</p>
<p><b>2.</b> In <a href="${LINKS.dlcBuilder}" target="_blank" rel="noopener">DLC Builder</a>, give it that XML,
the recording, a cover, title and artist, and build a <code>.psarc</code>. It needs
<a href="${LINKS.wwise}" target="_blank" rel="noopener">Wwise</a> 2019 to 2023 (just its Authoring package).</p>
<p><b>3.</b> Put the <code>.psarc</code> in the <code>music</code> folder and press <b>Rescan</b>.</p>
<p>Or download songs from <a href="${LINKS.customsforge}" target="_blank" rel="noopener">CustomsForge</a> into
the <code>cdlc</code> folder.</p>`],
  ['Your songs', `
<p>PumaBass plays <code>.psarc</code> files from three folders beside it, each a tab on the song list:
<code>music</code> (yours), <code>cdlc</code> (downloaded) and <code>bundles</code> (Rocksmith 2014's own). Press
<b>Rescan</b> after adding songs.</p>
<p>Or point <b>Settings &rarr; Songs</b> at a Rocksmith folder you already have; nothing in it is changed.
Rocksmith's disc songs need both <code>songs.psarc</code> and <code>audio.psarc</code>.</p>
<p>The <b>Demo</b> tab has <b>Gods of the Copybook Headings</b> to play until your own songs are in.</p>`],
];

export const ABOUT = `
<p><b>PumaBass</b> is a highway-style live-notation engine for upright and electric bass (and to a lesser
extent, guitar). It also offers a tab view, standard notation, tuner, and basic mixer.</p>
<p>It reads standard .psarc audio+notation formats, including Rocksmith CDLC from CustomsForge. Make your own with
Editor on Fire or just ask AI to do it.</p>
<p class="gk-credit">Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a></p>`;
