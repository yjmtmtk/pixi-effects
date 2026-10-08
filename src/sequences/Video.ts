import { Sprite, Texture, Assets } from 'pixi.js';
import { Sequence } from './Base';
import { FrameCache, type FrameSink } from '../core/FrameCache';
import { sourceLookup } from '../core/sourceTime';
import { describeLayer } from '../core/lint';
import { remapOf, bindClock, clockTable, type TimeRemap } from '../core/remap';
import type { VideoSequenceSpec, AudioDescriptor } from '../types';
import type { VideoAssetData } from '../core/AssetLoader';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export class VideoSequence extends Sequence {
  declare spec: VideoSequenceSpec;
  private _sourceDuration = 0;
  private _audioBuffer: AudioBuffer | null = null;
  private _cache: FrameCache | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _drawSeq = 0;
  /** The playhead value (seconds in the file) the timeline last wrote: already remapped, and local inside a remapped composition. */
  private _cur = 0;
  private _remap: TimeRemap | null = null;
  /** Movie asks this layer to draw the frame its own timeline is at, not the one for a time it computed. */
  readonly selfTimed = true;

  async build(): Promise<void> {
    const data = await Assets.get<VideoAssetData>(this.spec.asset);
    this._sourceDuration = data.duration;
    this._remap = remapOf(this.spec as never, 'currentTime', this._sourceDuration);
    this._audioBuffer = (this.spec.audio !== false) ? data.audioBuffer : null;
    this._cache = new FrameCache(data.sink as unknown as FrameSink, { capacity: 30 });

    const probeFrame = await this._cache.getFrameAt(0);
    const w = probeFrame?.displayWidth ?? 1920;
    const h = probeFrame?.displayHeight ?? 1080;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d', { alpha: true });
    if (probeFrame && this._ctx) this._ctx.drawImage(probeFrame, 0, 0);

    const texture = Texture.from(canvas);
    const sprite = new Sprite({ texture, label: this.spec.name });
    sprite.cullable = true;
    this.target = sprite;
    this.intrinsicWidth = w;
    this.intrinsicHeight = h;

    if (this.duration === undefined) {
      // As long as the file; played at a constant speed it lasts the file's length divided by |speed|.
      const constant = this._remap && this._remap.timeKfs.length === 0 ? Math.abs(this._remap.speed ?? 1) : 1;
      this.duration = this.spec.duration ?? (data.duration ?? this.root.duration * constant) / constant;
    }

    let currentTime = 0;
    const seq = this;
    Object.defineProperty(sprite, 'currentTime', {
      get(): number { return currentTime; },
      set(v: number) {
        currentTime = v;
        seq._cur = v;
        const mySeq = ++seq._drawSeq;
        const lookup = sourceLookup(v, seq._sourceDuration, !!seq.spec.loop);
        seq._cache!.getFrameAt(lookup).then(frame => {
          if (mySeq !== seq._drawSeq) return;
          if (!frame || !seq._ctx) return;
          seq._ctx.drawImage(frame, 0, 0);
          texture.source.update();
        }).catch((err) => {
          // FrameCache._fetch already swallows decoder errors; this is defense
          // in depth against any failure inside the .then handler (e.g.
          // drawImage on a frame that became invalid mid-draw).
          console.warn('pixi-effects: video frame draw failed:', err);
        });
      },
    });

    this.buildFilters();
  }

  protected override displayProps(): { initial: VideoSequenceSpec['initial']; keyframes: VideoSequenceSpec['keyframes'] } {
    const r = this._remap;
    return r ? { initial: r.restInitial as VideoSequenceSpec['initial'], keyframes: r.restKfs } : super.displayProps();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    const at = offset + this.at;
    if (this._remap) {
      // The playhead is a clock the `time` keyframes (or `speed`) run, instead of one straight tween.
      bindClock(timeline, this.target!, 'currentTime', this._remap, this.duration!, at, this.scope() as unknown as Record<string, number>);
      return;
    }
    const playDuration = this.spec.loop
      ? this.duration!
      : Math.min(this.duration!, this._sourceDuration);
    timeline.fromTo(
      this.target!,
      { currentTime: 0 },
      { currentTime: playDuration, duration: playDuration, ease: 'none' },
      at,   // offset = start of the enclosing composition(s); dropping it misplaced videos inside nested compositions
    );
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer) return;
    const initialVolume = this.spec.volume ?? 1;
    const t0 = baseTime + this.at;
    const sourceMap = this._remap
      ? clockTable(this._remap, 'currentTime', this.duration!, t0, this.scope() as unknown as Record<string, number>, t0 + this.duration!).at
      : undefined;
    out.push({
      ...(sourceMap ? { sourceMap } : {}),
      buffer: this._audioBuffer,
      layer: describeLayer(this.spec),
      source: `video "${this.spec.asset}"`,
      loop: !!this.spec.loop,
      start: baseTime + this.at,
      end: baseTime + this.at + this.duration!,
      initialVolume,
      volumeKeyframes: [],
    });
  }

  /** Draw the frame the playhead is at NOW (`_cur`). The argument (a time Movie worked out for layers that need it) is not used. */
  async awaitFrameAt(_time?: number): Promise<void> {
    const time = this._cur;
    if (!this.keepHidden && !this.target?.renderable) return;          // not on screen (a video used as a mask is kept hidden by Pixi and must still draw)
    const mySeq = ++this._drawSeq;
    const lookup = sourceLookup(time, this._sourceDuration, !!this.spec.loop);
    let frame: VideoFrame | null = null;
    try {
      frame = await this._cache!.getFrameAt(lookup);
    } catch (err) {
      // FrameCache should already handle this, but belt-and-suspenders so a
      // sync render path (Movie.gotoFrame) never rejects mid-pipeline.
      console.warn('pixi-effects: awaitFrameAt failed at', time, 's —', err);
      return;
    }
    if (mySeq !== this._drawSeq) return;
    if (frame && this._ctx) {
      try {
        this._ctx.drawImage(frame, 0, 0);
        (this.target as Sprite).texture.source.update();
      } catch (err) {
        console.warn('pixi-effects: drawImage failed at', time, 's —', err);
      }
    }
  }

  override destroy(): void {
    this._cache?.dispose();
    this._cache = null;
    super.destroy();
  }
}
