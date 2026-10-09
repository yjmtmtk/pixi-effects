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
  /** The length of the file in seconds: with `loop`, the start of the file is read before the end comes, so the wrap does not pause. */
  duration?: number;
  loop?: boolean;
}

const BUDGET_BYTES = 96 * 1024 * 1024;
const MIN_HELD = 3;
const JUMP_SECONDS = 1;                 // a request further ahead than this restarts the pass (a seek and a GOP) instead of decoding everything in between
const EPS = 1e-6;
const LOW_BEHIND = 14;
const MIN_HELD_TO_READ_BACK = 20;       // with fewer frames held (big pictures) there is no room to read a window before it is needed: it would push out what is about to be asked
const MIN_HELD_TO_READ_START = 9;                   // reverse play reads the next window when fewer frames than this are held behind the playhead

/** A decoded frame: it starts at `ts` and runs to `end` (null: not known yet; then it answers only the exact time it was asked for, `req`). */
interface Held { ts: number; end: number | null; frame: VideoFrame; req?: number; pinned?: boolean }

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
  private _dir: -1 | 0 | 1 = 0;
  private _gen = 0;
  private _backBusy = false;
  private _backGen = 0;
  private _standbyBusy = false;
  /** A second pass at the start of the file, ready for the moment a looping video comes round. */
  private _standby: { iter: AsyncGenerator<SampleLike, void, unknown>; cur: Held; next: SampleLike | null } | null = null;
  private readonly _duration: number | null;
  private readonly _loop: boolean;
  /** How often it had to wait for a decoder (`restarts`, `singles`) and how many reads ahead it made: for tests and for `check`. */
  readonly stats = { restarts: 0, singles: 0, prefetches: 0 };

  constructor(sink: FrameSink, options: FrameCacheOptions = {}) {
    this.sink = sink;
    this.capacity = options.capacity ?? 30;
    this._duration = options.duration ?? null;
    this._loop = !!options.loop;
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
    const last = this._lastTime;
    this._lastTime = time;
    if (last !== null && Math.abs(time - last) <= JUMP_SECONDS) this._dir = time > last + EPS ? 1 : time < last - EPS ? -1 : this._dir;
    let frame: VideoFrame | null;
    try {
      frame = await this._serve(time, last);
    } catch (err) {
      reportDecodeError(err, time);
      await this._closeIter();
      return null;
    }
    this._maybeReadAhead(time);
    return frame;
  }

  private async _serve(time: number, last: number | null): Promise<VideoFrame | null> {
    const hit = this._covering(time);
    if (hit) return hit.frame;
    // The start of a looping file was read ahead and the loop has come round: carry on from there.
    const sb = this._standby;
    if (sb && time >= sb.cur.ts - EPS && time - sb.cur.ts <= JUMP_SECONDS && (!this._iter || !this._cur || this._cur.ts > time + JUMP_SECONDS)) return await this._adoptStandby(time);
    // A request far from the last one (a seek, a jump) is answered by one getSample: starting a pass for it would decode ahead for nothing.
    // A pass starts when the requests are next to each other, which is how playback and a drag ask.
    if (last === null || Math.abs(time - last) > JUMP_SECONDS) return await this._single(time);
    const cur = this._cur;
    if (this._iter && cur && time >= cur.ts && time - cur.ts <= JUMP_SECONDS) return await this._advance(time);
    const backwards = !!cur && time < cur.ts;
    return await this._restart(time, backwards ? Math.max(0, time - Math.max(1, this._held - 1) / 30) : time);       // going back: decode a window behind that just fits what is held, so the next steps are answered from it
  }

  // ── reading ahead ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  private _maybeReadAhead(time: number): void {
    if (this._held === 0) return;
    if (this._dir === -1) {
      this._dropStandby();
      let behind = 0, passed = 0, earliest = Infinity;
      for (const e of this._frames) { if (e.ts < time - EPS) behind++; else if (e.ts > time + EPS) passed++; if (e.ts < earliest) earliest = e.ts; }
      if (this._held >= MIN_HELD_TO_READ_BACK && behind < LOW_BEHIND && passed >= 3 && earliest > EPS && !this._backBusy) void this._readBack(earliest, passed);
    } else if (this._held >= MIN_HELD_TO_READ_START && this._dir === 1 && this._loop && this._duration !== null && time >= this._duration - JUMP_SECONDS && !this._standby && !this._standbyBusy) {
      void this._readStart();
    }
  }

  /** In the background: the window of frames before the earliest one held (reverse play comes to it next). */
  private async _readBack(earliest: number, room: number): Promise<void> {
    this._backBusy = true;
    this.stats.prefetches++;
    const gen = this._gen, bg = this._backGen;
    const want = Math.max(3, Math.min(Math.floor(this._held * 0.6), room));        // no more than the frames already passed give room for
    let iter: AsyncGenerator<SampleLike, void, unknown> | null = null;
    const got: SampleLike[] = [];
    try {
      iter = this.sink.samples!(Math.max(0, earliest - want / 30));
      for (;;) {
        const r = await iter.next();
        if (r.done) break;
        if (gen !== this._gen || r.value.timestamp >= earliest - EPS) { r.value.close?.(); break; }
        got.push(r.value);
        if (bg !== this._backGen) break;                                        // a window was read in the foreground meanwhile: it covers the same frames
      }
      if (gen === this._gen && bg === this._backGen) {
        for (let k = 0; k < got.length; k++) {
          const s = got[k]!;
          const frame = s.toVideoFrame();
          this._keep({ ts: s.timestamp, end: got[k + 1]?.timestamp ?? earliest, frame }, frame);
        }
      }
    } catch (err) {
      reportDecodeError(err, earliest);
    } finally {
      for (const s of got) s.close?.();
      this._backBusy = false;
      try { await iter?.return?.(undefined); } catch { /* already done */ }
    }
  }

  /** In the background: the first frames of the file and a pass that stands behind them; held (pinned) until the loop comes round. */
  private async _readStart(): Promise<void> {
    this._standbyBusy = true;
    this.stats.prefetches++;
    const gen = this._gen;
    const want = Math.max(3, Math.min(10, Math.floor(this._held / 3)));
    let iter: AsyncGenerator<SampleLike, void, unknown> | null = null;
    const got: SampleLike[] = [];
    let keep = false;
    try {
      iter = this.sink.samples!(0);
      for (; got.length < want + 1;) {
        const r = await iter.next();
        if (r.done) break;
        if (gen !== this._gen) { r.value.close?.(); break; }
        got.push(r.value);
      }
      if (gen === this._gen && got.length >= 2) {
        const next = got.pop()!;
        let cur: Held | null = null;
        got.forEach((s, k) => {
          const frame = s.toVideoFrame();
          s.close?.();
          const entry: Held = { ts: s.timestamp, end: (got[k + 1] ?? next).timestamp, frame, pinned: true };
          this._keep(entry, frame);
          cur = entry;
        });
        got.length = 0;
        if (cur) { this._standby = { iter, cur, next }; keep = true; }
      }
    } catch (err) {
      reportDecodeError(err, 0);
    } finally {
      for (const s of got) s.close?.();
      this._standbyBusy = false;
      if (!keep) { try { await iter?.return?.(undefined); } catch { /* already done */ } }
    }
  }

  private async _adoptStandby(time: number): Promise<VideoFrame | null> {
    const sb = this._standby!;
    this._standby = null;
    await this._closeIter();
    for (const e of this._frames) e.pinned = false;
    this._iter = sb.iter;
    this._next = sb.next;
    this._cur = sb.cur;
    return this._advance(time);
  }

  private _dropStandby(): void {
    const sb = this._standby;
    if (!sb) return;
    this._standby = null;
    sb.next?.close?.();
    for (const e of this._frames.filter(x => x.pinned)) { e.pinned = false; }
    void sb.iter.return?.(undefined);
  }

  /** One frame by itself (a seek): getSample, kept so that asking again for the same time costs nothing. The running pass, if any, is closed: it no longer follows the playhead. */
  private async _single(time: number): Promise<VideoFrame | null> {
    this.stats.singles++;
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
    this.stats.restarts++;
    this._backGen++;
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
      const victim = this._victim(entry);
      if (!victim) break;
      this._frames.splice(this._frames.indexOf(victim), 1);
      victim.frame.close?.();
    }
  }

  /**
   * The frame to let go: one the playhead has already passed (going forward those before it, going back those after it), the furthest
   * behind first; when there is none, the one furthest ahead of the playhead (the last to be needed). Least recently used when the
   * direction is not known. Frames of the standby (pinned) and the frame the pass stands on are never chosen.
   */
  private _victim(except: Held): Held | null {
    const cand = this._frames.filter(e => e !== this._cur && e !== except && !e.pinned);
    if (cand.length === 0) return null;
    if (this._dir === 0) return cand[0]!;
    const at = this._lastTime ?? 0;
    const passed = cand.filter(e => (this._dir === 1 ? e.ts < at - EPS : e.ts > at + EPS));
    const farthest = (list: Held[], sign: number) => list.reduce((a, b) => (sign * (b.ts - a.ts) > 0 ? b : a));
    if (passed.length) return farthest(passed, this._dir === 1 ? -1 : 1);        // forward: the earliest; back: the latest
    return farthest(cand, this._dir === 1 ? 1 : -1);                              // none passed: the one furthest ahead
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
    this._gen++;
    this._dropStandby();
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
