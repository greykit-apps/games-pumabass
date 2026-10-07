// Runs on the audio thread: passes the instrument input to the page in
// chunks, each stamped with the audio clock's time for its first sample, so
// scoring can find exactly the stretch of playing around any note.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(2048);
    this.n = 0;
    this.t0 = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.n === 0) this.t0 = currentTime;
    this.chunk.set(ch, this.n);
    this.n += ch.length;
    if (this.n >= this.chunk.length) {
      this.port.postMessage({ t0: this.t0, x: this.chunk }, [this.chunk.buffer]);
      this.chunk = new Float32Array(2048);
      this.n = 0;
    }
    return true;
  }
}

registerProcessor('pumabass-capture', Capture);
