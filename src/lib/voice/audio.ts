const toB64 = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Microphone → 16 kHz PCM16 base64 chunks (100 ms each). */
export class Mic {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  muted = false;

  async start(onChunk: (b64: string) => void, onLevel: (l: number) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}mic-worklet.js`);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'mic-pcm16');
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      onLevel(this.muted ? 0 : e.data.level);
      if (!this.muted) onChunk(toB64(e.data.pcm));
    };
    src.connect(this.node);
    // keep the graph pulling without sending the mic to the speakers
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.ctx = undefined;
  }
}

/** Plays Gemini's 24 kHz PCM16 audio gap-free; can be cut off instantly when the user interrupts. */
export class Speaker {
  private ctx = new AudioContext({ sampleRate: 24000 });
  private next = 0;
  private live = new Set<AudioBufferSourceNode>();
  onIdle?: () => void;

  unlock() { return this.ctx.resume(); }
  get speaking() { return this.live.size > 0; }

  play(b64: string) {
    const bin = atob(b64);
    const n = bin.length >> 1;
    const buf = this.ctx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      ch[i] = v / 0x8000;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.03, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this.live.add(src);
    src.onended = () => { this.live.delete(src); if (!this.live.size) this.onIdle?.(); };
  }

  stop() {
    this.live.forEach(s => { try { s.stop(); } catch { /* not started */ } });
    this.live.clear();
    this.next = 0;
  }

  close() { this.stop(); this.ctx.close().catch(() => {}); }
}
