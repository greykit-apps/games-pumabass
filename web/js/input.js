// The instrument input: the Real Tone Cable, or any other audio input, read
// through Web Audio for the tuner, and fed to the mixer (web/js/mixer.js) so
// you can hear your bass when it is plugged into the cable, not an amp.

/** The Real Tone Cable calls itself "Rocksmith Guitar Adapter" to the computer. */
export const isRealTone = label => /rocksmith|guitar adapter|real\s*tone/i.test(label || '');

export class InstrumentInput {
  /** mixer: where the input goes to be heard (its context is used too). */
  constructor(mixer) {
    this.mixer = mixer;
    this.ctx = mixer.ctx;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.label = '';
    this.deviceId = null;
    this.buf = null;
    this.onchange = null;    // called when the input opens, closes or is unplugged
  }

  /** Whether this browser (and address) can use audio inputs at all. */
  static supported() {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  get open() { return !!this.stream; }

  /** The audio inputs, with names (asking the browser's permission first if need be). */
  async devices() {
    let list = await navigator.mediaDevices.enumerateDevices();
    if (list.some(d => d.kind === 'audioinput' && !d.label)) {
      // Names are only shown once the page may use an input: ask, then look again.
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      list = await navigator.mediaDevices.enumerateDevices();
    }
    return list.filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications')
      .map(d => ({ id: d.deviceId, label: d.label || 'Audio input', realTone: isRealTone(d.label) }));
  }

  /** Open an input by id; with no id, the Real Tone Cable if one is plugged in. */
  async openDevice(id) {
    if (!id) {
      const rtc = (await this.devices()).find(d => d.realTone);
      if (!rtc) throw new Error('No Real Tone Cable found. Plug it in, or choose another input in Settings.');
      id = rtc.id;
    }
    // A bass is not a voice: echo cancelling, noise suppression and automatic
    // gain would all mangle it, so all three are off.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: 0 },
    });
    this.useStream(stream);
  }

  /** Use any MediaStream as the input (also how tests feed in a test tone). */
  useStream(stream) {
    this.close();
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    this.label = track ? track.label : 'Test input';
    this.deviceId = track && track.getSettings ? track.getSettings().deviceId || null : null;
    if (track) track.addEventListener('ended', () => { this.close(); if (this.onchange) this.onchange('unplugged'); });
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 16384; // 0.34 s at 48 kHz: enough cycles of a low bass string
    this.source.connect(this.analyser);
    this.source.connect(this.mixer.bassIn);
    this.buf = new Float32Array(this.analyser.fftSize);
    if (this.onchange) this.onchange('open');
  }

  /** The browser only lets audio start after a click or key: call from one. */
  resume() { this.mixer.resume(); }

  get sampleRate() { return this.ctx.sampleRate; }

  /** The latest stretch of input, newest last. */
  read() {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.buf);
    return this.buf;
  }

  close() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.source) this.source.disconnect();
    this.stream = this.source = this.analyser = null;
  }
}
