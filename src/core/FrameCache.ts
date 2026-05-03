/**
 * Subset of the mediabunny VideoSampleSink API we depend on. Exposed as an
 * interface so tests can provide a mock sink.
 */
export interface FrameSink {
  getSample(time: number): Promise<{
    timestamp: number;
    toVideoFrame: () => VideoFrame;
    close?: () => void;
  } | null>;
}

export interface FrameCacheOptions {
  capacity?: number;
}

export class FrameCache {
  sink: FrameSink;
  capacity: number;
  cache: Map<number, VideoFrame> = new Map();
  private _pending: Map<number, Promise<VideoFrame | null>> = new Map();

  constructor(sink: FrameSink, options: FrameCacheOptions = {}) {
    this.sink = sink;
    this.capacity = options.capacity ?? 30;
  }

  private _key(time: number): number {
    return Math.round(time * 1000);
  }

  async getFrameAt(time: number): Promise<VideoFrame | null> {
    const key = this._key(time);

    if (this.cache.has(key)) {
      const v = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, v);
      return v;
    }

    const pending = this._pending.get(key);
    if (pending) return pending;

    const promise = this._fetch(time);
    this._pending.set(key, promise);
    try {
      const frame = await promise;
      if (frame) {
        if (this.cache.has(key)) {
          frame.close?.();
          const existing = this.cache.get(key)!;
          this.cache.delete(key);
          this.cache.set(key, existing);
          return existing;
        }
        this.cache.set(key, frame);
        this._evictIfNeeded();
      }
      return frame;
    } finally {
      this._pending.delete(key);
    }
  }

  private async _fetch(time: number): Promise<VideoFrame | null> {
    // WebCodecs decoders occasionally surface EncodingError / NotSupportedError
    // on certain seeks (rapid scrubbing, malformed packets at chapter joins,
    // EOF probes). These are known-transient and the next request usually
    // succeeds, so log them at `debug` (hidden in default consoles) instead of
    // `warn`. Anything else still warns loudly.
    try {
      const sample = await this.sink.getSample(time);
      if (!sample) return null;
      const frame = sample.toVideoFrame();
      sample.close?.();
      return frame;
    } catch (err) {
      const isTransient = err instanceof DOMException
        && (err.name === 'EncodingError' || err.name === 'NotSupportedError');
      if (isTransient) {
        console.debug('pixi-effects: transient video decode failure at', time, 's —', err.name);
      } else {
        console.warn('pixi-effects: video frame decode failed at', time, 's —', err);
      }
      return null;
    }
  }

  private _evictIfNeeded(): void {
    while (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value as number | undefined;
      if (oldestKey === undefined) break;
      const oldestFrame = this.cache.get(oldestKey);
      oldestFrame?.close?.();
      this.cache.delete(oldestKey);
    }
  }

  dispose(): void {
    for (const f of this.cache.values()) f?.close?.();
    this.cache.clear();
    this._pending.clear();
  }
}
