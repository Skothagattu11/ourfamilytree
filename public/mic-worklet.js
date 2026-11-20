// Turns microphone audio (any sample rate) into 16 kHz, 16-bit mono PCM chunks of 100 ms,
// which is what Gemini Live expects. Also reports a loudness level for the on-screen orb.
class MicPcm16 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0; this.sum = 0; this.cnt = 0;
    this.out = new Int16Array(1600);
    this.n = 0; this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      this.sum += v; this.cnt++;
      const a = v < 0 ? -v : v;
      if (a > this.peak) this.peak = a;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        let s = this.sum / this.cnt;
        this.sum = 0; this.cnt = 0;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === this.out.length) {
          const buf = this.out.slice(0).buffer;
          this.port.postMessage({ pcm: buf, level: this.peak }, [buf]);
          this.n = 0; this.peak = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mic-pcm16', MicPcm16);
