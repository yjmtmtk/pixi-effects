import { Text } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { normalizeProps } from '../expr/normalizeProps';
import { applyKeyframes, applyInitial, resolveAt } from '../core/Timeline';
import { tweenColor } from '../expr/colorTween';
import type { ColorInput } from '../expr/colorInterp';
import type { TextSequenceSpec, Keyframe, Props } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

const STYLE_OPAQUE_KEYS = ['fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight'];

export class TextSequence extends Sequence {
  declare spec: TextSequenceSpec;

  async build(): Promise<void> {
    const baseStyle = {
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      align: 'center' as const,
    };
    const text = new Text({
      text: this.spec.text ?? '',
      style: baseStyle,
      label: this.spec.name,
    });
    text.cullable = true;
    this.target = text;
    this.intrinsicWidth = text.width;
    this.intrinsicHeight = text.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    if (this.spec.style) {
      const scope = this.scope();
      const resolved = normalizeProps(
        this.spec.style as Record<string, unknown>,
        scope as unknown as Record<string, number>,
        { skipKeys: STYLE_OPAQUE_KEYS },
      );
      for (const k of Object.keys(resolved)) {
        (text.style as unknown as Record<string, unknown>)[k] = (resolved as Record<string, unknown>)[k];
      }
    }
    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const colorSpace = this.spec.colorSpace ?? 'rgb';
    // Run the standard pipeline with `fill` stripped — text doesn't have a
    // top-level `fill` property (it lives on `style`), so leaving it in
    // would make GSAP warn about an unknown prop. Then route fill through
    // our per-frame text.style.fill update, with optional perceptual
    // interpolation.
    const stripped = stripFill(this.spec);
    runSuperWithStrippedSpec(this, stripped, timeline, offset);
    bindFillKeyframes(timeline, this.target as Text, this.spec.keyframes ?? [], this.duration!, offset, colorSpace);
  }
}

// Helper: temporarily swap in a fill-stripped spec, run the base
// bindTimeline, restore. Cheaper than reimplementing the entire base
// behaviour.
function runSuperWithStrippedSpec(
  inst: TextSequence,
  strippedSpec: TextSequenceSpec,
  timeline: Timeline,
  offset: number,
): void {
  const originalSpec = inst.spec;
  (inst as unknown as { spec: TextSequenceSpec }).spec = strippedSpec;
  try {
    Sequence.prototype.bindTimeline.call(inst, timeline, offset);
  } finally {
    (inst as unknown as { spec: TextSequenceSpec }).spec = originalSpec;
  }
}

function stripFill(spec: TextSequenceSpec): TextSequenceSpec {
  return {
    ...spec,
    initial: stripKey(spec.initial, 'fill'),
    keyframes: spec.keyframes
      ? spec.keyframes.map(kf => ({
          ...kf,
          set: stripKey(kf.set, 'fill'),
          to: stripKey(kf.to, 'fill'),
          from: stripKey(kf.from, 'fill'),
        }))
      : undefined,
  };
}

function stripKey(props: Props | undefined, key: string): Props | undefined {
  if (!props) return props;
  if (!(key in props)) return props;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(props)) if (k !== key) out[k] = (props as Record<string, unknown>)[k];
  return out as unknown as Props;
}

// Walk the keyframes and emit colour tweens for any `fill` mutation.
// Updates `text.style.fill` directly; PIXI v8 marks the text dirty on
// style mutation, so the fill change is rendered on the next frame.
function bindFillKeyframes(
  timeline: Timeline,
  text: Text,
  keyframes: Keyframe[],
  parentDuration: number,
  offset: number,
  colorSpace: 'rgb' | 'oklab' | 'oklch',
): void {
  // Mirror state object so tweenColor has somewhere consistent to write.
  // We then mirror back to text.style.fill in the onUpdate callback.
  const state: { fill?: ColorInput } = { fill: text.style.fill as ColorInput | undefined };
  const writeFill = (): void => { text.style.fill = state.fill as never; };

  for (const kf of keyframes) {
    const at = offset + resolveAt(kf.at, parentDuration);
    const duration = kf.duration ?? 0;
    const ease = kf.ease ?? 'none';
    const setFill  = pickFill(kf.set);
    const fromFill = pickFill(kf.from);
    const toFill   = pickFill(kf.to);

    if (setFill !== undefined) {
      timeline.call(() => { state.fill = setFill; writeFill(); }, [], at);
    }
    if (toFill !== undefined) {
      tweenColor(
        timeline,
        state as unknown as Record<string, unknown>,
        'fill',
        fromFill,
        toFill,
        duration, ease, at, colorSpace,
        writeFill,
      );
    }
  }
}

function pickFill(props: Props | undefined): ColorInput | undefined {
  if (!props) return undefined;
  const v = (props as Record<string, unknown>).fill;
  if (typeof v === 'string' || typeof v === 'number') return v as ColorInput;
  return undefined;
}
