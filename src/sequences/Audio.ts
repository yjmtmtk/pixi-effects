import { Assets } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeKeyframe } from '../core/Timeline';
import type { AudioSequenceSpec, AudioDescriptor } from '../types';
import type { AudioAssetData } from '../core/AssetLoader';

export class AudioSequence extends Sequence {
  declare spec: AudioSequenceSpec;
  private _audioBuffer: AudioBuffer | null = null;

  async build(): Promise<void> {
    const data = await Assets.get<AudioAssetData>(this.spec.asset);
    this._audioBuffer = data.audioBuffer;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? data.duration ?? this.root.duration;
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
    for (const raw of this.spec.keyframes ?? []) {
      const kf = normalizeKeyframe(raw, dur);
      const set = kf.set as Record<string, number> | undefined;
      const to = kf.to as Record<string, number> | undefined;
      const from = kf.from as Record<string, number> | undefined;
      if (kf.kind === 'set' && set && 'volume' in set) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: set.volume! });
      } else if (kf.kind === 'to' && to && 'volume' in to) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: to.volume! });
      } else if (kf.kind === 'fromTo' && to && 'volume' in to) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: from?.volume ?? initialVolume });
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: to.volume! });
      } else if (kf.kind === 'from' && from && 'volume' in from) {
        volumeKeyframes.push({ time: baseTime + this.at + kf.at, value: from.volume! });
        volumeKeyframes.push({ time: baseTime + this.at + kf.at + kf.duration, value: initialVolume });
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
