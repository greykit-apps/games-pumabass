// The mixer: one AudioContext that carries both the song and your bass, so the
// two can be balanced against each other and share a limiter at the end.
//
//   song  -> [stereo] -> recorded-bass cut -> song volume -\
//                                                           +-> limiter -> speakers
//   input -> boost (dB) -> on/off --------------------------/
//
// The recorded bass can't be taken out of a finished mix, but it can be pulled
// well down: a bass sits low and in the dead centre, so the low end of the
// centre (mid) is cut and the sides are left alone, which keeps the weight of
// guitars panned left and right. Its upper overtones remain, and the kick drum
// loses some of its thump.

export const RECORDED_BASS = {
  full: { label: 'Full', cutDb: 0 },
  reduced: { label: 'Reduced', cutDb: 15 },
  cut: { label: 'Cut', cutDb: 36 },
};
const SHELF_HZ = 220;   // a bass's open strings to its 12th fret on G sit below here
const SHELVES = 3;      // stages, so the cut is steep and the vocals above keep their body

/**
 * The song's processing, built into any context (the live one, or an offline
 * one for measuring it). Returns { input, output, setCut(dB) }.
 */
export function buildSongChain(ctx) {
  // Upmix to stereo first, so a mono song comes out of both sides.
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const split = ctx.createChannelSplitter(2);
  input.connect(split);
  const gain = (v, from, ch, to) => { const g = ctx.createGain(); g.gain.value = v; from.connect(g, ch); g.connect(to); return g; };
  // mid = (L + R) / 2, side = (L - R) / 2
  const mid = ctx.createGain(), side = ctx.createGain();
  gain(0.5, split, 0, mid); gain(0.5, split, 1, mid);
  gain(0.5, split, 0, side); gain(-0.5, split, 1, side);
  // The mid's low end, cut by low shelves.
  const shelves = Array.from({ length: SHELVES }, () => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowshelf';
    f.frequency.value = SHELF_HZ;
    f.gain.value = 0;
    return f;
  });
  shelves.reduce((a, b) => (a.connect(b), b), mid);
  const midOut = shelves[shelves.length - 1];
  // L = mid + side, R = mid - side
  const merge = ctx.createChannelMerger(2);
  midOut.connect(merge, 0, 0); midOut.connect(merge, 0, 1);
  side.connect(merge, 0, 0);
  const sideNeg = ctx.createGain();
  sideNeg.gain.value = -1;
  side.connect(sideNeg);
  sideNeg.connect(merge, 0, 1);
  const output = ctx.createGain();
  merge.connect(output);
  return {
    input, output,
    setCut(db) { for (const f of shelves) f.gain.setTargetAtTime(-db / SHELVES, ctx.currentTime, 0.05); },
  };
}

export class Mixer {
  constructor() {
    // 48 kHz everywhere (the Real Tone Cable's own rate), whatever the sound
    // card runs at, so the tuner's window is always the same 0.34 s.
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    const ctx = this.ctx;
    // A limiter, so a boosted bass on top of a loud song never distorts.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    this.master = ctx.createGain(); // Sound on/off (M)
    this.limiter.connect(this.master).connect(ctx.destination);
    this.song = buildSongChain(ctx);
    this.songVolume = ctx.createGain();
    this.song.output.connect(this.songVolume).connect(this.limiter);
    // Your bass: a boost (the cable gives a quiet instrument-level signal), then on/off.
    this.bassBoost = ctx.createGain();
    this.bassOn = ctx.createGain();
    this.bassOn.gain.value = 0;
    this.bassBoost.connect(this.bassOn).connect(this.limiter);
    // Meters on both, as heard, so the two can be matched by eye.
    this.songMeter = ctx.createAnalyser();
    this.bassMeter = ctx.createAnalyser();
    this.songMeter.fftSize = this.bassMeter.fftSize = 2048;
    this.songVolume.connect(this.songMeter);
    this.bassOn.connect(this.bassMeter);
    this.meterBuf = new Float32Array(2048);
    this.attached = null;
  }

  /** Route an <audio> element through the mixer (once per element). */
  attachSong(el) {
    if (this.attached === el) return;
    this.ctx.createMediaElementSource(el).connect(this.song.input);
    this.attached = el;
  }

  /** Where an instrument input connects to be heard. */
  get bassIn() { return this.bassBoost; }

  setSongVolume(v) { this.songVolume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  setRecordedBass(mode) { this.song.setCut((RECORDED_BASS[mode] || RECORDED_BASS.full).cutDb); }
  setBassBoost(db) { this.bassBoost.gain.setTargetAtTime(10 ** (db / 20), this.ctx.currentTime, 0.02); }
  setHearBass(on) { this.bassOn.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02); }
  setMuted(m) { this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.01); }

  /** Peak level (dB full scale) of 'song' or 'bass' over the last ~40 ms, as heard. */
  level(which) {
    const a = which === 'bass' ? this.bassMeter : this.songMeter;
    a.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (const v of this.meterBuf) peak = Math.max(peak, Math.abs(v));
    return 20 * Math.log10(peak || 1e-9);
  }

  /** The browser lets audio start only after a click or key: call from one. */
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }
}
