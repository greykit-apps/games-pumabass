// The demo song that comes with PumaBass, to play before you've added any of your own:
// Gods of the Copybook Headings (demo-copybook.js), Suno AI's setting of Kipling's poem,
// played from its own recording (RECORDING), with its bass part and its words written out
// as data. It's on the song list's Demo tab; the player gets its chart, words and audio
// here instead of from the server.

import * as copybook from './demo-copybook.js';

const ALL = [copybook];
const byId = id => ALL.find(d => d.SONG.id === id) || copybook;

/** Their rows in the song list. */
export const DEMOS = ALL.map(d => d.SONG);

/** A demo song's chart, with its words. */
export const demoChart = id => byId(id).chart();

/** A demo song's audio: its recording, beside the page. */
export const demoTrack = id => byId(id).RECORDING;
