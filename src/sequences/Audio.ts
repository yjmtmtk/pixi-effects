import { Assets } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeKeyframe } from '../core/Timeline';
import { describeLayer } from '../core/lint';
import type { AudioSequenceSpec, AudioDescriptor } from '../types';
import type { AudioAssetData } from '../core/AssetLoader';

export class AudioSequence extends Sequence {
  declare spec: AudioSequenceSpec;
  private _audioBuffer: AudioBuffer | null = null;

  async build(): Promise<void> {
    const data = await Assets.get<AudioAssetData>(this.spec.asset);
    this._audioBuffer = data.audioBuffer;
    if (this.duration === undefined) {
      // One-shot: exactly as long as the clip. Looping: until the composition ends (a loop that stopped
      // after one clip length would not be a loop).
      const rest = Math.max(0, (this.parent?.duration ?? this.root.duration) - this.at);
      this.duration = this.spec.duration ?? (this.spec.loop ? rest : data.duration) ?? this.root.duration;
    }
    // Without `loop` the sound simply stops when the file ends — silently.
    if (!this.spec.loop && data.duration !== undefined && this.duration > data.duration + 0.05) {
      console.warn(
        `pixi-effects: ${describeLayer(this.spec)}: audio asset "${this.spec.asset}" is ${data.duration.toFixed(1)}s but the layer lasts ` +
        `${this.duration.toFixed(1)}s, so it goes silent after ${data.duration.toFixed(1)}s. Add loop: true, or shorten the layer's duration.`,
      );
    }
    this.target = null;
  }

  override bindTimeline(_timeline: unknown): void {
    // Audio has no visual; everything happens at mixdown time via collectAudio.
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer) return;
    const initialVolume = this.spec.volume ?? 1;
    const volumeKeyframes: { time: number; value: number }[] = [];
    const dur = this.duration!;
    const t0 = baseTime + this.at;
    // The mixer ramps linearly from the PREVIOUS event to each point. So, like every other keyframe, a
    // volume change must (1) hold the value it has until its own start (a point at `start` with the
    // current value) and (2) jump with two points at the same time. Keyframes are applied in time order.
    const keyframes = (this.spec.keyframes ?? [])
      .map(raw => normalizeKeyframe(raw, dur))
      .filter(kf => [kf.set, kf.to, kf.from].some(p => p && 'volume' in p))
      .sort((x, y) => x.at - y.at);
    let current = initialVolume;
    const point = (time: number, value: number): void => { volumeKeyframes.push({ time, value }); };
    for (const kf of keyframes) {
      const start = t0 + kf.at;
      const end = start + kf.duration;
      const set = (kf.set as Record<string, number> | undefined)?.volume;
      const to = (kf.to as Record<string, number> | undefined)?.volume;
      const from = (kf.from as Record<string, number> | undefined)?.volume;
      point(start, current);                               // hold until the keyframe starts
      if (kf.kind === 'set' && set !== undefined) {
        point(start, set);
        current = set;
      } else if (kf.kind === 'to' && to !== undefined) {
        point(end, to);
        current = to;
      } else if (kf.kind === 'fromTo' && to !== undefined) {
        point(start, from ?? current);
        point(end, to);
        current = to;
      } else if (kf.kind === 'from' && from !== undefined) {
        point(start, from);
        point(end, current);                               // back to the value it had
      }
    }
    out.push({
      buffer: this._audioBuffer,
      loop: !!this.spec.loop,
      start: baseTime + this.at,
      end: baseTime + this.at + dur,
      initialVolume,
      volumeKeyframes,
    });
  }

  override destroy(): void {
    this._audioBuffer = null;
  }
}
