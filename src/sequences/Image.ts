import { Sprite, Assets, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { applyKeyframes, applyInitial, resolveAt } from '../core/Timeline';
import { tweenColor } from '../expr/colorTween';
import type { ColorInput, ColorSpace } from '../expr/colorInterp';
import type { ImageSequenceSpec, Keyframe, Props } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

export class ImageSequence extends Sequence {
  declare spec: ImageSequenceSpec;

  async build(): Promise<void> {
    const texture = await Assets.get<Texture>(this.spec.asset);
    const sprite = new Sprite({ texture, label: this.spec.name });
    sprite.cullable = true;
    this.target = sprite;
    this.intrinsicWidth = texture.width;
    this.intrinsicHeight = texture.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const colorSpace = this.spec.colorSpace;
    if (!colorSpace || colorSpace === 'rgb') {
      // Default path — tint goes through PixiPlugin's native colour
      // interpolation along with everything else.
      super.bindTimeline(timeline, offset);
      return;
    }

    // Custom colour-space path: strip `tint` from the standard pipeline
    // and route it through tweenColor() so the interpolator runs in OKLab
    // / OKLCH instead of linear sRGB.
    const scope = this.scope();
    const initial = stripKeys(this.spec.initial, ['tint']);
    const keyframes = this.spec.keyframes
      ? this.spec.keyframes.map(kf => stripKeysInKeyframe(kf, ['tint']))
      : undefined;
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset);

    // Seed tint from initial.
    const initTint = (this.spec.initial as Record<string, unknown> | undefined)?.tint as ColorInput | undefined;
    if (initTint !== undefined) (this.target as unknown as { tint: ColorInput }).tint = initTint;

    // Walk keyframes and emit a perceptual colour tween for any `tint` key.
    for (const kf of this.spec.keyframes ?? []) {
      const at = offset + resolveAt(kf.at, this.duration!);
      const duration = kf.duration ?? 0;
      const ease = kf.ease ?? 'none';
      const fromTint = (kf.from as Record<string, unknown> | undefined)?.tint as ColorInput | undefined;
      const toTint   = (kf.to   as Record<string, unknown> | undefined)?.tint as ColorInput | undefined;
      const setTint  = (kf.set  as Record<string, unknown> | undefined)?.tint as ColorInput | undefined;
      if (setTint !== undefined) {
        timeline.call(() => { (this.target as unknown as { tint: ColorInput }).tint = setTint; }, [], at);
      }
      if (toTint !== undefined) {
        tweenColor(
          timeline,
          this.target as unknown as Record<string, unknown>,
          'tint',
          fromTint,
          toTint,
          duration, ease, at, colorSpace,
        );
      }
    }

    const startTime = offset + this.at;
    const endTime = startTime + this.duration!;
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }
}

function stripKeys(props: Props | undefined, keys: string[]): Props | undefined {
  if (!props) return props;
  const drop = new Set(keys);
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const k of Object.keys(props)) {
    if (drop.has(k)) { changed = true; continue; }
    out[k] = (props as Record<string, unknown>)[k];
  }
  return changed ? (out as unknown as Props) : props;
}

function stripKeysInKeyframe(kf: Keyframe, keys: string[]): Keyframe {
  return {
    ...kf,
    set: stripKeys(kf.set, keys),
    to: stripKeys(kf.to, keys),
    from: stripKeys(kf.from, keys),
  };
}
