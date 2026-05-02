/**
 * Minimal OfflineAudioContext mock for vitest/happy-dom.
 *
 * happy-dom does not implement the Web Audio API beyond stubs.
 * This mock faithfully implements the subset used by AudioMixer.ts.
 */

interface ParamEvent {
  type: 'set' | 'ramp';
  value: number;
  time: number;
}

class MockAudioParam {
  _events: ParamEvent[] = [];
  _default: number;
  value: number;

  constructor(defaultValue = 1) {
    this._default = defaultValue;
    this.value = defaultValue;
  }

  setValueAtTime(value: number, time: number): this {
    this._events.push({ type: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this._events.push({ type: 'ramp', value, time });
    return this;
  }

  _valueAt(t: number): number {
    const evs = [...this._events].sort((a, b) => a.time - b.time);
    if (evs.length === 0) return this._default;
    let cur = this._default;
    let curTime = 0;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]!;
      if (t < ev.time) {
        if (ev.type === 'ramp') {
          const span = ev.time - curTime;
          if (span <= 0) return ev.value;
          const frac = (t - curTime) / span;
          return cur + (ev.value - cur) * frac;
        }
        return cur;
      }
      if (ev.type === 'set' || ev.type === 'ramp') cur = ev.value;
      curTime = ev.time;
    }
    return cur;
  }
}

class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  _channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array { return this._channels[ch]!; }
}

class MockBufferSourceNode {
  _ctx: MockOfflineAudioContext;
  buffer: MockAudioBuffer | null = null;
  loop = false;
  _gainNode: MockGainNode | null = null;
  _startTime = 0;
  _stopTime = Infinity;
  constructor(ctx: MockOfflineAudioContext) { this._ctx = ctx; }
  connect(node: MockGainNode) { this._gainNode = node; return node; }
  start(when = 0) { this._startTime = when; }
  stop(when = Infinity) { this._stopTime = when; }
}

class MockGainNode {
  _ctx: MockOfflineAudioContext;
  gain = new MockAudioParam(1);
  _destination: unknown = null;
  constructor(ctx: MockOfflineAudioContext) { this._ctx = ctx; }
  connect(dest: unknown) { this._destination = dest; return dest; }
}

class MockOfflineAudioContext {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  destination = {};
  _sources: MockBufferSourceNode[] = [];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }
  createBufferSource() {
    const src = new MockBufferSourceNode(this);
    this._sources.push(src);
    return src;
  }
  createGain() { return new MockGainNode(this); }

  async startRendering(): Promise<MockAudioBuffer> {
    const out = new MockAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    for (const src of this._sources) {
      const buf = src.buffer;
      if (!buf) continue;
      const gain = src._gainNode;
      if (!gain) continue;
      const startSample = Math.round(src._startTime * this.sampleRate);
      const stopSample = isFinite(src._stopTime)
        ? Math.round(src._stopTime * this.sampleRate)
        : this.length;
      for (let outCh = 0; outCh < this.numberOfChannels; outCh++) {
        const outData = out.getChannelData(outCh);
        const inCh = outCh < buf.numberOfChannels ? outCh : buf.numberOfChannels - 1;
        const inData = buf.getChannelData(inCh);
        for (let s = startSample; s < Math.min(stopSample, this.length); s++) {
          const t = s / this.sampleRate;
          const g = gain.gain._valueAt(t);
          const srcIdx = src.loop ? (s - startSample) % buf.length : s - startSample;
          const sample = srcIdx < buf.length ? inData[srcIdx]! : 0;
          outData[s] += sample * g;
        }
      }
    }
    return out;
  }
}

(globalThis as unknown as { OfflineAudioContext: typeof MockOfflineAudioContext }).OfflineAudioContext = MockOfflineAudioContext;
