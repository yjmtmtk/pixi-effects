/** What a decoded sample offers (the subset of mediabunny's VideoSample this reads). */
export interface SampleLike {
  timestamp: number;
  toVideoFrame: () => VideoFrame;
  close?: () => void;
}

/**
 * Subset of the mediabunny VideoSampleSink API we depend on. Exposed as an
 * interface so tests can provide a mock sink.
 */
export interface FrameSink {
  /** The frame that covers `time` (the last one that starts at or before it); null before the first. A seek and a fresh decode each call: about 20 ms. */
  getSample(time: number): Promise<SampleLike | null>;
  /** The frames in order, from the one that covers `start`. One decoder pass: under 1 ms a frame (measured 20-40 times faster than getSample per frame). */
  samples?(start?: number): AsyncGenerator<SampleLike, void, unknown>;
}

export interface FrameCacheOptions {
  /** The most frames held (default 30); a big frame lowers it so that one video holds about 96 MB of decoded frames, never fewer than 3. */
  capacity?: number;
}

const BUDGET_BYTES = 96 * 1024 * 1024;
const MIN_HELD = 3;
const JUMP_SECONDS = 1;                 // a request further ahead than this restarts the pass (a seek and a GOP) instead of decoding everything in between
const EPS = 1e-6;

/** A decoded frame: it starts at `ts` and runs to `end` (null: not known yet; then it answers only the exact time it was asked for, `req`). */
interface Held { ts: number; end: number | null; frame: VideoFrame; req?: number }

function reportDecodeError(err: unknown, time: number): void {
  // WebCodecs decoders occasionally surface EncodingError / NotSupportedError on certain seeks (rapid scrubbing, malformed packets at chapter
  // joins, EOF probes). These are known-transient and the next request usually succeeds, so log them at `debug` (hidden in default consoles)
  // instead of `warn`. Anything else still warns loudly.
  const isTransient = err instanceof DOMException && (err.name === 'EncodingError' || err.name === 'NotSupportedError');
  if (isTransient) console.debug('pixi-effects: transient video decode failure at', time, 's —', err.name);
  else console.warn('pixi-effects: video frame decode failed at', time, 's —', err);
}

export class FrameCache {
  sink: FrameSink;
  capacity: number;
  cache: Map<number, VideoFrame> = new Map();
  private _pending: Map<number, Promise<VideoFrame | null>> = new Map();

  // Sequential mode (the sink has `samples()`): one decoder pass that runs forward as the movie asks for frame after frame.
  private _frames: Held[] = [];
  private _cur: Held | null = null;
  private _iter: AsyncGenerator<SampleLike, void, unknown> | null = null;
  private _next: SampleLike | null = null;
  private _held = 0;
  private _lock: Promise<unknown> = Promise.resolve();
  private _lastTime: number | null = null;

  constructor(sink: FrameSink, options: FrameCacheOptions = {}) {
    this.sink = sink;
    this.capacity = options.capacity ?? 30;
  }

  /** How many decoded frames are held right now (the sequential reader's own list, plus the exact-time cache of the old path). */
  get heldFrames(): number { return this._frames.length + this.cache.size; }

  private _key(time: number): number {
    return Math.round(time * 1e6);          // a microsecond: two different times must not share a frame (the answer would depend on which was asked first)
  }

