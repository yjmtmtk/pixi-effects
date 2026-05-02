import { Sprite, Texture, Assets } from 'pixi.js';
import { Sequence } from './Base';
import { FrameCache, type FrameSink } from '../core/FrameCache';
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

  async build(): Promise<void> {
    const data = await Assets.get<VideoAssetData>(this.spec.asset);
    this._sourceDuration = data.duration;
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
      this.duration = this.spec.duration ?? data.duration ?? this.root.duration;
    }

    let currentTime = 0;
    const seq = this;
    Object.defineProperty(sprite, 'currentTime', {
      get(): number { return currentTime; },
      set(v: number) {
        currentTime = v;
        const mySeq = ++seq._drawSeq;
        const lookup = seq.spec.loop && seq._sourceDuration > 0 ? v % seq._sourceDuration : v;
        seq._cache!.getFrameAt(lookup).then(frame => {
          if (mySeq !== seq._drawSeq) return;
          if (!frame || !seq._ctx) return;
          seq._ctx.drawImage(frame, 0, 0);
          texture.source.update();
        });
      },
    });

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline): void {
    super.bindTimeline(timeline);
    const playDuration = this.spec.loop
      ? this.duration!
      : Math.min(this.duration!, this._sourceDuration);
    timeline.fromTo(
      this.target!,
      { currentTime: 0 },
      { currentTime: playDuration, duration: playDuration, ease: 'none' },
      this.at,
    );
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer) return;
    const initialVolume = this.spec.volume ?? 1;
    out.push({
      buffer: this._audioBuffer,
      loop: !!this.spec.loop,
      start: baseTime + this.at,
      end: baseTime + this.at + this.duration!,
      initialVolume,
      volumeKeyframes: [],
    });
  }

  async awaitFrameAt(time: number): Promise<void> {
    const mySeq = ++this._drawSeq;
    const lookup = this.spec.loop && this._sourceDuration > 0 ? time % this._sourceDuration : time;
    const frame = await this._cache!.getFrameAt(lookup);
    if (mySeq !== this._drawSeq) return;
    if (frame && this._ctx) {
      this._ctx.drawImage(frame, 0, 0);
      (this.target as Sprite).texture.source.update();
    }
  }

  override destroy(): void {
    this._cache?.dispose();
    this._cache = null;
    super.destroy();
  }
}
