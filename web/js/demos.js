// The demo songs that come with PumaBass, to play before you've added any of your
// own: Prowl (demo-prowl.js), written for PumaBass, and Grieg's In the Hall of the
// Mountain King (demo-king.js), out of copyright and arranged here. Each module
// writes its chart note by note and synthesizes its audio (synth.js), so nobody
// else owns any part of either; both sing the same words (WORDS), about where songs
// come from. They're on the song list's Demo tab; the player gets their charts,
// words and audio here instead of from the server.

import * as prowl from './demo-prowl.js';
import * as king from './demo-king.js';
import { wav } from './synth.js';

const ALL = [prowl, king];
const byId = id => ALL.find(d => d.SONG.id === id) || prowl;

/** Their rows in the song list. */
export const DEMOS = ALL.map(d => d.SONG);

/* The words both sing, a line at a time, over and over. */
const WORDS = [
  'This song is AI-made synth.',
  'PumaBass plays .psarc files,',
  'which are MP3s with synchronized',
  'notation and lyrics.',
  'You can make your own',
  'with Editor On Fire,',
  'or you can download them',
  'from the internet.',
  'Rocksmith 2014-style song bundles',
  'are also supported.',
];

/* The words laid on the beats, shaped like the server's (server/library.js, lyrics): a word
 * a beat, a beat's rest after each line, from the first section to the last bar, whole lines only. */
function lyrics(chart) {
  const beats = chart.beats.map(b => b.t), its = chart.phraseIterations;
  const from = beats.findIndex(t => t >= its[1].t - 1e-6), to = beats.findIndex(t => t >= its[its.length - 1].t - 1e-6);
  const out = [];
  for (let k = from, line = 0; ; line = (line + 1) % WORDS.length) {
    const words = WORDS[line].split(' ');
    if (k + words.length >= to) return out;
    words.forEach((w, i) => out.push({ t: beats[k + i], d: Math.round((beats[k + i + 1] - beats[k + i]) * 850) / 1000, w: i === words.length - 1 ? w + '+' : w }));
    k += words.length + 1;
  }
}

/** A demo song's chart, with its words. */
export function demoChart(id) {
  const chart = byId(id).chart();
  return { ...chart, lyrics: lyrics(chart) };
}

const urls = new Map();
/** A demo song's audio as a blob URL, made the first time it's asked for. */
export function demoTrack(id) {
  const d = byId(id);
  if (!urls.has(d)) urls.set(d, URL.createObjectURL(new Blob([wav(d.render())], { type: 'audio/wav' })));
  return urls.get(d);
}