  async getFrameAt(time: number): Promise<VideoFrame | null> {
    if (this.sink.samples) return this._enqueue(() => this._sequentialAt(time));
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
      reportDecodeError(err, time);
      return null;
    }
  }

  // ── sequential mode ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Requests are answered one at a time, in the order they arrive: one pass cannot serve two places at once. */
  private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._lock.then(fn, fn);
    this._lock = run.then(() => undefined, () => undefined);
    return run;
  }

  private _covering(time: number): Held | null {
    for (const e of this._frames) {
      if (e.end === null ? (e.req !== undefined && Math.abs(e.req - time) < EPS) : (e.ts <= time + EPS && time < e.end - EPS)) {
        this._frames.splice(this._frames.indexOf(e), 1);       // most recently used last
        this._frames.push(e);
        return e;
      }
    }
    return null;
  }

  private async _sequentialAt(time: number): Promise<VideoFrame | null> {
    try {
      const last = this._lastTime;
      this._lastTime = time;
      const hit = this._covering(time);
      if (hit) return hit.frame;
      // A request far from the last one (a seek, a jump) is answered by one getSample: starting a pass for it would decode ahead for nothing.
      // A pass starts when the requests are next to each other, which is how playback and a drag ask.
      if (last === null || Math.abs(time - last) > JUMP_SECONDS) return await this._single(time);
      const cur = this._cur;
      if (this._iter && cur && time >= cur.ts && time - cur.ts <= JUMP_SECONDS) return await this._advance(time);
      const backwards = !!cur && time < cur.ts;
      return await this._restart(time, backwards ? Math.max(0, time - this._held / 30) : time);       // going back: decode a window behind, so the next steps are held
    } catch (err) {
      reportDecodeError(err, time);
      await this._closeIter();
      return null;
    }
  }

  /** One frame by itself (a seek): getSample, kept so that asking again for the same time costs nothing. The running pass, if any, is closed: it no longer follows the playhead. */
  private async _single(time: number): Promise<VideoFrame | null> {
    await this._closeIter();
    this._cur = null;
    const sample = await this.sink.getSample(time);
    if (!sample) return null;
    const frame = sample.toVideoFrame();
    sample.close?.();
    this._keep({ ts: sample.timestamp, end: null, frame, req: time }, frame);
    return frame;
  }

  /** Start a pass at `time` (a seek and the frames of one group of pictures), keeping what is still held for a step back. */
  private async _restart(time: number, from = time): Promise<VideoFrame | null> {
    await this._closeIter();
    this._cur = null;
    const iter = this.sink.samples!(from);
    this._iter = iter;
    const first = await iter.next();
    if (first.done) { await this._closeIter(); return null; }
    if (first.value.timestamp > time + EPS) { first.value.close?.(); await this._closeIter(); return null; }     // before the first frame, like getSample
    this._take(first.value);
    return this._advance(time);
  }

  /** Run the pass forward until the frame that covers `time` is the current one; the next frame is read ahead (its start is where this one ends). */
  private async _advance(time: number): Promise<VideoFrame | null> {
    const cur = () => this._cur!;
    for (;;) {
      if (!this._next) {
        let r: IteratorResult<SampleLike, void>;
        try { r = await this._iter!.next(); }
        catch (err) {
          // the read-ahead failed: the frame we stand on may still be the right answer (the next one would only have ended it), else there is none
          reportDecodeError(err, time);
          await this._closeIter();
          const prev = this._frames.length > 1 ? this._frames[this._frames.length - 2]! : null;
          const spacing = prev ? cur().ts - prev.ts : 1 / 24;
          return time < cur().ts + spacing - EPS ? cur().frame : null;
        }
        if (r.done) { cur().end = Infinity; this._iter = null; break; }
        this._next = r.value;
      }
      cur().end = this._next.timestamp;
      if (this._next.timestamp <= time + EPS) { const s = this._next; this._next = null; this._take(s); } else break;
    }
    return cur().frame;
  }

  private _take(sample: SampleLike): void {
    const frame = sample.toVideoFrame();
    sample.close?.();
    const entry: Held = { ts: sample.timestamp, end: null, frame };
    this._keep(entry, frame);
    this._cur = entry;
  }

  /** Hold a frame (the first one sets how many fit: a byte budget, not a count) and close the oldest beyond that; the frame the pass stands on is never closed. */
  private _keep(entry: Held, frame: VideoFrame): void {
    if (this._held === 0) {
      const bytes = (frame as unknown as { allocationSize?: () => number }).allocationSize?.() ?? (frame.displayWidth * frame.displayHeight * 1.5);
      this._held = Math.max(MIN_HELD, Math.min(this.capacity, Math.floor(BUDGET_BYTES / Math.max(1, bytes))));
    }
    this._frames.push(entry);
    while (this._frames.length > this._held) {
      const oldest = this._frames.find(e => e !== this._cur && e !== entry);
      if (!oldest) break;
      this._frames.splice(this._frames.indexOf(oldest), 1);
      oldest.frame.close?.();
    }
  }

  private async _closeIter(): Promise<void> {
    const iter = this._iter;
    this._iter = null;
    this._next?.close?.();
    this._next = null;
    if (iter) { try { await iter.return?.(undefined); } catch { /* already done */ } }
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
    for (const e of this._frames) e.frame.close?.();
    this._frames = [];
    this._cur = null;
    this._next?.close?.();
    this._next = null;
    const iter = this._iter;
    this._iter = null;
    void iter?.return?.(undefined);
  }
}
