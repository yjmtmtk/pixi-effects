import { Assets } from 'pixi.js';
import { Sequence } from './Base';
import { normalizeKeyframe } from '../core/Timeline';
import { describeLayer } from '../core/lint';
import type { AudioSequenceSpec, AudioAssetSpec, AudioSfxSpec, AudioDescriptor } from '../types';
import type { AudioAssetData } from '../core/AssetLoader';

export class AudioSequence extends Sequence {
  declare spec: AudioSequenceSpec;
  private _audioBuffer: AudioBuffer | null = null;
  private _synth: AudioDescriptor['synth'] | null = null;
  private _source = '';

  async build(): Promise<void> {
    this.target = null;
    if ((this.spec as AudioSfxSpec).sfx !== undefined) return this._buildSfx(this.spec as AudioSfxSpec);
    const spec = this.spec as AudioAssetSpec;
    this._source = `asset "${spec.asset}"`;
    const data = await Assets.get<AudioAssetData>(spec.asset);
    this._audioBuffer = data.audioBuffer;
    if (this.duration === undefined) {
      // One-shot: exactly as long as the clip. Looping: until the composition ends (a loop that stopped
      // after one clip length would not be a loop).
      const rest = Math.max(0, (this.parent?.duration ?? this.root.duration) - this.at);
      this.duration = spec.duration ?? (spec.loop ? rest : data.duration) ?? this.root.duration;
    }
    // Without `loop` the sound simply stops when the file ends — silently.
    if (!spec.loop && data.duration !== undefined && this.duration > data.duration + 0.05) {
      console.warn(
        `pixi-effects: ${describeLayer(spec)}: audio asset "${spec.asset}" is ${data.duration.toFixed(1)}s but the layer lasts ` +
        `${this.duration.toFixed(1)}s, so it goes silent after ${data.duration.toFixed(1)}s. Add loop: true, or shorten the layer's duration.`,
      );
    }
  }

  private async _buildSfx(spec: AudioSfxSpec): Promise<void> {
    const who = describeLayer(spec);
    const raw = spec as unknown as Record<string, unknown>;
    if (raw.asset !== undefined) console.warn(`pixi-effects: ${who}: has both asset and sfx — the sfx plays; remove one`);
    if (raw.loop) console.warn(`pixi-effects: ${who}: loop has no effect on an sfx — to repeat it, add one audio layer per hit (a JS loop)`);
    // The synthesiser is its own chunk: movies without sfx never load it.
    const { resolveSfx, renderSfx, sfxKey } = await import('../audio/sfx');
    const sfx = resolveSfx(spec.sfx, spec.duration, who);
    if (!sfx) return;                                     // warned; the layer stays silent
    this.duration = sfx.length;
    this._source = `sfx "${sfx.preset}"`;
    this._synth = { key: sfxKey(sfx), render: sr => renderSfx(sfx, sr) };
    // lintTiming measured keyframes against the parent's length; an sfx is usually much shorter.
    (spec.keyframes ?? []).forEach((kf, i) => {
      if ((kf.at ?? 0) >= sfx.length) {
        console.warn(`pixi-effects: ${who}: keyframes[${i}] starts at ${kf.at}s, after the sound ends (${sfx.length}s), so it never plays`);
      } else if ((kf.at ?? 0) < 0 && sfx.length + (kf.at ?? 0) < 0) {
        console.warn(`pixi-effects: ${who}: keyframes[${i}] starts ${-(kf.at as number)}s before the END of a ${sfx.length}s sound, which is before the sound begins (a negative \`at\` counts back from the end of the layer). Use a shorter \`at\`, or stretch the sound with \`duration\`.`);
      }
    });
  }

  override bindTimeline(_timeline: unknown): void {
    // Audio has no visual; everything happens at mixdown time via collectAudio.
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    if (!this._audioBuffer && !this._synth) return;
    const initialVolume = this.spec.volume ?? 1;
    const t0 = baseTime + this.at;
    const dur = this.duration!;
    out.push({
      ...(this._audioBuffer ? { buffer: this._audioBuffer } : { synth: this._synth! }),
      layer: describeLayer(this.spec),
      source: this._source,
      loop: !this._synth && !!(this.spec as AudioAssetSpec).loop,
      start: t0,
      end: t0 + dur,
      initialVolume,
      volumeKeyframes: this._volumePoints(t0, dur, initialVolume),
    });
  }

  private _volumePoints(t0: number, dur: number, initialVolume: number): { time: number; value: number }[] {
    const volumeKeyframes: { time: number; value: number }[] = [];
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
    return volumeKeyframes;
  }

  override destroy(): void {
    this._audioBuffer = null;
    this._synth = null;
  }
}
