import { Text } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { normalizeProps } from '../expr/normalizeProps';
import { applyKeyframes, applyInitial, resolveAt, loopVars } from '../core/Timeline';
import { revertibleSet } from '../core/revertibleSet';
import { tweenColor } from '../expr/colorTween';
import type { ColorInput } from '../expr/colorInterp';
import type { TextSequenceSpec, Keyframe, Props } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

const STYLE_OPAQUE_KEYS = ['fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight'];

type ValueState = { value: number };

function formatValue(v: number, f: TextSequenceSpec['format']): string {
  const fixed = v.toFixed(Math.max(0, Math.floor(f?.decimals ?? 0)));
  if (!f?.grouping) return fixed;
  const [int, frac] = fixed.split('.') as [string, string | undefined];
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? '.' + frac : '');
}

export class TextSequence extends Sequence {
  declare spec: TextSequenceSpec;
  /** Current number for the `{value}` placeholder (tweened by `value` keyframes). */
  private _value: ValueState = { value: 0 };
  private _lastText = '';

  /** Rewrite the displayed string from the template and the current `value`. */
  private _refreshText(): void {
    const template = this.spec.text ?? '';
    if (!template.includes('{value}')) return;
    const next = template.split('{value}').join(formatValue(this._value.value, this.spec.format));
    if (next === this._lastText) return;
    this._lastText = next;
    (this.target as Text).text = next;
  }

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
      // Re-measure: `w` / `h` in expressions must describe the STYLED text.
      this.intrinsicWidth = text.width;
      this.intrinsicHeight = text.height;
    }
    // `{value}` counter: seed the number from initial.value and print it.
    const initialValue = (this.spec.initial as Record<string, unknown> | undefined)?.value;
    if (initialValue !== undefined) this._value.value = resolveNumber(initialValue, this.scope());
    this._refreshText();
    if (this._lastText !== '') {
      this.intrinsicWidth = text.width;
      this.intrinsicHeight = text.height;
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
    // `value` (the counter) is likewise not a property of the Text object.
    const stripped = stripKeys(this.spec, ['fill', 'value']);
    runSuperWithStrippedSpec(this, stripped, timeline, offset);
    bindFillKeyframes(timeline, this.target as Text, this.spec.keyframes ?? [], this.duration!, offset + this.at, colorSpace);
    bindValueKeyframes(timeline, this._value, () => this._refreshText(), this.spec.keyframes ?? [], this.duration!, offset + this.at, this.scope());
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

function stripKeys(spec: TextSequenceSpec, keys: string[]): TextSequenceSpec {
  return {
    ...spec,
    initial: stripProps(spec.initial, keys),
    keyframes: spec.keyframes
      ? spec.keyframes.map(kf => ({
          ...kf,
          set: stripProps(kf.set, keys),
          to: stripProps(kf.to, keys),
          from: stripProps(kf.from, keys),
        }))
      : undefined,
  };
}

function stripProps(props: Props | undefined, keys: string[]): Props | undefined {
  if (!props) return props;
  if (!keys.some(k => k in props)) return props;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(props)) if (!keys.includes(k)) out[k] = (props as Record<string, unknown>)[k];
  return out as unknown as Props;
}

function resolveNumber(v: unknown, scope: unknown): number {
  if (typeof v === 'number') return v;
  const out = normalizeProps({ v }, scope as unknown as Record<string, number>).v;
  return typeof out === 'number' ? out : Number(out) || 0;
}

// Tween the `{value}` counter. Mirrors the other keyframe kinds (set / to / from / from+to),
// honours ease and repeat/yoyo, and calls `refresh` after every update so the text re-renders.
function bindValueKeyframes(
  timeline: Timeline,
  state: ValueState,
  refresh: () => void,
  keyframes: Keyframe[],
  parentDuration: number,
  origin: number,
  scope: unknown,
): void {
  for (const kf of keyframes) {
    const setV = kf.set?.value;
    const fromV = kf.from?.value;
    const toV = kf.to?.value;
    if (setV === undefined && fromV === undefined && toV === undefined) continue;
    const at = origin + resolveAt(kf.at, parentDuration);
    const duration = kf.duration ?? 0;
    const ease = kf.ease ?? 'none';
    const loop = loopVars(kf);
    if (setV !== undefined) {
      const v = resolveNumber(setV, scope);
      revertibleSet(timeline, at, () => state.value, n => { state.value = n; refresh(); }, v);
    }
    if (toV !== undefined && fromV !== undefined) {
      timeline.fromTo(state, { value: resolveNumber(fromV, scope) },
        { value: resolveNumber(toV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    } else if (toV !== undefined) {
      timeline.to(state, { value: resolveNumber(toV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    } else if (fromV !== undefined) {
      timeline.from(state, { value: resolveNumber(fromV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    }
  }
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
      revertibleSet(timeline, at, () => state.fill, c => { state.fill = c; writeFill(); }, setFill);
    }
    if (toFill !== undefined) {
      tweenColor(
        timeline,
        state as unknown as Record<string, unknown>,
        'fill',
        fromFill,
        toFill,
        duration, ease, at, colorSpace,
        writeFill, loopVars(kf),
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
